import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assemble, buildCycle, calendarFrom, pipelineInputHash, type PipelineInput } from '../src/pipeline.ts'
import { recentCycles } from '../../src/lib/cycles.ts'
import type { TimeEntry } from '../src/ingest.ts'

let next = 0
function entry(extra: Partial<TimeEntry> = {}): TimeEntry { const id = `e${++next}`; return { id, fileId: 'f1', sourceId: 'src1', set: 1, kind: 'work', worker: 'Ada West', workerKey: 'ada west', workerExt: null, site: 'Test site', siteKey: 'test site', role: 'Picker', workDate: '2026-09-14', start: 360, end: 870, mealMin: 30, minutes: 480, sched: null, payRate: 20, billRate: 30, capture: 'web', payCode: null, approvedBy: null, edited: null, comment: null, dupOf: null, supersededBy: null, flags: [], prov: { file: 'f1', row: next, cols: { start: 'In', end: 'Out' } }, sample: false, ...extra } }
function input(entries: TimeEntry[], extra: Partial<PipelineInput> = {}): PipelineInput { return { email: 'test@example.com', cycle: recentCycles(calendarFrom(), 2, new Date(2026, 8, 22))[1], calendar: calendarFrom(), entries, files: [{ id: 'f1', status: 'normalized' }, { id: 'f2', status: 'normalized' }, { id: 'f3', status: 'normalized' }], facts: [{ kind: 'site', key: 'test site', value: { state: 'CA', city: 'Ontario', tz: 'America/Los_Angeles' } }], ...extra } }

test('sets match on worker/site/date; a client pair gap supplies the meal without counting it twice', () => {
  const one = entry(), two = entry({ fileId: 'f2', set: 2, sourceId: 'src2', start: 360, end: 600, mealMin: null }), three = entry({ fileId: 'f2', set: 2, sourceId: 'src2', start: 630, end: 870, mealMin: null }), geo = entry({ fileId: 'f3', set: 3, kind: 'geo', sourceId: 'src3', start: 355, end: 875, mealMin: null })
  const { payload } = buildCycle(input([one, two, three, geo]))
  assert.equal(payload.week.length, 1); assert.deepEqual(payload.week[0].meal, [600, 630]); assert.deepEqual(payload.week[0].geo, [355, 875]); assert.deepEqual(payload.week[0].vms, { min: 480 }); assert.equal(payload.results[0].payableMin, 480)
  assert.deepEqual(payload.week[0].entryIds, [one.id, two.id, three.id, geo.id]); assert.deepEqual(payload.week[0].prov, one.prov)
})

test('a break length subtracts pay and creates a California meal-times gap', () => {
  const { payload } = buildCycle(input([entry()]))
  assert.equal(payload.week[0].mealMin, 30); assert.equal(payload.results[0].pay, 160); assert.equal(payload.results[0].naive, 160)
  assert.equal(payload.results[0].rows.find(r => r.ruleId === 'CA-MB-01')?.status, 'na'); assert.ok(payload.gaps.some(g => g.kind === 'meal_times'))
})

test('rate fallback is current set1, latest worker/site history, fact, then zero plus a gap', () => {
  const facts = [{ kind: 'rate', key: 'test site|Picker', value: { pay: 18 } }]
  const current = entry(), historical = entry({ workDate: '2026-08-01', payRate: 21 }), missing = entry({ payRate: null })
  assert.equal(assemble(input([current, historical], { facts })).shifts[0].shift.rate, 20)
  assert.equal(assemble(input([missing, historical], { facts })).shifts[0].shift.rate, 21)
  assert.equal(assemble(input([missing], { facts })).shifts[0].shift.rate, 18)
  const zero = assemble(input([missing], { facts: [] })); assert.equal(zero.shifts[0].shift.rate, 0); assert.ok(zero.gaps.some(g => g.kind === 'rate'))
})

test('biweekly 45h + 35h runs separate workweeks and pays 5 overtime hours', () => {
  const calendar = { ...calendarFrom(), frequency: 'Biweekly' as const }
  const cycle = { ...recentCycles(calendarFrom(), 2, new Date(2026, 8, 22))[1], start: new Date(2026, 8, 7) }
  const entries = Array.from({ length: 10 }, (_, i) => entry({ workDate: `2026-09-${String(i < 5 ? 7 + i : 9 + i).padStart(2, '0')}`, start: 360, end: 360 + (i < 5 ? 540 : 420), mealMin: null, payRate: 20 }))
  const { payload } = buildCycle(input(entries, { cycle, calendar, facts: [{ kind: 'site', key: 'test site', value: { state: 'TX' } }] }))
  const overtime = payload.results.flatMap(r => r.rows).filter(r => r.ruleId === 'FED-OT-40' && r.status === 'applied')
  assert.equal(overtime.length, 1); assert.equal(overtime[0].effect?.otPremiumMin, 150); assert.equal(payload.totals.gross, 1650)
})

test('superseded entries do not contribute and shift ids survive identical re-exports', () => {
  const old = entry({ supersededBy: 'f2' }), newer = entry({ fileId: 'f2' })
  const result = assemble(input([old, newer])); assert.equal(result.shifts.length, 1); assert.deepEqual(result.shifts[0].entryIds, [newer.id])
  assert.equal(result.shifts[0].shift.id, assemble(input([entry()])).shifts[0].shift.id)
})

test('wrong-week correction needs an export period and midnight crossing; location alone decides applied vs flag', () => {
  const s2 = entry({ fileId: 'f2', set: 2, sourceId: 'src2', workDate: '2026-09-21', start: 1320, end: 1830, mealMin: 30 })
  const geo = entry({ fileId: 'f3', set: 3, kind: 'geo', workDate: '2026-09-20', start: 1315, end: 1835, mealMin: null })
  const files = [{ id: 'f2', periodEnd: '2026-09-20', status: 'normalized' }, { id: 'f3', status: 'normalized' }]
  assert.equal(buildCycle(input([s2, geo])).findings.some(f => f.ruleId === 'SRC-WEEK-01'), false)
  assert.equal(buildCycle(input([{ ...s2, start: 360, end: 870 }, geo], { files })).findings.some(f => f.ruleId === 'SRC-WEEK-01'), false)
  const flagged = buildCycle(input([s2], { files })); assert.equal(flagged.findings.find(f => f.ruleId === 'SRC-WEEK-01')?.status, 'flag')
  const applied = buildCycle(input([s2, geo], { files })); assert.equal(applied.findings.find(f => f.ruleId === 'SRC-WEEK-01')?.status, 'applied'); assert.equal(applied.payload.week[0].day, 6); assert.equal(applied.payload.results[0].naive, 0)
  const nextCycle = recentCycles(calendarFrom(), 2, new Date(2026, 8, 22))[0]
  assert.equal(buildCycle(input([s2, geo], { files, cycle: nextCycle })).payload.week.length, 0)
})

test('unknown site creates a gap while California rules are skipped', () => {
  const { payload } = buildCycle(input([entry()], { facts: [] }))
  assert.ok(payload.gaps.some(g => g.kind === 'site')); assert.equal(payload.sites[0].state, '')
  assert.equal(payload.results[0].rows.some(r => r.ruleId.startsWith('CA-')), false)
})

test('client hours-only entries are clean shifts and hashes change with facts/calendar/engine', () => {
  const baseline = input([entry({ set: 2, kind: 'hours', start: null, end: null, minutes: 480, mealMin: null })])
  const { payload } = buildCycle(baseline); assert.equal(payload.week[0].prov.hoursOnly, true); assert.equal(payload.results[0].pay, 0)
  const h = pipelineInputHash(baseline)
  assert.notEqual(h, pipelineInputHash({ ...baseline, engineSha: 'other' })); assert.notEqual(h, pipelineInputHash({ ...baseline, facts: [] })); assert.notEqual(h, pipelineInputHash({ ...baseline, calendar: { ...calendarFrom(), cutoffDays: 2 } }))
})

test('a 75-minute pair gap stays a split day while a 30-minute gap is a meal', () => {
  const pairs = [entry({ start: 360, end: 600, mealMin: null }), entry({ start: 675, end: 915, mealMin: null })]
  const split = assemble(input(pairs)).shifts[0].shift
  assert.equal(split.meal, null); assert.deepEqual(split.punches, [{ in: 360, out: 600 }, { in: 675, out: 915 }])
  const meal = assemble(input([pairs[0], { ...pairs[1], start: 630, end: 870 }])).shifts[0].shift
  assert.deepEqual(meal.meal, [600, 630]); assert.deepEqual(meal.punches, [{ in: 360, out: 870 }])
})

test('same-name distinct external IDs remain separate until alias facts resolve them', () => {
  const one = entry({ workerExt: '101' }), two = entry({ workerExt: '102', start: 900, end: 1410 })
  const original = structuredClone([one, two]), data = input([one, two])
  const ambiguous = buildCycle(data)
  assert.equal(ambiguous.payload.week.length, 2); assert.equal(ambiguous.payload.totals.workers, 2)
  assert.ok(ambiguous.payload.gaps.some(g => g.kind === 'worker'))
  assert.deepEqual(data.entries, original)
  const facts = [...data.facts, { kind: 'alias', key: 'src1|101', value: { workerKey: 'ada west' } }, { kind: 'alias', key: 'src1|102', value: { workerKey: 'ada west' } }]
  const resolved = assemble({ ...data, facts })
  assert.equal(resolved.shifts.length, 1); assert.equal(resolved.gaps.some(g => g.kind === 'worker'), false)
})

test('alias corrections take effect on re-run and hours-only pay can use a rate fact', () => {
  const own = entry({ workerKey: 'ada west', worker: 'Ada West' }), client = entry({ set: 2, worker: 'West, A.', workerKey: 'west a', workerExt: '7', sourceId: 'src2', fileId: 'f2' })
  const data = input([own, client]), facts = [...data.facts, { kind: 'alias', key: 'src2|7', value: { workerKey: 'ada west' } }]
  assert.equal(assemble(data).shifts.length, 2); assert.equal(assemble({ ...data, facts }).shifts.length, 1)
  const hours = buildCycle(input([entry({ set: 2, kind: 'hours', start: null, end: null, minutes: 480, mealMin: null, payRate: null })], { facts: [{ kind: 'rate', key: 'w:ada west', value: { pay: 22 } }] }))
  assert.equal(hours.payload.results[0].pay, 176); assert.equal(hours.payload.results[0].naive, 176)
})

test('wrong-week check does not reinterpret an export ending inside a longer pay cycle', () => {
  const calendar = { ...calendarFrom(), frequency: 'Biweekly' as const }, cycle = { ...recentCycles(calendarFrom(), 2, new Date(2026, 8, 22))[1], start: new Date(2026, 8, 7) }
  const night = entry({ set: 2, fileId: 'f2', workDate: '2026-09-14', start: 1320, end: 1830 })
  const { findings } = buildCycle(input([night], { cycle, calendar, files: [{ id: 'f2', periodEnd: '2026-09-13' }] }))
  assert.equal(findings.some(f => f.ruleId === 'SRC-WEEK-01'), false)
})

test('identical times from ambiguous worker IDs are not silently discarded as duplicate pay', () => {
  const one = entry({ workerExt: '101' }), two = entry({ workerExt: '102', dupOf: one.id })
  const result = assemble(input([one, two]))
  assert.equal(result.shifts.length, 2); assert.equal(result.shifts[1].s1[0].dupOf, null); assert.ok(result.gaps.some(g => g.kind === 'worker'))
})

test('unparsed rows remain gaps even if the file has no surviving entries', () => {
  const { gaps } = assemble(input([], { files: [{ id: 'empty', unparsed: [{ row: 3, reason: 'missing date' }] }] }))
  assert.deepEqual(gaps[0].example, { file: 'empty', row: 3 }); assert.equal(gaps[0].kind, 'unparsed')
})
