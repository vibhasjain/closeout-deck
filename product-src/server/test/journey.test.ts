import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createTraceMapper, runClaude, type ClaudeEvent } from '../src/claude.ts'
import {
  buildExport, defaultDestination, nextStep, openGaps, summarize, toCsv, validateAsks, validateDecision, validateDispute,
  validateMessage, validateResolve, validateSend, CSV_COLUMNS,
} from '../src/journey.ts'
import type { Batch, Decision, Dispute, JourneyCycle, ReviewGroup, Thread } from '../src/journey.ts'
import { createJourneyStore, createMemoryJourneyStore } from '../src/journeyStore.ts'
import type { JourneyStore } from '../src/journeyStore.ts'
import { writeJourney } from '../src/journeyRoutes.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CyclePayload } from '../src/pipeline.ts'

const email = 'person@hypertrack.io'
const counts = { set1: 10, set2: 10, set3: 10 }
const group = (id: string, state: ReviewGroup['state'], num: number | null = null): ReviewGroup => ({ id, num, state, shiftIds: ['s_000000000001'] })
const decision = (groupId: string, kind: Decision['decision'] = 'approved', cycleId = '2026-09-20'): Decision =>
  ({ id: `d_${groupId}`, cycleId, groupId, shiftIds: [], decision: kind, reason: kind === 'dismissed' ? 'Waiver on file' : null, by: 'user', at: '2026-09-25T00:00:00.000Z' })
const batch: Batch = { id: 'b_0000000000000001', cycleId: '2026-09-20', destination: 'ADP', workers: 2, gross: 100, held: 1, csvPath: 'x/batches/b.csv', createdAt: '' }

test('nextStep follows get timesheets → chase missing → review → send → done', () => {
  const cycle: JourneyCycle = { id: '2026-09-20', counts, gaps: [], groups: [group('CA-MB-01', 'proposed', 4), group('CON-MARGIN-01', 'judgment', 7), group('SRC-VMS-01', 'waiting', 1)] }
  const missing = nextStep({ ...cycle, counts: { ...counts, set3: 0 }, gaps: ['a|b|1'] }, [], null)
  assert.equal(missing.kind, 'get_timesheets')
  assert.equal(missing.detail, 'No location yet')
  assert.deepEqual(missing.counts, { missingSets: 1, gaps: 1, openGroups: 2 })
  const chase = nextStep({ ...cycle, gaps: ['a|b|1', 'a|c|2'] }, [], null)
  assert.equal(chase.kind, 'chase_missing')
  assert.equal(chase.detail, '2 time entries have no client-approved hours')
  const review = nextStep(cycle, [decision('CA-MB-01')], null)
  assert.deepEqual([review.kind, review.label, review.counts.openGroups], ['review', 'Review 1 issue', 1])
  // Waiting groups never block; a decision may name the group's numeric finding id.
  const send = nextStep(cycle, [decision('CA-MB-01'), decision('7', 'escalated')], null)
  assert.deepEqual([send.kind, send.label], ['send', 'Send to Payroll'])
  assert.equal(nextStep(cycle, [decision('CA-MB-01', 'approved', '2026-09-13')], null).counts.openGroups, 2, 'another cycle\'s decision does not count')
  // A sent cycle is done, whatever else is open: it is never re-sent.
  assert.deepEqual([nextStep({ ...cycle, counts: { ...counts, set2: 0 } }, [], batch).kind, nextStep(cycle, [], batch).detail], ['done', 'Sent to ADP · Demo'])
})

// A two-worker cycle: Ana has a meal premium and daily overtime; Ben has one held time entry.
const payload = {
  cycle: { id: '2026-09-20', start: '2026-09-14', end: '2026-09-20', cutoff: '2026-09-21', deadline: '2026-09-23', payDate: '2026-09-25', status: 'needs-review' },
  groups: [{ id: 4, ruleId: 'CA-MB-01' }],
  sites: [{ name: 'Pacific Cold Storage', supervisor: { name: 'Maria Castillo' } }],
  week: [
    { id: 's_00000000000a', worker: 'Ana Diaz', fac: 0, day: 2, punches: [{ in: 480, out: 1080 }], geo: [470, 1130], prov: { file: 'f_one', row: 2, cols: {} }, entryIds: ['e_1'] },
    { id: 's_00000000000b', worker: 'Ben Ortiz', fac: 0, day: 3, punches: [{ in: 480, out: null }], geo: null, prov: { file: 'f_one', row: 3, cols: {} }, entryIds: ['e_2'] },
    { id: 's_00000000000c', worker: 'Ben Ortiz', fac: 0, day: 4, punches: [{ in: 480, out: 960 }], geo: [475, 965], prov: { file: 'f_one', row: 4, cols: {} }, entryIds: ['e_3'] },
  ],
  results: [
    { held: false, rate: 20, payableMin: 570, pay: 20 * 9.5 + 20 * 1.5 / 2 + 20, rows: [
      { ruleId: 'CA-OT-8', status: 'applied', note: '', effect: { otPremiumMin: 45, dailyOtMin: 90 } },
      { ruleId: 'CA-MB-01', status: 'flag', note: '', effect: { premiumHours: 1 } }] },
    { held: true, rate: 18, payableMin: 0, pay: 0, rows: [{ ruleId: 'TS-COMPLETE', status: 'held', note: '', effect: { holdAll: true } }] },
    { held: false, rate: 18, payableMin: 480, pay: 144, rows: [] },
  ],
  intake: { expected: [{ worker: 'Ana Diaz', client: 'Pacific Cold Storage', day: 2, source: 'x' }, { worker: 'Ben Ortiz', client: 'Pacific Cold Storage', day: 4, source: 'x', onSite: 490 }], received: ['Pacific Cold Storage|Ana Diaz|2'], sources: [] },
  counts,
} as unknown as CyclePayload

test('summary groups rules by resolution state and lists intake gaps; accepted and asked gaps close', () => {
  const summary = summarize(payload)
  assert.deepEqual(summary.groups.map(g => [g.id, g.state, g.num]), [['CA-MB-01', 'proposed', 4], ['TS-COMPLETE', 'waiting', null]])
  assert.deepEqual(summary.gaps.map(g => g.id), ['Pacific Cold Storage|Ben Ortiz|4'])
  assert.equal(summary.supervisors['Pacific Cold Storage'], 'Maria Castillo')
  const asked: Thread = { id: 't_1', cycleId: '2026-09-20', shiftId: null, disputeId: null, counterparty: { kind: 'site', name: 'Maria Castillo', gapIds: ['Pacific Cold Storage|Ben Ortiz|4'] }, status: 'waiting', createdAt: '' }
  assert.equal(openGaps(summary, {}, []).length, 1)
  assert.equal(openGaps(summary, {}, [asked]).length, 0)
  assert.equal(openGaps(summary, { acceptedGaps: { '2026-09-20:Pacific Cold Storage|Ben Ortiz|4': { reason: 'Not worked' } } }, []).length, 0)
})

test('the Payroll export has the contract columns, excludes held entries, and carries next-cycle adjustments', () => {
  const adjustment: Dispute = { id: 'dp_1', cycleId: '2026-09-13', worker: 'Ben Ortiz', description: 'Missing 1h', source: 'paste', status: 'adjusted', adjustment: { hours: 1, amount: 18, next_cycle_id: '2026-09-20' }, createdAt: '' }
  const elsewhere: Dispute = { ...adjustment, id: 'dp_2', adjustment: { hours: 2, amount: 36, next_cycle_id: '2026-09-27' } }
  const out = buildExport(payload, [], [adjustment, elsewhere])
  assert.deepEqual(out.lines, [
    { worker: 'Ana Diaz', regular_hours: 8, ot_hours: 1.5, premium_hours: 1, gross: 225, held_entries: 0 },
    { worker: 'Ben Ortiz', regular_hours: 8, ot_hours: 0, premium_hours: 0, gross: 144, held_entries: 1 },
    { worker: 'Ben Ortiz · Adjustment for 2026-09-13', regular_hours: 1, ot_hours: 0, premium_hours: 0, gross: 18, held_entries: 0 },
  ])
  assert.deepEqual([out.workers, out.gross, out.held], [2, 387, 1])
  const csv = toCsv(out.lines).split('\r\n')
  assert.equal(csv[0], CSV_COLUMNS.join(','))
  assert.equal(csv[0], 'worker,regular_hours,ot_hours,premium_hours,gross,held_entries')
  assert.equal(csv[2], 'Ben Ortiz,8.00,0.00,0.00,144.00,1')
  // A dismissed proposal (by rule id or numeric group id) removes its own premium from pay.
  for (const id of ['CA-MB-01', '4']) assert.deepEqual(buildExport(payload, [{ ...decision(id, 'dismissed') }], []).lines[0], { worker: 'Ana Diaz', regular_hours: 8, ot_hours: 1.5, premium_hours: 0, gross: 205, held_entries: 0 })
  assert.equal(toCsv([{ worker: '=HYPERLINK("x")', regular_hours: 0, ot_hours: 0, premium_hours: 0, gross: 0, held_entries: 0 }]).split('\r\n')[1], `"'=HYPERLINK(""x"")",0.00,0.00,0.00,0.00,0`)
})

test('destination defaults to the profile Payroll system, else Payroll', () => {
  assert.equal(defaultDestination({ profile: { payrollRunBy: 'I do, in adp' } }), 'ADP')
  assert.equal(defaultDestination({ profile: { payrollRunBy: { summary: 'Finance runs Paychex Flex' } } }), 'Paychex')
  assert.equal(defaultDestination({}), 'Payroll')
})

test('trace frames name workspace-relative handbook and data reads, at most 3 data reads, once each', () => {
  const cwd = '/data/accounts/0123456789abcdef'
  const read = (...paths: string[]) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Checking' }, ...paths.map(file_path => ({ type: 'tool_use', name: 'Read', input: { file_path } }))] } })
  const trace = createTraceMapper(cwd)
  assert.deepEqual(trace(read(`${cwd}/handbooks/send-to-payroll.md`, `${cwd}/nextstep.md`)), [{ trace: 'Read handbooks/send-to-payroll.md' }])
  assert.deepEqual(trace(read(`${cwd}/handbooks/send-to-payroll.md`)), [], 'a repeated read is traced once')
  assert.deepEqual(trace(read('data/cycles/2026-09-20.json', `${cwd}/data/threads/t_1.md`, `${cwd}/data/gaps.md`, `${cwd}/data/entries/2026-09-20.jsonl`)).map(f => f.trace),
    ['Read data/cycles/2026-09-20.json', 'Read data/threads/t_1.md', 'Read data/gaps.md'])
  assert.deepEqual(trace(read(`${cwd}/handbooks/disputes.md`)), [{ trace: 'Read handbooks/disputes.md' }], 'handbooks are not capped')
  assert.deepEqual(trace(read(`${cwd}/../other/handbooks/x.md`, '/etc/handbooks/y.md')), [], 'nothing outside the workspace')
  assert.deepEqual(trace(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'x', path: `${cwd}/handbooks/a.md` } }] } })), [])
  assert.deepEqual(trace(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Read' } } })), [])
  assert.deepEqual(trace('not json "tool_use"'), [])
})

test('trace frames also match the CLI\'s resolved workspace path', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'closeout-trace-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: join(await realpath(cwd), 'handbooks', 'mediation.md') } }] } })
  assert.deepEqual(createTraceMapper(cwd)(line), [{ trace: 'Read handbooks/mediation.md' }])
})

test('runClaude streams trace frames before the reply text', async t => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'closeout-trace-cli-')))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(join(cwd, 'handbooks'))
  const command = join(cwd, 'fake-claude.mjs')
  await writeFile(command, `#!/usr/bin/env node
const out = v => process.stdout.write(JSON.stringify(v) + '\\n')
out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: ${JSON.stringify(join(cwd, 'handbooks', 'send-to-payroll.md'))} } }] } })
out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Ready to send' } } })
out({ type: 'result', result: 'Ready to send' })
`)
  await chmod(command, 0o700)
  const events: ClaudeEvent[] = []
  await runClaude({ cwd, command, message: 'Send', prompt: 'p', onEvent: event => events.push(event) })
  assert.deepEqual(events.slice(0, 2), [{ trace: 'Read handbooks/send-to-payroll.md' }, { text: 'Ready to send' }])
})

test('an unavailable journey store leaves the workspace with its legacy decisions instead of failing the turn', async t => {
  const writes = new Map<string, string>()
  const broken = { ...createMemoryJourneyStore(), listDecisions: async () => { throw new Error('journey_decisions_read_failed') } } as JourneyStore
  t.mock.method(console, 'error', () => {})
  await writeJourney({ email, store: createMemoryDataStore(), journey: broken, doc: {}, runs: [], legacy: [{ cycleId: '2026-09-20', shiftId: 's_1', decision: 'applied' }], io: {
    write: async (path, value) => { writes.set(path, String(value)) }, present: async () => false, list: async () => [], remove: async () => {} } })
  assert.deepEqual([...writes.keys()], ['data/decisions.jsonl'])
  assert.match(writes.get('data/decisions.jsonl')!, /"shiftId":"s_1"/)
})

test('journey request validators enforce types, caps and unknown keys', () => {
  const bad: [(v: unknown) => unknown, unknown][] = [
    [validateDecision, { groupId: 'CA-MB-01', decision: 'dismissed' }],
    [validateDecision, { groupId: 'CA-MB-01', decision: 'dismissed', reason: '   ' }],
    [validateDecision, { groupId: 'CA-MB-01', decision: 'maybe' }],
    [validateDecision, { groupId: 'x'.repeat(81), decision: 'approved' }],
    [validateDecision, { groupId: '../etc', decision: 'approved' }],
    [validateDecision, { groupId: 'CA-MB-01', decision: 'approved', reason: 'r'.repeat(501) }],
    [validateDecision, { groupId: 'CA-MB-01', decision: 'approved', shiftIds: ['nope'] }],
    [validateDecision, { groupId: 'CA-MB-01', decision: 'approved', extra: true }],
    [validateAsks, { gapIds: [] }],
    [validateAsks, { gapIds: Array.from({ length: 201 }, (_, i) => `g${i}`) }],
    [validateAsks, { gapIds: ['a'], message: 'm'.repeat(2001) }],
    [validateAsks, { gapIds: ['bad\u0000id'] }],
    [validateMessage, { dir: 'sideways', text: 'Hi' }],
    [validateMessage, { dir: 'out', text: 't'.repeat(4001) }],
    [validateMessage, { dir: 'out', text: '' }],
    [validateSend, { destination: 'd'.repeat(81) }],
    [validateSend, { force: 'yes' }],
    [validateDispute, { cycleId: '2026-9-20', worker: 'A', description: 'B', source: 'paste' }],
    [validateDispute, { cycleId: '2026-09-20', worker: 'A', description: 'B', source: 'email' }],
    [validateDispute, { cycleId: '2026-09-20', worker: 'A', description: 'd'.repeat(2001), source: 'paste' }],
    [validateResolve, { decision: 'adjust', note: 'n' }],
    [validateResolve, { decision: 'adjust', hours: 101, note: 'n' }],
    [validateResolve, { decision: 'adjust', amount: Infinity, note: 'n' }],
    [validateResolve, { decision: 'reject' }],
    [validateResolve, []],
  ]
  for (const [validate, value] of bad) assert.throws(() => validate(value), /invalid_body/, JSON.stringify(value)?.slice(0, 80))
  assert.deepEqual(validateDecision({ groupId: '4', decision: 'dismissed', reason: ' Waiver on file ' }), { groupId: '4', decision: 'dismissed', reason: 'Waiver on file', shiftIds: undefined })
  assert.deepEqual(validateAsks({ gapIds: ['a', 'a', 'b'] }).gapIds, ['a', 'b'])
  assert.deepEqual(validateResolve({ decision: 'adjust', hours: 2, note: 'Location backs it' }), { decision: 'adjust', hours: 2, amount: undefined, note: 'Location backs it' })
})

test('decisions are idempotent per cycle and group in the memory store', async () => {
  const store = createMemoryJourneyStore()
  const first = await store.upsertDecision(email, decision('CA-MB-01'))
  const second = await store.upsertDecision(email, { ...decision('CA-MB-01', 'dismissed'), id: 'd_other' })
  assert.equal(second.id, first.id)
  assert.deepEqual((await store.listDecisions(email)).map(d => [d.id, d.decision, d.reason]), [[first.id, 'dismissed', 'Waiver on file']])
  assert.equal((await store.listDecisions('other@hypertrack.io')).length, 0, 'scoped by email')
  assert.deepEqual(await store.createBatch(email, batch), { batch, created: true })
  assert.deepEqual(await store.createBatch(email, { ...batch, id: 'b_0000000000000002' }), { batch, created: false })
  await store.deleteCycles(email, ['2026-09-20'])
  assert.deepEqual([(await store.listDecisions(email)).length, (await store.listBatches(email)).length], [0, 0])
})

test('Supabase journey store maps rows, upserts decisions on the unique key and never replaces a batch', async () => {
  const requests: { url: URL; method: string; body: unknown }[] = []
  const stored = { id: batch.id, email, cycle_id: batch.cycleId, destination: 'ADP', workers: 2, gross: '100.00', held: 1, csv_path: batch.csvPath, created_at: '' }
  const client = createClient('https://test.supabase.co', 'test-service-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? 'GET'
    requests.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
    if (url.pathname.endsWith('/closeout_batches') && method === 'POST') return new Response(JSON.stringify({ code: '23505', message: 'duplicate' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify(url.pathname.endsWith('/closeout_batches') ? [stored] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } } })
  const store = createJourneyStore(client)
  await store.upsertDecision(email, decision('CA-MB-01'))
  const upsert = requests.find(r => r.url.pathname.endsWith('/closeout_decisions') && r.method === 'POST')!
  assert.equal(upsert.url.searchParams.get('on_conflict'), 'email,cycle_id,group_id')
  assert.deepEqual(Object.keys(upsert.body as object).sort(), ['at', 'by', 'cycle_id', 'decision', 'email', 'group_id', 'id', 'reason', 'shift_ids'])
  assert.deepEqual(await store.createBatch(email, { ...batch, id: 'b_0000000000000002' }), { batch: { ...batch, gross: 100 }, created: false })
  assert.ok(requests.every(r => r.method === 'POST' || r.url.searchParams.get('email') === `eq.${email}`), 'every read is scoped by email')
})
