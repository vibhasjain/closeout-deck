import assert from 'node:assert/strict'
import type { ServerResponse } from 'node:http'
import { setImmediate } from 'node:timers/promises'
import { gunzipSync } from 'node:zlib'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { accountHash, createMemoryDataStore } from '../src/datastore.ts'
import type { DataStore, RunRecord } from '../src/datastore.ts'
import { DataError, type DataService } from '../src/data.ts'
import type { CyclePayload } from '../src/pipeline.ts'
import type { Batch, Decision, Dispute, Message, NextStep, Thread } from '../src/journey.ts'
import { handleJourney } from '../src/journeyRoutes.ts'
import { createJourneyStore, createMemoryJourneyStore, type JourneyStore } from '../src/journeyStore.ts'

const email = 'regressions@hypertrack.io', paid = '2026-09-20', next = '2026-09-27', at = '2026-09-20T00:00:00.000Z'
const party = { kind: 'worker' as const, name: 'Ana Diaz' }
const thread = (id = 't_0000000000000001'): Thread => ({ id, cycleId: paid, shiftId: null, disputeId: null, counterparty: party, status: 'open', createdAt: at })
const message = (id = 'm_0000000000000001'): Message => ({ id, threadId: thread().id, dir: 'out', text: 'Confirm the hours', status: 'not_sent_demo', at })
const decision = (id: string, groupId: string, kind: Decision['decision'], stamp = at): Decision => ({ id, cycleId: paid, groupId, decision: kind, reason: kind === 'dismissed' ? 'Signed waiver' : null, shiftIds: [], by: 'user', at: stamp })
const batch = (cycleId = paid): Batch => ({ id: 'b_0000000000000001', cycleId, destination: 'Payroll', workers: 1, gross: 180, held: 0, csvPath: `${accountHash(email)}/paid.csv`, createdAt: at })
const dispute = (): Dispute => ({ id: 'dp_0000000000000001', cycleId: paid, worker: party.name, description: 'One missing hour', source: 'paste', status: 'open', adjustment: null, createdAt: at })
type ThreadMessages = Thread & { messages: Message[] }
type ResponseBody = { error?: string; decisions: Decision[]; decision: Decision; batch: Batch; thread: ThreadMessages; threads: ThreadMessages[]; dispute: Dispute; nextStep: NextStep }

function payload(cycleId = paid, withGaps = false): CyclePayload {
  return {
    cycle: { id: cycleId, start: cycleId === paid ? '2026-09-14' : '2026-09-21', end: cycleId, cutoff: '2026-09-28', deadline: '2026-09-30', payDate: '2026-10-02', status: 'needs-review' },
    sample: false, runId: `r_${cycleId}_${withGaps}`, runAt: at, sites: [{ name: 'Pacific Cold Storage', supervisor: { name: 'Maria Castillo' } }],
    week: [{ id: 's_000000000001', worker: party.name, rate: 20, fac: 0, day: 1, punches: [{ in: 480, out: 960 }], meal: null, geo: [475, 975], prov: { file: 'f_1', row: 2, cols: {} }, entryIds: ['e_1'] }],
    results: [{ held: false, rate: 20, payableMin: 480, workedMin: 480, pay: 180, rows: [{ ruleId: 'CA-MB-01', status: 'flag', effect: { premiumHours: 1 } }] }],
    totals: { gross: 180, shifts: 1, workers: 1, under: 20, over: 0, flags: 1, held: 0, naive: 160 }, counts: { set1: 1, set2: 1, set3: 1 },
    groups: [{ id: 4, ruleId: 'CA-MB-01' }], gaps: [], extraGroups: [],
    intake: { sources: [], expected: withGaps ? [{ worker: party.name, client: 'Pacific Cold Storage', day: 1, source: '1', onSite: 500 }] : [], received: [] },
  } as unknown as CyclePayload
}

async function setup(journey: JourneyStore = createMemoryJourneyStore(), store: DataStore = createMemoryDataStore()) {
  for (const id of [paid, next]) {
    const p = payload(id), run: RunRecord = { cycleId: id, runId: `reg_${id}_${Math.random()}`, periodStart: p.cycle.start, inputHash: '', storagePath: `${accountHash(email)}/runs/${id}.json.gz`, totals: p.totals, counts: p.counts, groups: p.groups, gaps: [], sample: false, runAt: at }
    await store.saveRun(email, run, [], p)
  }
  const doc: Record<string, unknown> = {}
  async function call(path: string, body?: unknown, ownEmail = email) {
    let status = 0, raw = '', headers: Record<string, string> = {}
    const response = { writeHead(code: number, h: Record<string, string>) { status = code; headers = h }, end(value: string | Buffer) { raw = headers['Content-Encoding'] === 'gzip' ? gunzipSync(value as Buffer).toString() : String(value) } } as unknown as ServerResponse
    try {
      assert.equal(await handleJourney({ method: body === undefined ? 'GET' : 'POST', path, url: new URL(`http://test${path}`), email: ownEmail, doc,
        currentDoc: async () => doc, store, service: { recompute: async () => [] } as unknown as DataService, journey, response, readBody: async () => body, sync: async () => {} }), true)
    } catch (error) {
      if (!(error instanceof DataError)) throw error
      return { status: error.status, body: { error: error.message } as ResponseBody }
    }
    return { status, body: JSON.parse(raw) as ResponseBody }
  }
  return { store, journey, doc, call }
}

test('numeric and canonical decisions share one id; legacy aliases consolidate latest-first; unknown groups fail', async () => {
  const { journey, call } = await setup()
  await journey.upsertDecision(email, decision('d_legacy', '4', 'dismissed'))
  await journey.upsertDecision(email, decision('d_newer', 'CA-MB-01', 'approved', '2026-09-21T00:00:00.000Z'))
  const old = await call(`/data/cycles/${paid}`)
  assert.deepEqual(old.body.decisions.map((d: Decision) => [d.groupId, d.decision]), [['CA-MB-01', 'approved']])
  assert.equal((await journey.listDecisions(email)).length, 1)
  const first = await call(`/data/cycles/${paid}/decisions`, { groupId: '4', decision: 'dismissed', reason: 'Waiver' })
  const again = await call(`/data/cycles/${paid}/decisions`, { groupId: 'CA-MB-01', decision: 'approved' })
  assert.equal(first.body.decision.id, again.body.decision.id)
  assert.equal(again.body.decision.groupId, 'CA-MB-01')
  assert.equal((await call(`/data/cycles/${paid}/decisions`, { groupId: 'UNKNOWN', decision: 'approved' })).status, 400)
  const sent = await call(`/data/cycles/${paid}/send`, {})
  assert.equal(sent.body.batch.gross, 180, 'new approval restores the premium')
})

test('every dispute entry point requires a sent batch owned by this account', async () => {
  const { journey, call } = await setup()
  assert.equal((await call('/data/disputes', { cycleId: paid, worker: party.name, description: 'Missing hour', source: 'paste' })).status, 422)
  assert.equal((await call('/data/disputes/simulate', { cycleId: paid })).status, 422)
  await journey.createBatch('other@hypertrack.io', batch())
  assert.equal((await call('/data/disputes/simulate', { cycleId: paid })).status, 422)
  await journey.upsertDispute(email, dispute())
  assert.equal((await call(`/data/disputes/${dispute().id}/resolve`, { decision: 'adjust', hours: 1, amount: 20, note: 'Verified' })).status, 422)
  assert.equal((await journey.listDisputes(email))[0].status, 'open')
  await journey.createBatch(email, batch())
  assert.equal((await call('/data/disputes/simulate', { cycleId: paid })).status, 201)
})

test('outgoing messages recheck current never-contact names and legacy site context without mutation', async () => {
  const { journey, doc, call } = await setup()
  await journey.saveConversation(email, thread(), [])
  doc.neverContact = ['Ana Diaz']
  assert.equal((await call(`/data/threads/${thread().id}/messages`, { dir: 'out', text: 'Follow up' })).status, 403)
  assert.deepEqual(await journey.listMessages(email, [thread().id]), [])
  assert.equal((await journey.listThreads(email))[0].status, 'open')
  assert.equal((await call(`/data/threads/${thread().id}/messages`, { dir: 'in', text: 'Voluntary reply' })).status, 201)
  const siteThread = { ...thread('t_0000000000000002'), counterparty: { kind: 'site' as const, name: 'Maria Castillo', gapIds: ['Pacific Cold Storage|Ana Diaz|1'] } }
  await journey.saveConversation(email, siteThread, [])
  doc.neverContact = ['Pacific Cold Storage']
  assert.equal((await call(`/data/threads/${siteThread.id}/messages`, { dir: 'out', text: 'Follow up' })).status, 403, 'site remains blocked after its gap reconciles')
  const disputeThread = { ...thread('t_0000000000000003'), disputeId: dispute().id }
  await journey.saveConversation(email, disputeThread, [], dispute())
  doc.neverContact = ['Ana Diaz']
  assert.equal((await call(`/data/threads/${disputeThread.id}/messages`, { dir: 'out', text: 'Dispute follow up' })).status, 403)
})

test('memory conversation writes reject an invalid message before publishing thread or dispute changes', async () => {
  const store = createMemoryJourneyStore(), t = { ...thread(), disputeId: dispute().id }
  await assert.rejects(store.saveConversation(email, t, [{ ...message(), text: 'x'.repeat(4001) }], dispute()), /messages_write_failed/)
  assert.deepEqual([await store.listThreads(email), await store.listDisputes(email), await store.listMessages(email, [t.id])], [[], [], []])
  await store.saveConversation(email, t, [message()], dispute())
  await assert.rejects(store.saveConversation(email, { ...t, status: 'resolved' }, [message()], { ...dispute(), status: 'rejected' }), /messages_write_failed/)
  assert.equal((await store.listThreads(email))[0].status, 'open')
  assert.equal((await store.listDisputes(email))[0].status, 'open')
})

test('100-gap asks remain open, produce a bounded draft and atomically save their full gap context', async () => {
  const { store, journey, call } = await setup()
  const p = payload(paid, true)
  p.intake.expected = Array.from({ length: 100 }, (_, i) => ({ worker: `Worker ${String(i).padStart(3, '0')} ${'Longlastname'.repeat(3)}`, client: 'Pacific Cold Storage', day: i % 7, source: '1', onSite: 500 }))
  const run = (await store.getRun(email, paid))!
  await store.saveRun(email, { ...run, runId: `${run.runId}_bulk`, storagePath: run.storagePath + '_bulk' }, [], p)
  const gaps = p.intake.expected.map(g => `${g.client}|${g.worker}|${g.day}`)
  const result = await call(`/data/cycles/${paid}/asks`, { gapIds: gaps })
  assert.equal(result.status, 200)
  assert.equal(result.body.threads.length, 1)
  assert.equal(result.body.threads[0].counterparty.gapIds!.length, 100)
  assert.deepEqual(result.body.threads[0].counterparty.siteNames, ['Pacific Cold Storage'])
  assert.ok(result.body.threads[0].messages[0].text.length <= 4000)
  assert.equal((await call(`/data/cycles/${paid}`)).body.nextStep.counts.gaps, 100)
  assert.equal((await journey.listMessages(email, [result.body.threads[0].id])).length, 1)
})

test('long dispute evidence is split into bounded notes without truncation', async () => {
  const { store, journey, call } = await setup()
  const p = payload()
  p.week = Array.from({ length: 20 }, (_, i) => ({ ...p.week[0], id: `s_${String(i).padStart(12, '0')}`, day: i % 7, prov: { ...p.week[0].prov, file: `f_${i}_${'evidence'.repeat(60)}` } }))
  p.results = p.week.map(() => structuredClone(p.results[0]))
  const run = (await store.getRun(email, paid))!
  await store.saveRun(email, { ...run, runId: `${run.runId}_evidence`, storagePath: run.storagePath + '_evidence' }, [], p)
  await journey.createBatch(email, batch())
  const result = await call('/data/disputes', { cycleId: paid, worker: party.name, description: 'Missing hour', source: 'paste' })
  assert.equal(result.status, 201)
  const notes = result.body.thread.messages.filter((m: Message) => m.dir === 'note') as Message[]
  assert.ok(notes.length > 1)
  assert.ok(notes.every(m => m.text.length <= 4000))
  for (const shift of p.week) assert.ok(notes.map(m => m.text).join('').includes(shift.prov.file))
})

test('resolution and export snapshot share a lock even through distinct route invocations', async () => {
  const base = createMemoryJourneyStore()
  let release!: () => void, reached!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), saving = new Promise<void>(resolve => { reached = resolve })
  const journey = { ...base, saveConversation: async (...args: Parameters<JourneyStore['saveConversation']>) => {
    if (args[3]?.status === 'adjusted') { reached(); await gate }
    await base.saveConversation(...args)
  } }
  const { call } = await setup(journey)
  await base.createBatch(email, batch())
  await base.saveConversation(email, { ...thread(), disputeId: dispute().id }, [], dispute())
  const resolution = call(`/data/disputes/${dispute().id}/resolve`, { decision: 'adjust', hours: 1, amount: 20, note: 'Verified' })
  await saving
  let sent = false
  const send = call(`/data/cycles/${next}/send`, { force: true }).then(result => { sent = true; return result })
  await setImmediate()
  assert.equal(sent, false, 'send must wait for the adjustment commit')
  release()
  assert.equal((await resolution).body.dispute.adjustment!.next_cycle_id, next)
  assert.equal((await send).body.batch.gross, 200, 'snapshot includes $180 base plus $20 adjustment')
})

test('an adjustment resolving behind an in-progress send selects the next unsent cycle', async () => {
  const base = createMemoryDataStore(), journey = createMemoryJourneyStore()
  let release!: () => void, reached!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), writing = new Promise<void>(resolve => { reached = resolve })
  const store = { ...base, putObject: async (...args: Parameters<DataStore['putObject']>) => {
    if (args[1].includes('/batches/')) { reached(); await gate }
    await base.putObject(...args)
  } }
  const { call } = await setup(journey, store)
  await journey.createBatch(email, batch())
  await journey.saveConversation(email, { ...thread(), disputeId: dispute().id }, [], dispute())
  const send = call(`/data/cycles/${next}/send`, { force: true })
  await writing
  const resolution = call(`/data/disputes/${dispute().id}/resolve`, { decision: 'adjust', hours: 1, amount: 20, note: 'Verified' })
  await setImmediate()
  release()
  assert.equal((await send).body.batch.gross, 180)
  assert.equal((await resolution).body.dispute.adjustment!.next_cycle_id, '2026-10-04')
})

test('Supabase conversations use one RPC and message keyset pagination retains message 5001 and timestamp ties', async () => {
  const rows = Array.from({ length: 5102 }, (_, i) => ({ id: `m_${String(i).padStart(16, '0')}`, thread_id: thread().id, email, dir: 'note', text: i === 5101 ? 'Reconciled correction' : 'Evidence', status: 'recorded', at }))
  type RpcBody = { p_thread: { email: string }; p_messages: { thread_id: string }[]; p_dispute: { id: string } }
  const requests: { url: URL; body: RpcBody }[] = []
  const client = createClient('https://test.supabase.co', 'service-test', { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)), body = JSON.parse(String(init?.body ?? '{}')) as RpcBody
    requests.push({ url, body })
    if (url.pathname.endsWith('/rpc/closeout_save_conversation')) return new Response('', { status: 200 })
    assert.equal(url.searchParams.get('email'), `eq.${email}`)
    assert.equal(url.searchParams.get('order'), 'at.asc,id.asc')
    const after = /id.gt.(m_\d+)/.exec(url.searchParams.get('or') ?? '')?.[1]
    // Intentionally simulate a deployment with a row cap below the requested page size.
    return new Response(JSON.stringify(rows.filter(row => !after || row.id > after).slice(0, 137)), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } } })
  const store = createJourneyStore(client)
  await store.saveConversation(email, { ...thread(), disputeId: dispute().id }, [message()], dispute())
  assert.equal(requests.length, 1)
  assert.equal(requests[0].body.p_thread.email, email)
  assert.equal(requests[0].body.p_messages[0].thread_id, thread().id)
  assert.equal(requests[0].body.p_dispute.id, dispute().id)
  const messages = await store.listMessages(email, [thread().id])
  assert.equal(messages.length, rows.length)
  assert.equal(new Set(messages.map(m => m.id)).size, rows.length)
  assert.equal(messages.at(-1)!.text, 'Reconciled correction')
})
