import { randomBytes } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { RULES } from '../../src/bench/engine.js'
import type { RunOptions } from './claude.ts'
import { DataError } from './data.ts'
import type { DataStore } from './datastore.ts'
import type { JourneyStore } from './journeyStore.ts'
import {
  KINDS, RULE_IDS, cleanText, live, newInstinctId, normalizeText, planOps, proposalText, proposals, publicInstinct, textConflict, validRuleId, validUntil,
} from './memoryStore.ts'
import type { InstinctRow, Kind, MemoryRun, MemoryStore, Source, Trigger } from './memoryStore.ts'
import { memoryConsolidationPrompt } from './prompts.ts'
import { KeyedMutex } from './queue.ts'
import type { GlobalSemaphore } from './queue.ts'
import { isPlainObject, ValidationError } from './validation.ts'
import { callMarkdown } from './workspace.ts'

export const CHAT_THROTTLE_MS = 600_000
export const MAX_BATCH = 10
export const MEMORY_TIMEOUT_MS = 120_000
const MAX_BODY = 8_192

// Memory writes from routes and from consolidation share this per-account lock, so a forget cannot land
// between a consolidation's validation and its writes (single process, like KeyedMutex itself).
const memoryLocks = new KeyedMutex()
async function locked<T>(email: string, work: () => Promise<T>): Promise<T> {
  const release = await memoryLocks.acquire(email)
  try { return await work() } finally { release() }
}

const newest = (a: InstinctRow, b: InstinctRow) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()
/** Lines up to about 15,000 tokens; past that the complete list is in the snapshot workspace's memory/ files. */
function capped(lines: string[], file: string): string[] {
  let bytes = 0
  const kept: string[] = []
  for (const line of lines) {
    bytes += Buffer.byteLength(line) + 1
    if (bytes > 60_000) return [...kept, `${lines.length - kept.length} more are in ${file}; read it before you add anything.`]
    kept.push(line)
  }
  return kept
}

interface Item { trigger: Trigger; ref: string | null; firm?: Record<string, unknown> }
export interface MemoryDeps {
  env: NodeJS.ProcessEnv
  runAgent: (options: RunOptions) => Promise<void>
  capacity: GlobalSemaphore
  memory: () => MemoryStore
  data: () => DataStore
  journey: () => JourneyStore
  /** The consolidation's own snapshot workspace, never the chat workspace a running turn reads. */
  workspace: (email: string) => Promise<string>
  /** The account's own calendar today (YYYY-MM-DD), the day the one-pager renders against. */
  today: (email: string) => Promise<string>
  timeoutMs?: number
}
/** Runs that read the chat since the last such run; only they advance the chat cursor. */
const consumesChat = (trigger: Trigger) => trigger === 'chat' || trigger === 'send'

/**
 * Consolidation writes durable memory in the background. Each run is a fresh CLI session (never the user's chat
 * session), one run per account is in flight, and later triggers collapse into one follow-up run.
 */
export function createMemory(deps: MemoryDeps) {
  const accounts = new Map<string, { next: Item[]; done: Promise<void>; abort: AbortController }>()
  const lastChat = new Map<string, number>()

  /** Fire-and-forget: never throws; the promise settles when this account's runs are done (tests, live proofs). */
  function consolidateMemory(email: string, trigger: Trigger, ref: string | null = null, firm?: Record<string, unknown>): Promise<void> {
    const key = email.trim().toLowerCase()
    if (trigger === 'chat') {
      const last = lastChat.get(key)
      if (last !== undefined && Date.now() - last < CHAT_THROTTLE_MS) return Promise.resolve()
      lastChat.set(key, Date.now())
    }
    const item: Item = { trigger, ref, ...(firm ? { firm } : {}) }
    const busy = accounts.get(key)
    if (busy) {
      // Every distinct trigger is kept; they run as follow-up batches of at most MAX_BATCH.
      if (!busy.next.some(other => other.trigger === trigger && other.ref === ref)) busy.next.push(item)
      return busy.done
    }
    const state = { next: [item], done: Promise.resolve(), abort: new AbortController() }
    accounts.set(key, state)
    state.done = (async () => {
      try { while (state.next.length) await runOnce(email, state.next.splice(0, MAX_BATCH), state.abort.signal) }
      finally { accounts.delete(key) }
    })()
    return state.done
  }

  async function material(email: string, items: Item[], since: string | null): Promise<string | null> {
    const sections: string[] = []
    for (const item of items) {
      if (item.trigger === 'site' && item.firm) {
        sections.push(`## Material: the firm pre-read of ${item.ref}, inferred from its website\n${JSON.stringify({ ...item.firm, icon: undefined })}`)
      }
      if (item.trigger === 'call' && item.ref) {
        const call = await deps.data().getCall(email, item.ref)
        if (call?.transcript.some(line => line.role === 'user')) sections.push(`## Material: call transcript (calls/${call.id}.md)\n${callMarkdown(call)}`)
      }
      if (item.trigger === 'send' && item.ref) {
        const decisions = await deps.journey().listDecisions(email, item.ref)
        if (decisions.length) sections.push(`## Material: decisions on the ${item.ref} Payroll run that was just sent\n` + decisions.map(d => {
          const rule = RULES.find(r => r.id === d.groupId)
          return `- ${d.groupId}${rule ? ` (${rule.sentence})` : ''}: ${d.decision}${d.reason ? `; reason: ${oneLine(d.reason)}` : ''} (by ${d.by}, ${d.at.slice(0, 10)})`
        }).join('\n'))
      }
    }
    if (items.some(item => item.trigger === 'send' || item.trigger === 'chat')) {
      const after = since ? Date.parse(since) : 0
      const chat = (await deps.data().listChat(email)).filter(line => line.at > after && line.text.trim()).slice(-40)
      if (chat.length) sections.push('## Material: chat since the last memory run\n' + chat.map(line =>
        `${line.role === 'user' ? 'User' : 'Closeout Agent'}: ${oneLine(line.text.replace(/```card[\s\S]*?```/g, '')).slice(0, 600)}`).join('\n'))
    }
    return sections.length ? sections.join('\n\n') : null
  }

  async function runOnce(email: string, batch: Item[], signal: AbortSignal): Promise<void> {
    // A chat-reading trigger goes first, so the recorded trigger marks every run that consumed the chat (the cursor below).
    const items = [...batch].sort((a, b) => Number(consumesChat(b.trigger)) - Number(consumesChat(a.trigger)))
    const sources = [...new Set(items.map(item => item.trigger))] as Source[]
    const refs = [...new Set(items.map(item => item.ref).filter(ref => ref !== null))]
    const run: MemoryRun = { id: `mr_${randomBytes(8).toString('hex')}`, trigger: items[0].trigger, ref: refs.join(',') || null,
      startedAt: new Date().toISOString(), finishedAt: null, ops: [], dropped: [], error: null }
    let store: MemoryStore | undefined
    try {
      store = deps.memory()
      // The chat cursor advances only on a finished run that read the chat, never on an unrelated call or site run.
      const since = items.some(item => consumesChat(item.trigger))
        ? (await store.listRuns(email, 20, ['chat', 'send'])).find(r => r.finishedAt && !r.error)?.startedAt ?? null : null
      const text = await material(email, items, since)
      if (!text) { run.error = 'no_material'; return }
      // Never through the chat UserQueue (one waiter): it would 429 or stall behind chat turns.
      const cwd = await deps.workspace(email)
      const rows = await store.listInstincts(email)
      const current = rows.filter(live).sort(newest), gone = rows.filter(row => row.status === 'forgotten').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const today = await deps.today(email)
      const message = [`Today: ${today}`,
        `Trigger: ${items.map(item => item.trigger + (item.ref ? ` (${item.ref})` : '')).join(', ')}`, '',
        '## Current instincts (id · kind · status · source · date: text)',
        ...(current.length ? capped(current.map(row => `- ${row.id} · ${row.kind} · ${row.status} · ${row.source} · ${row.at.slice(0, 10)}${row.until ? ` · until ${row.until}` : ''}: ${row.text}`), 'memory/instincts.md') : ['None yet.']), '',
        '## Forgotten (the user asked to forget these; never add them back)', ...(gone.length ? capped(gone.map(row => `- ${row.text}`), 'memory/forgotten.md') : ['None.']), '', text].join('\n')
      let reply = '', failed = false
      const releaseCapacity = await deps.capacity.acquire(signal)
      try {
        await deps.runAgent({ cwd, message, prompt: memoryConsolidationPrompt(sources), fresh: true, env: deps.env, signal,
          model: deps.env.CLOSEOUT_AGENT_MODEL ?? 'opus', timeoutMs: deps.timeoutMs ?? MEMORY_TIMEOUT_MS,
          onEvent(event) {
            if ('text' in event) reply += event.text
            else if ('done' in event) { if (event.error) failed = true; else if (event.final !== undefined) reply = event.final }
          } })
      } finally { releaseCapacity() }
      if (signal.aborted) { run.error = 'cancelled'; return }
      if (failed) { run.error = 'agent_failed'; return }
      const blocks = [...reply.matchAll(/```memory\s*\n?([\s\S]*?)```/g)]
      let parsed: unknown
      try { parsed = JSON.parse(blocks.at(-1)?.[1] ?? '') } catch { /* reported below */ }
      if (!isPlainObject(parsed) || !Array.isArray(parsed.ops)) { run.error = 'invalid_output'; return }
      const ops = parsed.ops
      await locked(email, async () => {
        // Validate against the rows as they are now, not the prompt's snapshot: a forget during the run still sticks.
        const { plan, dropped } = planOps(ops, await store!.listInstincts(email), { sources, today })
        run.dropped = dropped
        for (const step of plan) {
          if (step.op === 'add') {
            await store!.insertInstinct(email, step.row)
            const { id, kind, text: fact, status, source, until, ruleId } = step.row
            run.ops.push({ op: 'add', id, kind, text: fact, status, source, until, ruleId })
          } else if (step.op === 'replace') {
            if (await store!.replaceInstinct(email, step.id, step.row)) run.ops.push({ op: 'replace', id: step.id, newId: step.row.id, text: step.row.text, until: step.row.until, ...(step.merged ? { merged: true } : {}) })
            else run.dropped.push({ op: { op: 'replace', id: step.id, text: step.row.text }, reason: 'unknown_id' })
          } else if (await store!.updateInstinct(email, step.id, { status: 'forgotten', updatedAt: new Date().toISOString() }, ['active', 'pending'])) {
            run.ops.push({ op: 'expire', id: step.id })
          } else run.dropped.push({ op: { op: 'expire', id: step.id }, reason: 'unknown_id' })
        }
      })
    } catch (error) {
      run.error = (error instanceof Error ? error.message : 'memory_run_failed').slice(0, 200)
      console.error('Memory consolidation failed:', run.error)
    } finally {
      run.finishedAt = new Date().toISOString()
      console.log(`Memory run ${run.id} ${run.trigger}${run.ref ? ` ${run.ref}` : ''}: ${run.ops.length} applied, ${run.dropped.length} dropped${run.error ? `, error ${run.error}` : ''}`)
      await store?.saveRun(email, run).catch((error: unknown) => console.error('Memory run not recorded:', error instanceof Error ? error.message : 'Error'))
    }
  }

  /** Settles once no account has a run in flight or queued. */
  async function settled(): Promise<void> {
    while (accounts.size) await Promise.all([...accounts.values()].map(state => state.done))
  }

  /** Start over: drop the account's queued triggers and stop its running consolidation; settles once that run has recorded. */
  async function cancel(email: string): Promise<void> {
    const key = email.trim().toLowerCase(), state = accounts.get(key)
    lastChat.delete(key)
    if (!state) return
    state.next.length = 0
    state.abort.abort()
    await state.done
  }

  return { consolidateMemory, settled, cancel }
}

export type Consolidate = ReturnType<typeof createMemory>['consolidateMemory']

// ---- Routes (session email only; JSON bodies capped at 8KB) -------------------------------------

export interface MemoryRequest {
  method: string; path: string; email: string; response: ServerResponse
  readBody: (maxBytes: number) => Promise<unknown>
  memory: MemoryStore; journey: JourneyStore; consolidate: Consolidate
  /** The account's own calendar today (YYYY-MM-DD), read only when a request carries until. */
  today: () => Promise<string>
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}
function fields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!isPlainObject(value) || Object.keys(value).some(key => !keys.includes(key))) throw new ValidationError()
  return value
}
const absent = (value: unknown) => value === undefined || value === null
function text(value: unknown): string {
  const cleaned = cleanText(value)
  if (!cleaned) throw new ValidationError()
  return cleaned
}
async function until(value: unknown, today: () => Promise<string>): Promise<string | null> {
  if (absent(value)) return null
  if (!validUntil(value, await today())) throw new ValidationError()
  return value as string
}
const INSTINCT_ID = /^i_[0-9a-f]{16}$/
type Written = { conflict?: 'tombstone' | 'duplicate'; row?: InstinctRow | null }

/** Returns false when the path is not a memory route. */
export async function handleMemory(req: MemoryRequest): Promise<boolean> {
  const { method, path, email, response } = req
  let match: RegExpExecArray | null
  if (path === '/memory' && method === 'GET') {
    const [rows, decisions, runs] = await Promise.all([req.memory.listInstincts(email), req.journey.listDecisions(email), req.memory.listRuns(email, 5)])
    const last = runs.find(run => run.finishedAt)
    // A proposal whose text is already known or was forgotten has nothing to offer.
    json(response, 200, { instincts: rows.filter(live).sort(newest).map(publicInstinct), proposals: proposals(decisions, rows).filter(p => !textConflict(proposalText(p), rows)),
      lastRun: last ? { trigger: last.trigger, finishedAt: last.finishedAt, applied: last.ops.length, dropped: last.dropped.length } : null })
    return true
  }
  if (path === '/memory/instincts' && method === 'POST') {
    const b = fields(await req.readBody(MAX_BODY), ['kind', 'text', 'until', 'ruleId', 'source', 'status'])
    if (!KINDS.includes(b.kind as Kind) || !['chat', 'user', 'decisions'].includes(b.source as string)
      || (!absent(b.ruleId) && !validRuleId(b.ruleId)) || (b.status !== undefined && b.status !== 'pending' && b.status !== 'active')) throw new ValidationError()
    const fact = text(b.text), date = await until(b.until, req.today), source = b.source as Source
    // A chat remember is never confirmed by the agent itself: the user keeps it.
    const status = source === 'chat' ? 'pending' : (b.status as 'pending' | 'active' | undefined) ?? 'active'
    const now = new Date().toISOString()
    const result = await locked<Written>(email, async () => {
      const rows = await req.memory.listInstincts(email), conflict = textConflict(fact, rows)
      // Forget binds the agent, never the owner: the owner's own add lifts the tombstone. The forgotten rows stay for
      // history as replaced by the new row. A chat remember, consolidation and proposals still refuse it.
      const revived = conflict === 'tombstone' && source === 'user' && !textConflict(fact, rows.filter(live))
        ? rows.filter(old => old.status === 'forgotten' && normalizeText(old.text) === normalizeText(fact)) : []
      if (conflict && !revived.length) return { conflict }
      const row: InstinctRow = { id: newInstinctId(), kind: b.kind as Kind, text: fact, source, status, until: date,
        ruleId: absent(b.ruleId) ? null : b.ruleId as string, replacedBy: null, at: now, updatedAt: now }
      // ponytail: two writes, no transaction. A failed insert leaves the tombstone lifted, which is what the owner asked for; the retry adds the row.
      for (const old of revived) await req.memory.updateInstinct(email, old.id, { status: 'replaced', replacedBy: row.id, updatedAt: now }, ['forgotten'])
      await req.memory.insertInstinct(email, row)
      return { row }
    })
    if (result.conflict || !result.row) { json(response, 409, { reason: result.conflict }); return true }
    json(response, 201, { instinct: publicInstinct(result.row) })
    if (source === 'chat') void req.consolidate(email, 'chat')
    return true
  }
  if ((match = /^\/memory\/instincts\/([^/]+)$/.exec(path)) && method === 'PATCH') {
    const b = fields(await req.readBody(MAX_BODY), ['text', 'until', 'status'])
    if (!Object.keys(b).length || (b.status !== undefined && b.status !== 'active')) throw new ValidationError()
    const fact = b.text === undefined ? undefined : text(b.text), date = b.until === undefined ? undefined : await until(b.until, req.today)
    const id = match[1], now = new Date().toISOString()
    const result = await locked<Written>(email, async () => {
      const rows = await req.memory.listInstincts(email)
      if (!INSTINCT_ID.test(id) || !rows.some(row => row.id === id && live(row))) return {}
      const conflict = fact === undefined ? null : textConflict(fact, rows, id)
      if (conflict) return { conflict }
      // An edit keeps the id and bumps at; Keep alone only confirms.
      const edited = fact !== undefined || date !== undefined
      const row = await req.memory.updateInstinct(email, id, { ...(fact !== undefined ? { text: fact } : {}), ...(date !== undefined ? { until: date } : {}),
        ...(b.status ? { status: 'active' as const } : {}), ...(edited ? { at: now } : {}), updatedAt: now }, ['active', 'pending'])
      return { row }
    })
    if (result.conflict) { json(response, 409, { reason: result.conflict }); return true }
    if (!result.row) throw new DataError(404, 'not_found')
    json(response, 200, { instinct: publicInstinct(result.row) })
    return true
  }
  if ((match = /^\/memory\/instincts\/([^/]+)\/forget$/.exec(path)) && method === 'POST') {
    const id = match[1]
    const row = await locked(email, async () => {
      const current = INSTINCT_ID.test(id) ? (await req.memory.listInstincts(email)).find(item => item.id === id) : undefined
      if (!current || current.status === 'replaced') return null
      if (current.status === 'forgotten') return current
      return req.memory.updateInstinct(email, id, { status: 'forgotten', updatedAt: new Date().toISOString() }, ['active', 'pending'])
    })
    if (!row) throw new DataError(404, 'not_found')
    json(response, 200, { instinct: publicInstinct(row) })
    return true
  }
  if ((match = /^\/memory\/proposals\/([^/]+)\/(keep|dismiss)$/.exec(path)) && method === 'POST') {
    const [, ruleId, action] = match
    if (!RULE_IDS.has(ruleId)) throw new DataError(404, 'not_found')
    const result = await locked<Written>(email, async () => {
      const rows = await req.memory.listInstincts(email)
      // Idempotent: a rule already decided returns its row; keep does not add the rule (the client applies add_rule).
      const decided = rows.find(item => item.source === 'decisions' && item.ruleId === ruleId)
      if (decided) return { row: decided }
      const proposal = proposals(await req.journey.listDecisions(email), rows).find(item => item.ruleId === ruleId)
      if (!proposal) return {}
      const fact = proposalText(proposal), conflict = textConflict(fact, rows)
      // Keep never resurrects a forgotten text or duplicates a known one; dismiss never makes a tombstone of a text still held.
      if (conflict === 'duplicate' || (conflict === 'tombstone' && action === 'keep')) return { conflict }
      const now = new Date().toISOString()
      const created: InstinctRow = { id: newInstinctId(), kind: 'autonomy', text: fact, source: 'decisions',
        status: action === 'keep' ? 'active' : 'forgotten', until: null, ruleId, replacedBy: null, at: now, updatedAt: now }
      await req.memory.insertInstinct(email, created)
      return { row: created }
    })
    if (result.conflict) { json(response, 409, { reason: result.conflict }); return true }
    if (!result.row) throw new DataError(404, 'not_found')
    json(response, 200, { instinct: publicInstinct(result.row) })
    return true
  }
  if (path === '/memory/consolidate' && method === 'POST') {
    if (fields(await req.readBody(MAX_BODY), ['trigger']).trigger !== 'chat') throw new ValidationError()
    json(response, 202, { ok: true })
    void req.consolidate(email, 'chat')
    return true
  }
  return false
}
