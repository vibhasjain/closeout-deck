import assert from 'node:assert/strict'
import test from 'node:test'
import { recentCycles } from '../../src/lib/cycles.ts'
import { DataService, dateKey, localToday } from '../src/data.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { calendarFrom } from '../src/pipeline.ts'

const email = 'data-integration@example.com'
const now = new Date('2026-09-22T12:00:00Z')
const header = ['Candidate', 'Placement ID', 'Client', 'Job Title', 'Date', 'Start', 'End', 'Break (min)', 'Hours', 'Pay Rate', 'Bill Rate', 'Entered Via', 'Status', 'Approved By', 'Comment']
function csv(options: { date?: string; start?: string; end?: string; hours?: string; comment?: string } = {}) {
  const row = ['Ana Pena', '123', 'Pacific Cold Storage', 'Picker', options.date ?? '09/14/2026', options.start ?? '6:00 AM', options.end ?? '2:00 PM', '0', options.hours ?? '8', '20', '30', 'Clock import', 'Approved', 'Supervisor', options.comment ?? 'original']
  return Buffer.from([header, row].map(row => row.join(',')).join('\r\n') + '\r\n')
}
function setup() { const store = createMemoryDataStore(); return { store, service: new DataService(store) } }

test('alias facts re-normalize stored originals and update worker identity and evidence', async () => {
  const { store, service } = setup()
  const file = await service.ingestFile(email, { name: 'bullhorn_09-20-2026.csv', bytes: csv(), set: 1 }, {}, now)
  const before = (await store.listEntries(email))[0]
  assert.equal(before.workerKey, 'ana pena')
  const result = await service.setFact(email, { kind: 'alias', key: `${file.sourceId}|123`, value: { workerKey: 'canonical-worker' } }, {}, new Date(now.getTime() + 1000))
  const entries = await store.listEntries(email)
  assert.equal(entries.length, 1); assert.equal(entries[0].workerKey, 'canonical-worker')
  assert.notEqual(entries[0].id, before.id); assert.equal(entries[0].prov.file, file.id); assert.equal(entries[0].prov.row, 2)
  assert.ok(result.cycles.includes('2026-09-20'))
  const run = await store.getRunPayload(email, '2026-09-20')
  assert.ok(run?.week.some(shift => shift.entryIds.includes(entries[0].id)))
})

test('account and site timezone facts re-normalize DST elapsed minutes from originals', async () => {
  const { store, service } = setup(), at = new Date('2026-11-02T12:00:00Z'), doc = { timezone: 'UTC' }
  const file = await service.ingestFile(email, { name: 'bullhorn_11-01-2026.csv', bytes: csv({ date: '10/31/2026', start: '10:00 PM', end: '6:00 AM', hours: '' }), set: 1 }, doc, at)
  const first = (await store.listEntries(email))[0]
  assert.equal(first.end! - first.start!, 480)
  await service.setFact(email, { kind: 'account', key: 'timezone', value: { value: 'America/Los_Angeles' } }, doc, new Date(at.getTime() + 1000))
  const fallBack = (await store.listEntries(email))[0]
  assert.equal(fallBack.end! - fallBack.start!, 540); assert.ok(fallBack.flags.includes('dst'))
  assert.equal(fallBack.fileId, file.id)
  await service.setFact(email, { kind: 'site', key: 'pacific cold storage', value: { state: 'CA', tz: 'UTC' } }, doc, new Date(at.getTime() + 2000))
  const overridden = (await store.listEntries(email))[0]
  assert.equal(overridden.end! - overridden.start!, 480); assert.equal(overridden.flags.includes('dst'), false)
  assert.equal(overridden.prov.file, file.id)
})

test('account-local Sunday remains the open period until local midnight', () => {
  const doc = { timezone: 'America/Los_Angeles' }
  const sunday = localToday([], doc, new Date('2026-09-21T02:00:00Z'))
  assert.equal(dateKey(sunday), '2026-09-20'); assert.equal(sunday.getHours(), 0)
  const cycle = recentCycles(calendarFrom(doc), 2, sunday)[0]
  assert.equal(cycle.id, '2026-09-20'); assert.equal(cycle.status, 'in-progress')
  const monday = localToday([], doc, new Date('2026-09-21T07:00:00Z'))
  assert.equal(dateKey(monday), '2026-09-21')
  assert.equal(recentCycles(calendarFrom(doc), 2, monday)[1].id, '2026-09-20')
  const monthEnd = localToday([], doc, new Date('2026-10-01T02:00:00Z'))
  assert.equal(recentCycles(calendarFrom({ ...doc, frequency: 'Monthly' }), 2, monthEnd)[0].id, '2026-09-30')
})

for (const [frequency, cycleId] of [['Monthly', '2026-09-30'], ['Biweekly', '2026-09-27']] as const) {
  test(`${frequency} sample seed returns the containing configured pay cycle`, async () => {
    const { store, service } = setup(), doc = { frequency, timezone: 'America/New_York' }
    const seeded = await service.seed(email, doc, now)
    assert.equal(seeded.cycleId, cycleId)
    const run = await store.getRun(email, cycleId), payload = await store.getRunPayload(email, cycleId)
    assert.ok(run); assert.ok(payload); assert.ok(seeded.entries > 28_000); assert.ok(seeded.groups.length > 0)
    assert.ok(run.periodStart <= '2026-09-14' && run.cycleId >= '2026-09-20')
    assert.equal(payload.cycle.id, seeded.cycleId)
  })
}

test('a cycle whose overlapping file builds no time entries is not rebuilt on every read', async () => {
  const store = createMemoryDataStore()
  let reads = 0
  const service = new DataService({ ...store, listEntries: (...args) => { reads++; return store.listEntries(...args) } })
  // Location-only evidence overlaps the open cycle but yields no shift, so no run is published.
  const bytes = Buffer.from('Worker,Site,Date,Entered,Exited\r\nAna Pena,Pacific Cold Storage,09/22/2026,6:00 AM,2:00 PM\r\n')
  const file = await service.ingestFile(email, { name: 'hypertrack_location_09-27-2026.csv', bytes, set: 3, method: 'simulated', deferRun: true }, {}, now)
  assert.equal(file.status, 'normalized'); assert.equal(file.firstDate, '2026-09-22')
  reads = 0
  assert.deepEqual(await service.recompute(email, {}, now), [])
  assert.equal(reads, 1); assert.equal(await store.getRun(email, '2026-09-27'), null)
  assert.deepEqual(await service.recompute(email, {}, now), [])
  assert.equal(reads, 1)
  // Changed inputs still rebuild the cycle.
  await service.setFact(email, { kind: 'account', key: 'burden', value: { value: 0.3 } }, {}, new Date(now.getTime() + 1000))
  assert.equal(reads, 2)
})

test('future exports are assigned to future cycles while preserving the biweekly anchor', async () => {
  const { store, service } = setup(), doc = { frequency: 'Biweekly' }
  const file = await service.ingestFile(email, { name: 'bullhorn_10-11-2026.csv', bytes: csv({ date: '10/06/2026' }), set: 1 }, doc, now)
  assert.equal(file.status, 'normalized'); assert.deepEqual(file.cycles, ['2026-10-11'])
  const run = await store.getRun(email, '2026-10-11')
  assert.ok(run); assert.equal(run.periodStart, '2026-09-28')
  assert.equal((await store.getRunPayload(email, '2026-10-11'))?.cycle.status, 'in-progress')
})

test('sample deletion restores real originals after deterministic entry ids changed ownership', async () => {
  const { store, service } = setup()
  const real = await service.ingestFile(email, { name: 'real_09-20-2026.csv', bytes: csv(), set: 1 }, {}, now)
  const before = (await store.listEntries(email))[0]
  const sample = await service.ingestFile(email, { name: 'simulated_09-20-2026.csv', bytes: csv({ comment: 'sample' }), set: 1, sample: true, method: 'simulated' }, {}, new Date(now.getTime() + 1000))
  const replaced = (await store.listEntries(email))[0]
  assert.equal(replaced.id, before.id); assert.equal(replaced.fileId, sample.id)
  // Same write-through sequence as DELETE /data/sample.
  await store.deleteSample(email)
  await service.renormalizeOriginals(email, {}, new Date(now.getTime() + 2000))
  await service.recompute(email, {}, new Date(now.getTime() + 2000))
  const entries = await store.listEntries(email)
  assert.equal(entries.length, 1); assert.equal(entries[0].id, before.id); assert.equal(entries[0].fileId, real.id)
  assert.equal(entries[0].sample, false); assert.equal(entries[0].supersededBy, null)
  assert.equal((await store.listFiles(email)).length, 1); assert.equal((await store.listSources(email)).length, 1)
  assert.deepEqual(await store.getObject(email, real.storagePath), csv()); assert.equal(await store.getObject(email, sample.storagePath), null)
  assert.equal((await store.getRun(email, '2026-09-20'))?.sample, false)
})

test('a contradictory upload hint is preserved and the cached library mapping is not applied', async () => {
  const { store, service } = setup()
  await service.ingestFile(email, { name: 'first_09-20-2026.csv', bytes: csv(), set: 1 }, {}, now)
  const file = await service.ingestFile(email, { name: 'second_09-27-2026.csv', bytes: csv({ date: '09/21/2026' }), set: 2 }, {}, new Date(now.getTime() + 1000))
  assert.equal(file.status, 'needs_mapping'); assert.equal(file.setHint, 2); assert.equal(file.set, 2)
  assert.equal(file.periodEnd, '2026-09-27'); assert.equal(file.mappingId, null)
  assert.ok(file.unparsed.some(row => row.reason.includes('contradicts')))
  assert.equal((await store.listEntries(email, { fileId: file.id })).length, 0)
  assert.equal((await store.getSource(email, file.sourceId!))?.set, 2)
})

test('simulated sheet and inbox connectors load their source sample shape and remain idempotent', async () => {
  const { store, service } = setup()
  const first = await service.connect(email, { set: 2, system: 'Shared sheet', site: 'Pacific Cold Storage' }, {}, now)
  assert.equal(first.files.length, 1); assert.equal(first.files[0].status, 'normalized'); assert.equal(first.files[0].sample, true)
  const source = (await store.listSources(email)).find(s => s.system === 'Shared sheet')
  assert.equal(source?.method, 'simulated'); assert.equal(source?.site, 'Pacific Cold Storage'); assert.equal(source?.sample, true)
  const repeat = await service.connect(email, { set: 2, system: 'Shared sheet', site: 'Pacific Cold Storage' }, {}, now)
  assert.equal(repeat.files[0].id, first.files[0].id)
  const adp = await service.connect(email, { set: 2, system: 'ADP Workforce Now', site: 'Mercy General' }, {}, now)
  assert.equal(adp.files[0].status, 'normalized'); assert.match(adp.files[0].name, /^adp/)
  assert.ok((await store.listEntries(email, { fileId: adp.files[0].id })).every(e => e.site === 'Mercy General'))
  const inbox = await service.connect(email, { set: 1, system: 'Forwarding inbox', site: 'Pacific Cold Storage' }, {}, now)
  assert.equal(inbox.files[0].status, 'normalized')
  assert.ok((await store.listEntries(email, { fileId: inbox.files[0].id })).every(e => e.site === 'Pacific Cold Storage' && e.sample))
})

test('a connection site stays on its source; the cached layout mapping never inherits it', async () => {
  const { store, service } = setup()
  const adp = await service.connect(email, { set: 2, system: 'ADP Workforce Now', site: 'Mercy General' }, {}, now)
  assert.ok((await store.listEntries(email, { fileId: adp.files[0].id })).every(e => e.site === 'Mercy General'))
  const layout = (await store.listMappings(email)).find(m => m.id === adp.files[0].mappingId)!
  assert.equal(layout.spec.source.site, 'Lonestar Packaging')
  assert.equal(layout.spec.source.system, 'ADP')
  await service.renormalizeOriginals(email, {})
  assert.ok((await store.listEntries(email, { fileId: adp.files[0].id })).every(e => e.site === 'Mercy General'))
})

test('simulated location connector names its file after the week its rows fall in, so it normalizes', async () => {
  const { service } = setup()
  await service.connect(email, { set: 1, system: 'Forwarding inbox', site: 'Pacific Cold Storage' }, {}, now)
  const location = await service.connect(email, { set: 3 }, {}, now)
  const closing = recentCycles(calendarFrom({}), 2, localToday([], {}, now))[1]
  assert.equal(location.files.length, 1)
  assert.equal(location.files[0].name, `hypertrack_location_${closing.id}.csv`)
  assert.equal(location.files[0].status, 'normalized')
  assert.ok(location.cycles.includes(closing.id))
})

test('agent mapping stores validator-expanded datetime punches for deterministic replay', async () => {
  const { store, service } = setup()
  const file = await service.ingestFile(email, { name: 'events.csv', set: 1, bytes: Buffer.from('Person,When,Direction\nAda,2026-09-14T08:00:00Z,IN\nAda,2026-09-14T16:00:00Z,OUT\n') }, {}, now)
  const result = await service.applyAgentMapping(email, file.id, { v: 1, file: file.id, set: 1, source: { system: 'Clock', site: 'Warehouse' }, grain: 'punch', headerRow: 1, overnight: 'next-day', columns: {
    worker: { col: 'Person', name: 'first last' }, start: { col: 'When', format: 'ISO' }, direction: { col: 'Direction', map: { IN: 'in', OUT: 'out' } },
  } }, {}, now)
  assert.equal(result.ok, true)
  assert.equal((await store.listMappings(email))[0].spec.columns.date.col, 'When')
  assert.equal((await store.listEntries(email))[0].end! - (await store.listEntries(email))[0].start!, 480)
  await service.renormalizeOriginals(email, {}, now)
  assert.equal((await store.listEntries(email)).length, 1)
})

test('one agent layout preserves source-specific sites across validation, normalization and replay', async () => {
  const { store, service } = setup()
  const fileBytes = (worker: string) => Buffer.from(`Person,Date,Hours\n${worker},09/14/2026,8\n`)
  const one = await service.ingestFile(email, { name: 'west.csv', bytes: fileBytes('Ada'), set: 1, site: 'West', system: 'Clock' }, {}, now)
  const two = await service.ingestFile(email, { name: 'east.csv', bytes: fileBytes('Ben'), set: 1, site: 'East', system: 'Clock' }, {}, now)
  const result = await service.applyAgentMapping(email, one.id, { v: 1, file: one.id, set: 1, source: { system: 'Clock', site: 'West' }, grain: 'daily', headerRow: 1, overnight: 'next-day', columns: {
    worker: { col: 'Person', name: 'first last' }, date: { col: 'Date', format: 'MM/DD/YYYY' }, hours: { col: 'Hours', unit: 'decimal', per: 'row' },
  } }, {}, now)
  assert.equal(result.ok, true)
  const entries = await store.listEntries(email)
  assert.equal(entries.find(e => e.fileId === one.id)?.site, 'West'); assert.equal(entries.find(e => e.fileId === two.id)?.site, 'East')
  await service.renormalizeOriginals(email, {}, now)
  assert.equal((await store.listEntries(email)).find(e => e.fileId === two.id)?.site, 'East')
})
