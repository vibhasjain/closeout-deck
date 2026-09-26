import type { ClaudeEvent, RunOptions } from './claude.ts'
import { AGENT_ERROR } from './claude.ts'
import type { DataService } from './data.ts'
import { validateFact } from './datastore.ts'
import { isPlainObject } from './validation.ts'
import { GOALS, SCRIBE_ACTIONS } from './prompts.ts'
import { knownFirmClients, validFirmName } from './firmName.ts'

export type DataEvent = ClaudeEvent | { ingest: { fileId: string; status: 'normalized' | 'needs_mapping'; entries?: number; rows?: number; unparsed?: number; cycles?: string[]; gaps?: unknown[]; errors?: string[] } } | { facts: { applied: number; cycles: string[] } }
function blocks(text: string, kind: 'mapping' | 'action'): unknown[] {
  return [...text.matchAll(new RegExp('```' + kind + '\\s*\\n?([\\s\\S]*?)```', 'g'))].map(match => {
    try { return JSON.parse(match[1]) as unknown } catch { return null }
  })
}

const goal = (value: unknown): value is string => (GOALS as readonly unknown[]).includes(value)

/** mode:scribe output contract: allowed action blocks only, then one next line (the model's, else the first uncovered goal). */
export function scribeOutput(reply: string, uncovered: unknown): string {
  const actions = blocks(reply, 'action').filter(action => isPlainObject(action) && SCRIBE_ACTIONS.includes(action.type as string))
  const said = /^next:\s*(\w+)\s*$/im.exec(reply.replace(/```[\s\S]*?```/g, ''))?.[1]
  const next = said === 'none' || goal(said) ? said : Array.isArray(uncovered) && goal(uncovered[0]) ? uncovered[0] : 'none'
  return [...actions.map(action => '```action\n' + JSON.stringify(action) + '\n```'), `next: ${next}`].join('\n')
}

/** mode:delegate is spoken aloud: card and mapping fences never pass. Action blocks stay for the client to apply. */
export function spokenAnswer(reply: string): string {
  return reply.replace(/```(?:card|mapping)\b[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** The terminal event is held until all validated data writes and workspace refreshes finish. */
export async function runDataTurn(input: {
  options: Omit<RunOptions, 'onEvent'>; runAgent: (options: RunOptions) => Promise<void>
  service: DataService; email: string; doc: Record<string, unknown>; fileIds?: string[]
  sync: () => Promise<unknown>; emit: (event: DataEvent) => void
  /** Held only while this turn writes data, so the desk's own data requests never wait on the model. */
  lock?: () => Promise<() => void>
}): Promise<void> {
  const { options, service, email, doc, emit } = input
  const pending = new Set(input.fileIds ?? [])
  const traces = new Set<string>()
  let dataTraces = 0
  let held: Extract<ClaudeEvent, { done: true }> = { done: true, sessionId: '', error: AGENT_ERROR }
  let allText = '', message = options.message, changed = false, applied = 0, turns = 0, sanitized = false, firmSanitized = false
  const factCycles = new Set<string>(), deadline = Date.now() + (options.timeoutMs ?? 180_000)
  const failures = new Map<string, string[]>()
  for (let attempt = 0; attempt < 2; attempt++) {
    turns++
    let streamed = '', terminal: Extract<ClaudeEvent, { done: true }> | undefined
    await input.runAgent({ ...options, message, timeoutMs: Math.max(1, deadline - Date.now()), onEvent(event) {
      if (options.signal?.aborted) return
      if ('done' in event) terminal = event
      else if ('trace' in event) {
        const data = !event.trace.startsWith('Read handbooks/')
        if (!traces.has(event.trace) && (!data || dataTraces < 3)) {
          traces.add(event.trace); if (data) dataTraces++; emit(event)
        }
      }
      else { streamed += event.text; emit(event) }
    } })
    if (options.signal?.aborted) return
    held = terminal ?? { done: true, sessionId: held.sessionId, error: AGENT_ERROR }
    const reply = held.final ?? streamed
    if (!streamed && reply) emit({ text: reply })
    const firmClients = knownFirmClients(doc.firm)
    if (blocks(reply, 'action').some(raw => isPlainObject(raw) && raw.type === 'set_firm')) {
      const [facts, sources] = await Promise.all([service.store.listFacts(email), service.store.listSources(email)])
      firmClients.push(...facts.filter(fact => fact.kind === 'site').map(fact => fact.key), ...sources.flatMap(source => source.site ? [source.site] : []))
    }
    const safeReply = reply.replace(/```action\s*\n?([\s\S]*?)```/g, (block: string, json: string) => {
      try {
        const raw: unknown = JSON.parse(json)
        if (isPlainObject(raw) && raw.type === 'set_firm' && isPlainObject(raw.patch) && 'name' in raw.patch && !validFirmName(raw.patch.name, firmClients)) {
          const patch = { ...raw.patch }
          delete patch.name
          firmSanitized = true
          return Object.keys(patch).length ? '```action\n' + JSON.stringify({ ...raw, patch }) + '\n```' : ''
        }
        if (isPlainObject(raw) && raw.type === 'set_fact') {
          const fact = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'type'))
          if (!validateFact(fact).ok) { sanitized = true; return '' }
        }
      } catch { if (json.includes('set_fact')) { sanitized = true; return '' } }
      return block
    })
    allText += (allText ? '\n\n' : '') + safeReply
    if (held.error) break
    const release = input.lock ? await input.lock() : () => {}
    try {
      for (const raw of blocks(reply, 'action')) {
        if (!isPlainObject(raw) || raw.type !== 'set_fact') {
          if (raw === null) console.warn('Ignored malformed agent action JSON')
          continue
        }
        const fact = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'type'))
        if (!validateFact(fact).ok) { console.warn('Ignored invalid agent set_fact'); continue }
        const result = await service.setFact(email, fact, doc, new Date(), 'agent')
        result.cycles.forEach(id => factCycles.add(id)); applied++; changed = true
      }
      if (!pending.size) break
      const mappings = blocks(reply, 'mapping')
      for (const id of pending) failures.set(id, ['No mapping was supplied; clarification is needed'])
      for (const raw of mappings) {
        if (!isPlainObject(raw) || typeof raw.file !== 'string' || !pending.has(raw.file)) {
          for (const id of pending) failures.set(id, ['Mapping must be valid JSON and name a requested file'])
          continue
        }
        const result = await service.applyAgentMapping(email, raw.file, raw, doc)
        if (!result.ok) { failures.set(raw.file, result.errors); continue }
        changed = true
        // One accepted layout may normalize several requested files at once.
        for (const id of [...pending]) {
          const file = await service.store.getFile(email, id)
          if (file?.status !== 'normalized') continue
          emit({ ingest: { fileId: id, status: 'normalized', entries: file.entryCount ?? 0, rows: file.rowCount ?? 0, unparsed: file.unparsed.length, cycles: result.cycles, gaps: result.gaps } })
          pending.delete(id); failures.delete(id)
        }
      }
      if (!pending.size || !mappings.length || attempt === 1 || Date.now() >= deadline) break
      if (changed) await input.sync()
    } finally { release() }
    emit({ text: '\n\n' })
    message = [...pending].map(id => `Mapping for ${id} rejected:\n${(failures.get(id) ?? []).join('\n')}`).join('\n\n')
      + '\nReply with a corrected mapping block for each pending file. If the layout is genuinely ambiguous, ask one question with a P6 card and emit no mapping.'
  }
  if (options.signal?.aborted) return
  if (changed) await input.sync()
  for (const fileId of pending) emit({ ingest: { fileId, status: 'needs_mapping', errors: failures.get(fileId) ?? ['The mapping turn did not complete'] } })
  if (applied) emit({ facts: { applied, cycles: [...factCycles] } })
  // Validation feedback is not a replacement agent answer. A bad fact must not hide valid actions or cause
  // another turn with the same bad output; this bare action fails client validation, so the app shows its
  // human skipped note with a retry instead of an Applied line.
  if (sanitized) allText += '\n\n```action\n' + JSON.stringify({ type: 'set_fact' }) + '\n```'
  emit({ ...held, ...(sanitized || firmSanitized || (allText && (held.final !== undefined || turns > 1)) ? { final: allText } : {}) })
}
