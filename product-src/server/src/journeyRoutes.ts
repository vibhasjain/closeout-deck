import { createHash, randomBytes } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { gunzipSync, gzipSync } from 'node:zlib'
import { recentCycles } from '../../src/lib/cycles.ts'
import { accountHash } from './datastore.ts'
import type { DataStore, RunRecord } from './datastore.ts'
import { DataError } from './data.ts'
import type { DataService } from './data.ts'
import { calendarFrom } from './pipeline.ts'
import type { CyclePayload } from './pipeline.ts'
import {
  buildExport, counterpartyFor, defaultDestination, disputeEvidence, draftAsk, journeyCycle, neverContacted, nextStep, openItems,
  simulatedDispute, summarize, toCsv, validateAsks, validateCycleRef, validateDecision, validateDispute, validateMessage,
  validateResolve, validateSend,
} from './journey.ts'
import type { Batch, CycleSummary, Decision, Dispute, IntakeGap, Message, Thread } from './journey.ts'
import type { JourneyStore } from './journeyStore.ts'

export interface JourneyRequest {
  method: string; path: string; url: URL; email: string; doc: Record<string, unknown>
  store: DataStore; service: DataService; journey: JourneyStore; response: ServerResponse
  readBody: (maxBytes: number) => Promise<unknown>; sync: () => Promise<unknown>
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString('hex')}`
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}
function gzipJson(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' })
  response.end(gzipSync(body))
}
/** Appends fields to the stored payload JSON without re-serializing ~10 MB of time entries. */
const withFields = (payload: string, fields: object) => payload.slice(0, payload.lastIndexOf('}')) + ',' + JSON.stringify(fields).slice(1)

// ponytail: in-process cache keyed by the content-addressed run id; a second machine just recomputes.
const summaries = new Map<string, CycleSummary>()
function remember(key: string, summary: CycleSummary) {
  summaries.set(key, summary)
  if (summaries.size > 64) summaries.delete(summaries.keys().next().value!)
  return summary
}
async function runText(store: DataStore, email: string, run: RunRecord): Promise<string> {
  const bytes = await store.getObject(email, run.storagePath)
  if (!bytes) throw new DataError(404, 'not_found')
  return gunzipSync(bytes).toString('utf8')
}
async function summaryFor(store: DataStore, email: string, run: RunRecord): Promise<CycleSummary> {
  return summaries.get(`${email}|${run.runId}`) ?? remember(`${email}|${run.runId}`, summarize(JSON.parse(await runText(store, email, run)) as CyclePayload))
}

async function loadCycle(req: JourneyRequest, cycleId: string, parse: true): Promise<{ text: string; summary: CycleSummary; payload: CyclePayload }>
async function loadCycle(req: JourneyRequest, cycleId: string, parse?: false): Promise<{ text: string; summary: CycleSummary; payload?: CyclePayload }>
async function loadCycle(req: JourneyRequest, cycleId: string, parse = false) {
  await req.service.recompute(req.email, req.doc)
  const run = await req.store.getRun(req.email, cycleId)
  if (!run) throw new DataError(404, 'not_found')
  const text = await runText(req.store, req.email, run), key = `${req.email}|${run.runId}`
  const payload = parse || !summaries.has(key) ? JSON.parse(text) as CyclePayload : undefined
  return { text, payload, summary: summaries.get(key) ?? remember(key, summarize(payload!)) }
}

async function journeyState(req: JourneyRequest, summary: CycleSummary) {
  const [decisions, batches, threads] = await Promise.all([req.journey.listDecisions(req.email, summary.id), req.journey.listBatches(req.email), req.journey.listThreads(req.email, summary.id)])
  const batch = batches.find(b => b.cycleId === summary.id) ?? null, cycle = journeyCycle(summary, req.doc, threads)
  return { decisions, batch, cycle, nextStep: nextStep(cycle, decisions, batch) }
}

async function withMessages(req: JourneyRequest, threads: Thread[]) {
  const messages = await req.journey.listMessages(req.email, threads.map(t => t.id))
  return threads.map(t => ({ ...t, messages: messages.filter(m => m.threadId === t.id).sort((a, b) => a.at.localeCompare(b.at)) }))
}

/** The adjustment lands on the first cycle after the paid one that has not been sent. */
async function nextUnsentCycle(req: JourneyRequest, paidCycleId: string): Promise<string> {
  const sent = new Set((await req.journey.listBatches(req.email)).map(b => b.cycleId))
  const horizon = new Date(Date.parse(`${paidCycleId}T00:00:00`) + 400 * 86_400_000)
  const next = recentCycles(calendarFrom(req.doc), 60, horizon).map(c => c.id).filter(id => id > paidCycleId && !sent.has(id)).sort()[0]
  if (!next) throw new DataError(422, 'no_next_cycle')
  return next
}

async function openDispute(req: JourneyRequest, input: { cycleId: string; worker: string; description: string; source: Dispute['source'] }) {
  const { payload } = await loadCycle(req, input.cycleId, true)
  const evidence = disputeEvidence(payload, input.worker), now = new Date().toISOString()
  const dispute: Dispute = { id: newId('dp'), ...input, status: 'open', adjustment: null, createdAt: now }
  const thread: Thread = { id: newId('t'), cycleId: input.cycleId, shiftId: evidence.shiftId, disputeId: dispute.id, counterparty: { kind: 'worker', name: input.worker }, status: 'open', createdAt: now }
  await req.journey.upsertDispute(req.email, dispute)
  await req.journey.upsertThread(req.email, thread)
  await req.journey.addMessage(req.email, { id: newId('m'), threadId: thread.id, dir: 'in', text: input.description, status: 'recorded', at: now })
  await req.journey.addMessage(req.email, { id: newId('m'), threadId: thread.id, dir: 'note', text: evidence.text.slice(0, 4000), status: 'recorded', at: new Date(Date.parse(now) + 1).toISOString() })
  await req.sync()
  json(req.response, 201, { dispute, thread: (await withMessages(req, [thread]))[0] })
}

/** Returns false when the path is not a journey route. Every lookup is scoped to the session email. */
export async function handleJourney(req: JourneyRequest): Promise<boolean> {
  const { method, path, email, response } = req
  let match: RegExpExecArray | null
  if ((match = /^\/data\/cycles\/(\d{4}-\d{2}-\d{2})$/.exec(path)) && method === 'GET') {
    const { text, summary } = await loadCycle(req, match[1])
    const { decisions, batch, nextStep } = await journeyState(req, summary)
    gzipJson(response, 200, withFields(text, { decisions, batch, nextStep }))
    return true
  }
  if ((match = /^\/data\/cycles\/(\d{4}-\d{2}-\d{2})\/(decisions|asks|send)$/.exec(path)) && method === 'POST') {
    const [, cycleId, action] = match, now = new Date().toISOString()
    if (action === 'decisions') {
      const input = validateDecision(await req.readBody(262_144))
      const { text, summary } = await loadCycle(req, cycleId)
      const shiftIds = input.shiftIds ?? [...new Set(summary.groups.filter(g => g.id === input.groupId || String(g.num) === input.groupId).flatMap(g => g.shiftIds))]
      const decision = await req.journey.upsertDecision(email, { id: 'd_' + hash(`${email}|${cycleId}|${input.groupId}`).slice(0, 16), cycleId,
        groupId: input.groupId, shiftIds, decision: input.decision, reason: input.reason, by: 'user', at: now })
      const state = await journeyState(req, summary)
      await req.sync()
      gzipJson(response, 200, `{"decision":${JSON.stringify(decision)},"cycle":${withFields(text, { decisions: state.decisions, batch: state.batch, nextStep: state.nextStep })}}`)
      return true
    }
    if (action === 'asks') {
      const input = validateAsks(await req.readBody(65_536))
      const { summary } = await loadCycle(req, cycleId)
      const known = new Map(summary.gaps.map(g => [g.id, g]))
      const gaps = input.gapIds.map(id => known.get(id)).filter((g): g is IntakeGap => !!g)
      if (!gaps.length) throw new DataError(400, 'unknown_gaps')
      const byParty = new Map<string, { cp: ReturnType<typeof counterpartyFor>; gaps: IntakeGap[] }>()
      for (const gap of gaps) {
        const cp = counterpartyFor(gap, summary), key = `${cp.kind}|${cp.name}`
        byParty.set(key, { cp, gaps: [...byParty.get(key)?.gaps ?? [], gap] })
      }
      const existing = await req.journey.listThreads(email, cycleId), threads: Thread[] = [], skipped: string[] = []
      for (const { cp, gaps: asked } of byParty.values()) {
        if (neverContacted(cp, asked, req.doc.neverContact)) { skipped.push(cp.name); continue }
        const id = 't_' + hash(`${email}|${cycleId}|${cp.kind}|${cp.name}`).slice(0, 16), old = existing.find(t => t.id === id)
        const thread: Thread = { id, cycleId, shiftId: old?.shiftId ?? null, disputeId: null, status: 'waiting', createdAt: old?.createdAt ?? now,
          counterparty: { ...cp, gapIds: [...new Set([...old?.counterparty.gapIds ?? [], ...asked.map(g => g.id)])] } }
        await req.journey.upsertThread(email, thread)
        await req.journey.addMessage(email, { id: newId('m'), threadId: id, dir: 'out', text: input.message ?? draftAsk(cp, asked, summary), status: 'not_sent_demo', at: now })
        threads.push(thread)
      }
      await req.sync()
      json(response, 200, { threads: await withMessages(req, threads), skipped })
      return true
    }
    const input = validateSend(await req.readBody(4_096))
    const { summary, payload } = await loadCycle(req, cycleId, true)
    const state = await journeyState(req, summary)
    if (state.batch) { json(response, 409, { batch: state.batch }); return true }
    const open = openItems(state.cycle, state.decisions)
    if (state.nextStep.kind !== 'send' && !input.force) {
      json(response, 422, { reason: `${state.nextStep.label}: ${state.nextStep.detail}`, nextStep: state.nextStep, open })
      return true
    }
    const exported = buildExport(payload, state.decisions, await req.journey.listDisputes(email))
    const id = newId('b'), csvPath = `${accountHash(email)}/batches/${id}.csv`
    await req.store.putObject(email, csvPath, Buffer.from(toCsv(exported.lines)), 'text/csv')
    const { batch, created } = await req.journey.createBatch(email, { id, cycleId, destination: input.destination ?? defaultDestination(req.doc),
      workers: exported.workers, gross: exported.gross, held: exported.held, csvPath, createdAt: now })
    if (!created) { json(response, 409, { batch }); return true }
    await req.sync()
    json(response, 201, { batch, csvUrl: `/data/batches/${batch.id}/csv`, ...(state.nextStep.kind !== 'send' ? { open } : {}) })
    return true
  }
  if (path === '/data/threads' && method === 'GET') {
    const cycleId = req.url.searchParams.get('cycleId') ?? undefined
    if (cycleId !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(cycleId)) throw new DataError(400, 'invalid_cycle')
    json(response, 200, { threads: await withMessages(req, await req.journey.listThreads(email, cycleId)) })
    return true
  }
  if ((match = /^\/data\/threads\/(t_[0-9a-f]{16})\/messages$/.exec(path)) && method === 'POST') {
    const input = validateMessage(await req.readBody(16_384))
    const thread = (await req.journey.listThreads(email)).find(t => t.id === match![1])
    if (!thread) throw new DataError(404, 'not_found')
    // Sending is simulated: an outgoing message is logged, never delivered.
    const message: Message = { id: newId('m'), threadId: thread.id, dir: input.dir, text: input.text, status: input.dir === 'out' ? 'not_sent_demo' : 'recorded', at: new Date().toISOString() }
    await req.journey.addMessage(email, message)
    const updated: Thread = { ...thread, status: input.dir === 'out' ? 'waiting' : input.dir === 'in' ? 'open' : thread.status }
    if (updated.status !== thread.status) await req.journey.upsertThread(email, updated)
    await req.sync()
    json(response, 201, { message, thread: (await withMessages(req, [updated]))[0] })
    return true
  }
  if ((match = /^\/data\/batches\/(b_[0-9a-f]{16})\/csv$/.exec(path)) && method === 'GET') {
    const batch = (await req.journey.listBatches(email)).find(b => b.id === match![1])
    const bytes = batch ? await req.store.getObject(email, batch.csvPath) : null
    if (!batch || !bytes) throw new DataError(404, 'not_found')
    response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="payroll-${batch.cycleId}.csv"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(bytes)
    return true
  }
  if (path === '/data/disputes' && method === 'GET') {
    json(response, 200, { disputes: await req.journey.listDisputes(email) })
    return true
  }
  if (path === '/data/disputes' && method === 'POST') {
    await openDispute(req, validateDispute(await req.readBody(16_384)))
    return true
  }
  if (path === '/data/disputes/simulate' && method === 'POST') {
    const { cycleId } = validateCycleRef(await req.readBody(1_024))
    const { payload } = await loadCycle(req, cycleId, true)
    const simulated = simulatedDispute(payload)
    if (!simulated) throw new DataError(422, 'no_location_evidence')
    await openDispute(req, { cycleId, ...simulated, source: 'simulated' })
    return true
  }
  if ((match = /^\/data\/disputes\/(dp_[0-9a-f]{16})\/resolve$/.exec(path)) && method === 'POST') {
    const input = validateResolve(await req.readBody(8_192))
    const dispute = (await req.journey.listDisputes(email)).find(d => d.id === match![1])
    if (!dispute) throw new DataError(404, 'not_found')
    if (dispute.status !== 'open') { json(response, 409, { dispute }); return true }
    let adjustment: Dispute['adjustment'] = null
    if (input.decision === 'adjust') {
      let amount = input.amount
      if (amount === undefined) {
        const { payload } = await loadCycle(req, dispute.cycleId, true)
        const rate = disputeEvidence(payload, dispute.worker).rate
        if (!rate) throw new DataError(422, 'rate_unknown')
        amount = cents(input.hours! * rate)
      }
      adjustment = { hours: input.hours ?? 0, amount, next_cycle_id: await nextUnsentCycle(req, dispute.cycleId) }
    }
    const saved: Dispute = { ...dispute, status: adjustment ? 'adjusted' : 'rejected', adjustment }
    await req.journey.upsertDispute(email, saved)
    const thread = (await req.journey.listThreads(email, dispute.cycleId)).find(t => t.disputeId === dispute.id)
    if (thread) {
      const summary = adjustment ? `Adjusted: ${adjustment.hours}h, $${adjustment.amount.toFixed(2)} on the ${adjustment.next_cycle_id} Payroll. ` : 'Rejected. '
      await req.journey.addMessage(email, { id: newId('m'), threadId: thread.id, dir: 'note', text: (summary + input.note).slice(0, 4000), status: 'recorded', at: new Date().toISOString() })
      await req.journey.upsertThread(email, { ...thread, status: 'resolved' })
    }
    await req.sync()
    json(response, 200, { dispute: saved, ...(thread ? { thread: (await withMessages(req, [{ ...thread, status: 'resolved' }]))[0] } : {}) })
    return true
  }
  return false
}

export interface WorkspaceIO {
  write(path: string, value: string | Uint8Array): Promise<void>
  present(path: string): Promise<boolean>
  list(dir: string): Promise<string[]>
  remove(path: string): Promise<void>
}

/** Writes decisions, threads, disputes, sent batches and the next step per cycle into the agent workspace. */
export async function writeJourney(input: { email: string; store: DataStore; journey: JourneyStore; doc: Record<string, unknown>; runs: RunRecord[]; legacy: unknown[]; io: WorkspaceIO }): Promise<void> {
  const { email, store, journey, doc, io } = input
  let decisions: Decision[], threads: Thread[], disputes: Dispute[], batches: Batch[]
  try { [decisions, threads, disputes, batches] = await Promise.all([journey.listDecisions(email), journey.listThreads(email), journey.listDisputes(email), journey.listBatches(email)]) }
  catch (error) {
    // The agent workspace is a cache: an unavailable journey store (e.g. migration 0003 not applied) must not stop chat.
    console.error('Journey workspace skipped:', error instanceof Error ? error.message : 'Error')
    await io.write('data/decisions.jsonl', input.legacy.map(v => JSON.stringify(v)).join('\n') + '\n')
    return
  }
  const compactDecision = (d: Decision) => ({ ...d, shiftIds: d.shiftIds.slice(0, 20), shiftCount: d.shiftIds.length })
  await io.write('data/decisions.jsonl', [...input.legacy, ...decisions.map(compactDecision)].map(v => JSON.stringify(v)).join('\n') + '\n')
  for (const dir of ['data/threads', 'data/disputes']) await io.remove(dir)
  const messages = await journey.listMessages(email, threads.map(t => t.id))
  const indent = (text: string) => text.replace(/\n/g, '\n  ')
  for (const t of threads) {
    const own = messages.filter(m => m.threadId === t.id).sort((a, b) => a.at.localeCompare(b.at))
    await io.write(`data/threads/${t.id}.md`, [`# Thread ${t.id}`, `Cycle: ${t.cycleId}`, `Counterparty: ${t.counterparty.kind} · ${t.counterparty.name}${t.counterparty.contact ? ` (${t.counterparty.contact})` : ''}`,
      `Status: ${t.status}`, ...(t.disputeId ? [`Dispute: ${t.disputeId}`] : []), ...(t.shiftId ? [`Time entry: ${t.shiftId}`] : []), ...(t.counterparty.gapIds?.length ? [`Asked about gaps: ${t.counterparty.gapIds.join('; ')}`] : []),
      '', '## Messages (sending is simulated: out = Not sent · Demo)', ...own.map(m => `- ${m.at} ${m.dir} [${m.status}]: ${indent(m.text)}`)].join('\n') + '\n')
  }
  for (const d of disputes) {
    await io.write(`data/disputes/${d.id}.md`, [`# Dispute ${d.id}`, `Paid cycle: ${d.cycleId}`, `Worker: ${d.worker}`, `Source: ${d.source}`, `Status: ${d.status}`, `Opened: ${d.createdAt}`,
      `Adjustment: ${d.adjustment ? `${d.adjustment.hours}h, $${d.adjustment.amount.toFixed(2)}, lands on the ${d.adjustment.next_cycle_id} Payroll export` : 'none'}`,
      `Thread: ${threads.find(t => t.disputeId === d.id)?.id ?? 'none'}`, '', '## Claim', d.description].join('\n') + '\n')
  }
  const sentCycles = new Set(batches.map(b => `${b.cycleId}.csv`))
  for (const name of await io.list('data/batches')) if (!sentCycles.has(name)) await io.remove(`data/batches/${name}`)
  for (const b of batches) {
    if (await io.present(`data/batches/${b.cycleId}.csv`)) continue
    const bytes = await store.getObject(email, b.csvPath)
    if (bytes) await io.write(`data/batches/${b.cycleId}.csv`, bytes)
  }
  const lines = []
  for (const run of input.runs.filter(r => r.totals.shifts > 0).slice(0, 8)) {
    const summary = await summaryFor(store, email, run)
    const cycle = journeyCycle(summary, doc, threads.filter(t => t.cycleId === run.cycleId))
    const own = decisions.filter(d => d.cycleId === run.cycleId), step = nextStep(cycle, own, batches.find(b => b.cycleId === run.cycleId) ?? null)
    const open = openItems(cycle, own)
    lines.push(`${run.cycleId}: ${step.kind} · ${step.label} · ${step.detail}` +
      (open.missingSets.length ? ` · missing sets ${open.missingSets.join(', ')}` : '') + (open.gaps.length ? ` · open gaps ${open.gaps.slice(0, 10).join('; ')}${open.gaps.length > 10 ? ' …' : ''}` : '') +
      (open.groups.length ? ` · open groups ${open.groups.join(', ')}` : ''))
  }
  await io.write('nextstep.md', ['# Next step per cycle', 'Each cycle has exactly one next step, in this order: get_timesheets, chase_missing, review, send, done. Lead the user to it; never skip ahead.', '', ...(lines.length ? lines : ['No cycle has time entries yet: get_timesheets'])].join('\n') + '\n')
}
