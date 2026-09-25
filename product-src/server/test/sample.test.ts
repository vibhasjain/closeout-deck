import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DataService } from '../src/data.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { buildSample, findings } from '../../src/lib/sample.ts'

test('real sample files reproduce all seven findings; engine overtime stays visible; seed and deletion are idempotent', async () => {
  const store = createMemoryDataStore(), service = new DataService(store), email = 'sample@example.com', now = new Date('2026-09-22T12:00:00Z')
  const seeded = await service.seed(email, {}, now), run = await store.getRun(email, seeded.cycleId)
  assert.equal(seeded.cycleId, '2026-09-20'); assert.ok(run)
  const payload = await store.getRunPayload(email, seeded.cycleId)
  assert.ok(payload)
  const expected = findings(buildSample(), d => `day ${d}`)
  assert.deepEqual(payload.groups.map(f => [f.id, f.cases, Math.round(f.amount * 100) / 100, f.hoursLabel]), expected.map(f => [f.id, f.cases.length, Math.round(f.amount * 100) / 100, f.hoursLabel]))
  assert.equal(Math.round(payload.groups.reduce((sum, f) => sum + f.amount, 0) / 10) * 10, 12100)
  const fires = (id: string) => payload.results.filter(r => r.rows.some(row => row.ruleId === id && (row.status === 'flag' || row.status === 'held' || row.status === 'applied' && !!row.effect))).length
  assert.equal(fires('CA-OT-8'), 1452); assert.equal(fires('FED-OT-40'), 65); assert.equal(fires('FED-RR-01'), 65); assert.equal(fires('CS-EXACT'), 0); assert.equal(fires('FAC-GEO-01'), 0); assert.equal(payload.totals.held, 0); assert.equal(payload.week.length, 6283)
  const moved = payload.results.filter(r => r.rows.some(row => row.ruleId === 'SRC-WEEK-01'))
  assert.equal(moved.length, 5); assert.equal(moved.filter(r => r.rows.some(row => row.ruleId === 'FED-OT-40' && row.effect)).length, 5)
  assert.deepEqual(payload.extraGroups.map(g => [g.ruleId, g.cases, g.amount]), [['CA-OT-8', 1452, 2304.67], ['FED-OT-40', 65, 1190], ['FED-RR-01', 5, 45]])
  assert.deepEqual(payload.counts, { set1: 6282, set2: 15675, set3: 6283 }); assert.deepEqual(payload.gaps, [])
  const again = await service.seed(email, {}, now)
  assert.deepEqual(again, seeded); assert.equal((await store.getRun(email, seeded.cycleId))?.runId, run.runId); assert.equal((await store.listFiles(email)).length, 4)
  await store.deleteSample(email)
  assert.equal((await store.listFiles(email)).length, 0); assert.equal((await store.listEntries(email)).length, 0); assert.equal((await store.listSources(email)).length, 0); assert.equal((await store.listFacts(email)).length, 0); assert.equal((await store.listRuns(email)).length, 0)
})
