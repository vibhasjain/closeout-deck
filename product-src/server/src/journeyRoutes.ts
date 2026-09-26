import { createHash, randomBytes } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { gunzipSync, gzipSync } from 'node:zlib'
import { recentCycles, replyBy } from '../../src/lib/cycles.ts'
import { journeyAdjustments } from '../../src/lib/journeyPay.ts'
import { accountHash } from './datastore.ts'
import type { DataStore, RunRecord } from './datastore.ts'
import { cycleDates, DataError, dateKey, localToday } from './data.ts'
import type { DataService } from './data.ts'
import { calendarFrom } from './pipeline.ts'
import type { CyclePayload } from './pipeline.ts'
import {
  buildExport, counterpartyFor, defaultDestination, disputeEvidence, draftAsk, journeyCycle, neverContacted, nextStep, openItems,
  simulatedDispute, summarize, toCsv, validateAsks, validateCycleRef, validateDecision, validateDispute, validateMessage,
  validateResolve, validateSend, wireCycle,
} from './journey.ts'
import type { Batch, CycleSummary, Decision, Dispute, IntakeGap, Message, Thread } from './journey.ts'
import type { JourneyStore } from './journeyStore.ts'

export interface JourneyRequest {
  method: string; path: string; url: URL; email: string; doc: Record<string, unknown>
  store: DataStore; service: DataService; journey: JourneyStore; response: ServerResponse
  readBody: (maxBytes: number) => Promise<unknown>; sync: () => Promise<unknown>
  currentDoc?: () => Promise<Record<string, unknown>>
  /** Fire-and-forget after a Send to Payroll returns 201 (P9 memory consolidation). */
  onSent?: (cycleId: string) => void
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString('hex')}`
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
// ponytail: single Node process / single machine only. All journey snapshots and mutations share
// this per-account lock, including across createServer instances. Before running multiple processes
// or replicas, replace it with a database transaction/advisory lock around assignment and send.
const accountLocks = new Map<string, Promise<void>>()
async function locked<T>(email: string, work: () => Promise<T>): Promise<T> {
  const previous = accountLocks.get(email) ?? Promise.resolve()
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const tail = previous.then(() => held)
  accountLocks.set(email, tail)
  await previous
  try { return await work() }
  finally { release(); if (accountLocks.get(email) === tail) accountLocks.delete(email) }
}
function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}
function gzipJson(response: ServerResponse, status: number, gzipped: Buffer): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' })
  response.end(gzipped)
}
/** Appends fields (a JSON object) to the app's payload JSON without re-serializing its time entries. */
const withFields = (payload: Buffer, fields: string) => Buffer.concat([payload.subarray(0, payload.lastIndexOf('}')), Buffer.from(',' + fields.slice(1))])

// ponytail: in-process caches keyed by the content-addressed run; a second machine just recomputes.
// Bounded by entry count: the app's payload is ~6.7 MB of UTF-8 for 2,000 workers, its gzip ~0.3 MB, so about 32 MB when full.
// Payloads stay Buffers: the notes carry '≤', and V8 stores a string with any non-Latin-1 character at two bytes a character.
const summaries = new Map<string, CycleSummary>(), wires = new Map<string, Buffer>(), gzips = new Map<string, Buffer>()
function remember<T>(cache: Map<string, T>, key: string, value: T, max = 64) {
  cache.set(key, value)
  if (cache.size > max) cache.delete(cache.keys().next().value!)
  return value
}
const runKey = (email: string, run: RunRecord) => `${email}|${run.runId}|${run.runAt}`
async function runText(store: DataStore, email: string, run: RunRecord): Promise<string> {
  const bytes = await store.getObject(email, run.storagePath)
  if (!bytes) throw new DataError(404, 'not_found')
  return gunzipSync(bytes).toString('utf8')
}
async function summaryFor(store: DataStore, email: string, run: RunRecord): Promise<CycleSummary> {
  const key = runKey(email, run)
  return summaries.get(key) ?? remember(summaries, key, summarize(JSON.parse(await runText(store, email, run)) as CyclePayload))
}

type Loaded = { key: string; summary: CycleSummary; wire(): Promise<Buffer> }
async function loadCycle(req: JourneyRequest, cycleId: string, parse: true): Promise<Loaded & { payload: CyclePayload }>
async function loadCycle(req: JourneyRequest, cycleId: string, parse?: false): Promise<Loaded & { payload?: CyclePayload }>
async function loadCycle(req: JourneyRequest, cycleId: string, parse = false) {
  await req.service.recompute(req.email, req.doc)
  const run = await req.store.getRun(req.email, cycleId)
  if (!run) throw new DataError(404, 'not_found')
  const key = runKey(req.email, run)
  const read = async () => JSON.parse(await runText(req.store, req.email, run)) as CyclePayload
  const payload = parse || !summaries.has(key) ? await read() : undefined
  return { key, payload, summary: summaries.get(key) ?? remember(summaries, key, summarize(payload!)),
    /** The app's copy of the run (wireCycle). The stored run is read again only on a cache miss. */
    wire: async () => wires.get(key) ?? remember(wires, key, Buffer.from(JSON.stringify(wireCycle(payload ?? await read()))), 4) }
}

async function journeyState(req: JourneyRequest, summary: CycleSummary) {
  const aliases = Object.fromEntries(summary.groups.flatMap(g => [[g.id, g.id], ...(g.num == null ? [] : [[String(g.num), g.id]])]))
  const [decisions, batches, threads, disputes] = await Promise.all([req.journey.canonicalizeDecisions(req.email, summary.id, aliases), req.journey.listBatches(req.email), req.journey.listThreads(req.email, summary.id), req.journey.listDisputes(req.email)])
  const batch = batches.find(b => b.cycleId === summary.id) ?? null, cycle = journeyCycle(summary, req.doc, threads)
  return { decisions, batch, cycle, threads, adjustments: journeyAdjustments(summary.id, disputes), nextStep: nextStep(cycle, decisions, batch) }
}

/** N8: a cycle with no run can still carry journey state (an adjustment landing on it, a decision, a thread or a batch).
 * That state stays visible on an empty payload; a cycle with nothing at all is still a 404 ("no data yet"). */
async function journeyOnlyCycle(req: JourneyRequest, cycleId: string): Promise<void> {
  const cycle = recentCycles(calendarFrom(req.doc), 26, localToday(await req.store.listFacts(req.email), req.doc)).find(c => c.id === cycleId)
  if (!cycle) throw new DataError(404, 'not_found')
  const dates = cycleDates(cycle), counts = { set1: 0, set2: 0, set3: 0 }
  const state = await journeyState(req, { id: cycleId, start: dates.start, cutoff: dates.cutoff, deadline: dates.deadline, counts, gaps: [], groups: [], supervisors: {} })
  if (!state.adjustments.length && !state.decisions.length && !state.batch && !state.threads.length) throw new DataError(404, 'not_found')
  json(req.response, 200, { cycle: dates, sample: false, runId: null, runAt: null, sites: [], week: [], results: [], rulesChecked: [],
    totals: { under: 0, over: 0, flags: 0, held: 0, gross: 0, naive: 0, shifts: 0, workers: 0 }, counts, groups: [], extraGroups: [], gaps: [],
    intake: { sources: [], expected: [], received: [] }, decisions: state.decisions, batch: state.batch, nextStep: state.nextStep, adjustments: state.adjustments })
}

async function withMessages(req: JourneyRequest, threads: Thread[]) {
  const messages = await req.journey.listMessages(req.email, threads.map(t => t.id))
  return threads.map(t => ({ ...t, messages: messages.filter(m => m.threadId === t.id).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)) }))
}

async function requireSent(req: JourneyRequest, cycleId: string): Promise<void> {
  if (!(await req.journey.listBatches(req.email)).some(b => b.cycleId === cycleId)) throw new DataError(422, 'cycle_not_sent')
}

/** Preserve full evidence in bounded message chunks, including long provenance references. */
function recordedMessages(threadId: string, text: string, at: string): Message[] {
  const messages: Message[] = []
  for (let offset = 0; offset < text.length; offset += 4000) messages.push({ id: newId('m'), threadId, dir: 'note',
    text: text.slice(offset, offset + 4000), status: 'recorded', at: new Date(Date.parse(at) + messages.length).toISOString() })
  return messages
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
  await requireSent(req, input.cycleId)
  const { payload, summary } = await loadCycle(req, input.cycleId, true)
  const { decisions } = await journeyState(req, summary)
  const fileNames = new Map((await req.store.listFiles(req.email)).map(file => [file.id, file.name]))
  const evidence = disputeEvidence(payload, input.worker, decisions, fileNames), now = new Date().toISOString()
  const dispute: Dispute = { id: newId('dp'), ...input, status: 'open', adjustment: null, createdAt: now }
  const thread: Thread = { id: newId('t'), cycleId: input.cycleId, shiftId: evidence.shiftId, disputeId: dispute.id, counterparty: { kind: 'worker', name: input.worker }, status: 'open', createdAt: now }
  await req.journey.saveConversation(req.email, thread, [
    { id: newId('m'), threadId: thread.id, dir: 'in', text: input.description, status: 'recorded', at: now },
    ...recordedMessages(thread.id, evidence.text, new Date(Date.parse(now) + 1).toISOString()),
  ], dispute)
  await req.sync()
  json(req.response, 201, { dispute, thread: (await withMessages(req, [thread]))[0] })
}

/** Returns false when the path is not a journey route. Every lookup is scoped to the session email. */
export async function handleJourney(req: JourneyRequest): Promise<boolean> {
  if (!/^\/data\/(cycles\/\d{4}-\d{2}-\d{2}(?:\/(?:decisions|asks|send))?|threads(?:\/[^/]+\/messages)?|batches\/[^/]+\/csv|disputes(?:\/simulate|\/[^/]+\/resolve)?)$/.test(req.path)) return false
  return locked(req.email, async () => {
    if (req.currentDoc) req.doc = await req.currentDoc()
    return handleLockedJourney(req)
  })
}

async function handleLockedJourney(req: JourneyRequest): Promise<boolean> {
  const { method, path, email, response } = req
  let match: RegExpExecArray | null
  if ((match = /^\/data\/cycles\/(\d{4}-\d{2}-\d{2})$/.exec(path)) && method === 'GET') {
    const loaded = await loadCycle(req, match[1]).catch((error: unknown) => { if (error instanceof DataError && error.status === 404) return null; throw error })
    if (!loaded) { await journeyOnlyCycle(req, match[1]); return true }
    const { decisions, batch, nextStep, adjustments } = await journeyState(req, loaded.summary)
    // Cached per run and journey state: repeat reads (polling, reloads) skip the storage read, trim and gzip.
    const fields = JSON.stringify({ decisions, batch, nextStep, adjustments }), key = `${loaded.key}|${hash(fields)}`
    gzipJson(response, 200, gzips.get(key) ?? remember(gzips, key, gzipSync(withFields(await loaded.wire(), fields)), 16))
    return true
  }
  if ((match = /^\/data\/cycles\/(\d{4}-\d{2}-\d{2})\/(decisions|asks|send)$/.exec(path)) && method === 'POST') {
    const [, cycleId, action] = match, now = new Date().toISOString()
    if (action === 'decisions') {
      const input = validateDecision(await req.readBody(262_144))
      const { wire, summary } = await loadCycle(req, cycleId)
      const group = summary.groups.find(g => g.id === input.groupId || g.num != null && String(g.num) === input.groupId)
      if (!group) throw new DataError(400, 'unknown_group')
      await journeyState(req, summary)
      const shiftIds = input.shiftIds ?? [...new Set(summary.groups.filter(g => g.id === group.id).flatMap(g => g.shiftIds))]
      const decision = await req.journey.upsertDecision(email, { id: 'd_' + hash(`${email}|${cycleId}|${group.id}`).slice(0, 16), cycleId,
        groupId: group.id, shiftIds, decision: input.decision, reason: input.reason, by: 'user', at: now })
      const state = await journeyState(req, summary)
      await req.sync()
      const cycle = withFields(await wire(), JSON.stringify({ decisions: state.decisions, batch: state.batch, nextStep: state.nextStep, adjustments: state.adjustments }))
      gzipJson(response, 200, gzipSync(Buffer.concat([Buffer.from(`{"decision":${JSON.stringify(decision)},"cycle":`), cycle, Buffer.from('}')])))
      return true
    }
    if (action === 'asks') {
      const input = validateAsks(await req.readBody(65_536))
      const { summary } = await loadCycle(req, cycleId)
      const known = new Map(summary.gaps.map(g => [g.id, g]))
      const gaps = input.gapIds.map(id => known.get(id)).filter((g): g is IntakeGap => !!g)
      if (gaps.length !== input.gapIds.length) throw new DataError(400, 'unknown_gaps')
      const byParty = new Map<string, { cp: ReturnType<typeof counterpartyFor>; gaps: IntakeGap[] }>()
      for (const gap of gaps) {
        const cp = counterpartyFor(gap, summary), key = `${cp.kind}|${cp.name}`
        byParty.set(key, { cp, gaps: [...byParty.get(key)?.gaps ?? [], gap] })
      }
      const existing = await req.journey.listThreads(email, cycleId), threads: Thread[] = [], skipped: string[] = []
      const local = (date: string) => new Date(`${date}T00:00:00`)
      const due = dateKey(replyBy({ cutoff: local(summary.cutoff), deadline: local(summary.deadline) }, calendarFrom(req.doc), localToday(await req.store.listFacts(email), req.doc)))
      for (const { cp, gaps: asked } of byParty.values()) {
        const doc = req.currentDoc ? await req.currentDoc() : req.doc
        if (neverContacted(cp, asked, doc.neverContact)) { skipped.push(cp.name); continue }
        const id = 't_' + hash(`${email}|${cycleId}|${cp.kind}|${cp.name}`).slice(0, 16), old = existing.find(t => t.id === id)
        const thread: Thread = { id, cycleId, shiftId: old?.shiftId ?? null, disputeId: null, status: 'waiting', createdAt: old?.createdAt ?? now,
          counterparty: { ...cp, ...(cp.kind === 'site' ? { siteNames: [...new Set([...old?.counterparty.siteNames ?? [], ...asked.map(g => g.client)])] } : {}),
            gapIds: [...new Set([...old?.counterparty.gapIds ?? [], ...asked.map(g => g.id)])] } }
        const text = input.message ?? draftAsk(cp, asked, summary, due)
        validateMessage({ dir: 'out', text })
        await req.journey.saveConversation(email, thread, [{ id: newId('m'), threadId: id, dir: 'out', text, status: 'not_sent_demo', at: now }])
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
    req.onSent?.(cycleId)
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
    if (input.dir === 'out') {
      // Reconstruct context for pre-integration threads as well as retaining siteNames on new asks.
      const { summary } = await loadCycle(req, thread.cycleId)
      const gaps = summary.gaps.filter(g => thread.counterparty.gapIds?.includes(g.id))
      const sites = Object.entries(summary.supervisors).filter(([, name]) => name === thread.counterparty.name).map(([site]) => site)
      const legacySites = (thread.counterparty.gapIds ?? []).map(id => id.split('|')[0])
      const counterparty = { ...thread.counterparty, siteNames: [...thread.counterparty.siteNames ?? [], ...sites, ...legacySites] }
      const doc = req.currentDoc ? await req.currentDoc() : req.doc
      // A stable code and the name the user put on the list: the client says who, never shows the code.
      const name = neverContacted(counterparty, gaps, doc.neverContact)
      if (name) { json(response, 403, { error: 'never_contact', name }); return true }
    }
    // Sending is simulated: an outgoing message is logged, never delivered.
    const message: Message = { id: newId('m'), threadId: thread.id, dir: input.dir, text: input.text, status: input.dir === 'out' ? 'not_sent_demo' : 'recorded', at: new Date().toISOString() }
    // A resolved dispute stays resolved when Payroll writes to the worker afterwards.
    const updated: Thread = { ...thread, status: input.dir === 'out' ? thread.status === 'resolved' ? 'resolved' : 'waiting' : input.dir === 'in' ? 'open' : thread.status }
    await req.journey.saveConversation(email, updated, [message])
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
    await requireSent(req, cycleId)
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
    await requireSent(req, dispute.cycleId)
    if (dispute.status !== 'open') { json(response, 409, { dispute }); return true }
    let adjustment: Dispute['adjustment'] = null
    if (input.decision === 'adjust') {
      let amount = input.amount
      if (amount === undefined) {
        const { payload, summary } = await loadCycle(req, dispute.cycleId, true)
        const { decisions } = await journeyState(req, summary)
        const rate = disputeEvidence(payload, dispute.worker, decisions).rate
        if (!rate) throw new DataError(422, 'rate_unknown')
        amount = cents(input.hours! * rate)
      }
      adjustment = { hours: input.hours ?? 0, amount, next_cycle_id: await nextUnsentCycle(req, dispute.cycleId) }
    }
    const saved: Dispute = { ...dispute, status: adjustment ? 'adjusted' : 'rejected', adjustment }
    const thread = (await req.journey.listThreads(email, dispute.cycleId)).find(t => t.disputeId === dispute.id)
    if (thread) {
      const summary = adjustment ? `Adjusted: ${adjustment.hours}h, $${adjustment.amount.toFixed(2)} on the ${adjustment.next_cycle_id} Payroll. ` : 'Rejected. '
      await req.journey.saveConversation(email, { ...thread, status: 'resolved' }, recordedMessages(thread.id, summary + input.note, new Date().toISOString()), saved)
    } else await req.journey.upsertDispute(email, saved)
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

/** Journey artifacts are a bounded cache; omitted history remains available from authenticated routes. */
export async function writeJourney(input: { email: string; store: DataStore; journey: JourneyStore; doc: Record<string, unknown>; runs: RunRecord[]; legacy: unknown[]; io: WorkspaceIO; maxBytes?: number; cycleIds?: string[] }): Promise<void> {
  const { email, store, journey, doc, io } = input
  const maxBytes = input.maxBytes ?? 8 * 1024 * 1024
  let remaining = Math.max(0, maxBytes - 4096), omitted = 0
  const artifacts: string[] = []
  const write = async (path: string, value: string | Uint8Array) => {
    const size = typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength
    if (size > remaining) { omitted++; return false }
    await io.write(path, value); remaining -= size; artifacts.push(path); return true
  }
  // Remove the previous cache first, including CSVs that no longer fit this turn's budget.
  for (const path of ['data/threads', 'data/disputes', 'data/batches', 'data/decisions.jsonl', 'nextstep.md', 'data/journey.md']) await io.remove(path)
  let decisions: Decision[], threads: Thread[], disputes: Dispute[], batches: Batch[]
  try { [decisions, threads, disputes, batches] = await Promise.all([journey.listDecisions(email), journey.listThreads(email), journey.listDisputes(email), journey.listBatches(email)]) }
  catch (error) {
    console.error('Journey workspace skipped:', error instanceof Error ? error.message : 'Error')
    const rows: string[] = []
    let bytes = 0
    for (const d of input.legacy) { const row = JSON.stringify(d) + '\n'; if (bytes + Buffer.byteLength(row) > remaining) break; rows.push(row); bytes += Buffer.byteLength(row) }
    await write('data/decisions.jsonl', rows.join(''))
    await write('data/journey.md', '# Journey history unavailable\nLegacy decisions only. Retry authenticated journey routes for current status.\n')
    return
  }
  const cycles = new Set(input.cycleIds ?? input.runs.filter(r => r.totals.shifts > 0).slice(0, 8).map(r => r.cycleId))
  const compactDecision = (d: Decision) => ({ ...d, shiftIds: d.shiftIds.slice(0, 20), shiftCount: d.shiftIds.length })
  const ownDecisions = decisions.filter(d => cycles.has(d.cycleId)).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
  const decisionRows: string[] = []
  let decisionBytes = 0
  for (const d of [...ownDecisions.map(compactDecision), ...input.legacy]) {
    const row = JSON.stringify(d) + '\n'
    if (decisionBytes + Buffer.byteLength(row) > Math.min(262144, remaining / 4)) { omitted++; continue }
    decisionRows.push(row); decisionBytes += Buffer.byteLength(row)
  }
  omitted += decisions.length - ownDecisions.length
  await write('data/decisions.jsonl', decisionRows.join(''))
  const lines: string[] = []
  for (const run of input.runs.filter(r => cycles.has(r.cycleId))) {
    const summary = await summaryFor(store, email, run)
    const cycle = journeyCycle(summary, doc, threads.filter(t => t.cycleId === run.cycleId))
    const own = decisions.filter(d => d.cycleId === run.cycleId), batch = batches.find(b => b.cycleId === run.cycleId) ?? null
    const step = nextStep(cycle, own, batch), open = openItems(cycle, own)
    lines.push(`${run.cycleId}: ${step.kind} · ${step.label} · ${step.detail}` + (batch ? ` · Sent to ${batch.destination} · Demo; never re-send` : '') +
      (open.missingSets.length ? ` · missing sets ${open.missingSets.join(', ')}` : '') + (open.gaps.length ? ` · open gaps ${open.gaps.slice(0, 10).join('; ')}${open.gaps.length > 10 ? ' …' : ''}` : '') +
      (open.groups.length ? ` · open groups ${open.groups.join(', ')}` : ''))
  }
  await write('nextstep.md', ['# Next step per cycle', 'Order: get_timesheets, chase_missing, review, send, done. Sent status is independent; never re-send a batch.', '', ...(lines.length ? lines : ['No cycle has time entries yet: get_timesheets'])].join('\n') + '\n')
  const selectedThreads = threads.filter(t => cycles.has(t.cycleId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 200)
  omitted += threads.length - selectedThreads.length
  const messages = await journey.listMessages(email, selectedThreads.map(t => t.id))
  const indent = (text: string) => text.replace(/\n/g, '\n  ')
  for (const t of selectedThreads) {
    const all = messages.filter(m => m.threadId === t.id).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    // Recent replies survive when a long thread has to be bounded. The omission is explicit.
    const own = all.slice(-100)
    await write(`data/threads/${t.id}.md`, [`# Thread ${t.id}`, `Cycle: ${t.cycleId}`, `Counterparty: ${t.counterparty.kind} · ${t.counterparty.name}${t.counterparty.contact ? ` (${t.counterparty.contact})` : ''}`,
      `Status: ${t.status}`, ...(t.disputeId ? [`Dispute: ${t.disputeId}`] : []), ...(t.shiftId ? [`Time entry: ${t.shiftId}`] : []), ...(t.counterparty.gapIds?.length ? [`Asked about gaps (still require reconciliation or explicit closure): ${t.counterparty.gapIds.slice(0, 200).join('; ')}`] : []),
      ...(all.length > own.length ? [`Omitted ${all.length - own.length} older messages; fetch /data/threads?cycleId=${t.cycleId} for full history.`] : []),
      '', '## Messages (sending is simulated: out = Not sent · Demo)', ...own.map(m => `- ${m.at} ${m.dir} [${m.status}]: ${indent(m.text)}`)].join('\n') + '\n')
  }
  const selectedDisputes = disputes.filter(d => cycles.has(d.cycleId) || (d.adjustment && cycles.has(d.adjustment.next_cycle_id)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 200)
  omitted += disputes.length - selectedDisputes.length
  for (const d of selectedDisputes) await write(`data/disputes/${d.id}.md`, [`# Dispute ${d.id}`, `Paid cycle: ${d.cycleId}`, `Worker: ${d.worker}`, `Source: ${d.source}`, `Status: ${d.status}`, `Opened: ${d.createdAt}`,
    `Adjustment: ${d.adjustment ? `${d.adjustment.hours}h, $${d.adjustment.amount.toFixed(2)}, lands on the ${d.adjustment.next_cycle_id} Payroll export` : 'none'}`,
    `Thread: ${threads.find(t => t.disputeId === d.id)?.id ?? 'none'}`, '', '## Claim', d.description].join('\n') + '\n')
  const selectedBatches = batches.filter(b => cycles.has(b.cycleId)).sort((a, b) => b.cycleId.localeCompare(a.cycleId))
  omitted += batches.length - selectedBatches.length
  for (const b of selectedBatches) {
    const bytes = await store.getObject(email, b.csvPath)
    if (bytes) await write(`data/batches/${b.cycleId}.csv`, bytes)
  }
  const note = `# Journey cache\n${artifacts.length} artifacts materialized; ${omitted} records or artifacts omitted by cycle, count or byte limits.\nCache budget: ${maxBytes} bytes. Further workspace eviction may remove artifacts.\nFull records: /data/cycles/:id, /data/threads?cycleId=, /data/disputes, /data/batches/:id/csv.\nMissing cache files never mean a cycle is unsent, a gap is closed, or evidence is absent.\n`
  if (Buffer.byteLength(note) <= maxBytes - (Math.max(0, maxBytes - 4096) - remaining)) await io.write('data/journey.md', note)
}
