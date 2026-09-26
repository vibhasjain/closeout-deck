import assert from 'node:assert/strict'
import test from 'node:test'
import { recentCycles } from '../../src/lib/cycles.ts'
import { DataError, DataService, dateKey, emptyCycles, localToday } from '../src/data.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import type { EntryQuery } from '../src/datastore.ts'
import { parseFile } from '../src/ingest.ts'
import type { MappingSpec } from '../src/ingest.ts'
import { calendarFrom } from '../src/pipeline.ts'
import { generateSample } from '../src/sampledata.ts'

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

test('a site fact that leaves time zones and aliases alone does not replay the originals', async () => {
  const store = createMemoryDataStore()
  let replays = 0
  const service = new DataService({ ...store, replaceEntries: (...args) => { replays++; return store.replaceEntries(...args) } })
  await service.ingestFile(email, { name: 'bullhorn_09-20-2026.csv', bytes: csv(), set: 1 }, {}, now)
  replays = 0
  await service.setFact(email, { kind: 'site', key: 'pacific cold storage', value: { state: 'CA', supervisor: { name: 'Maria Castillo' } } }, {}, new Date(now.getTime() + 1000))
  assert.equal(replays, 0)
  await service.setFact(email, { kind: 'site', key: 'pacific cold storage', value: { state: 'CA', tz: 'America/Los_Angeles' } }, {}, new Date(now.getTime() + 2000))
  assert.equal(replays, 1)
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
  // A deploy restarts the process: the memo is gone, the stored marker is not.
  emptyCycles.clear()
  const restarted = new DataService({ ...store, listEntries: (...args) => { reads++; return store.listEntries(...args) } })
  assert.deepEqual(await restarted.recompute(email, {}, now), [])
  assert.equal(reads, 1, 'an unchanged empty cycle is not rebuilt after a restart')
  // Changed inputs still rebuild the cycle, before and after a restart.
  await service.setFact(email, { kind: 'account', key: 'burden', value: { value: 0.3 } }, {}, new Date(now.getTime() + 1000))
  assert.equal(reads, 2)
  emptyCycles.clear()
  assert.deepEqual(await restarted.recompute(email, {}, now), [])
  assert.equal(reads, 2, 'the rebuilt marker is stored too')
  await restarted.setFact(email, { kind: 'account', key: 'burden', value: { value: 0.4 } }, {}, new Date(now.getTime() + 2000))
  assert.equal(reads, 3)
})

test('a stored empty marker never hides time entries that arrive later', async () => {
  const store = createMemoryDataStore(), service = new DataService(store)
  const location = Buffer.from('Worker,Site,Date,Entered,Exited\r\nAna Pena,Pacific Cold Storage,09/15/2026,6:00 AM,2:00 PM\r\n')
  await service.ingestFile(email, { name: 'hypertrack_location_09-20-2026.csv', bytes: location, set: 3, method: 'simulated' }, {}, now)
  assert.equal(await store.getRun(email, '2026-09-20'), null)
  emptyCycles.clear()
  const file = await new DataService(store).ingestFile(email, { name: 'bullhorn_09-20-2026.csv', bytes: csv({ date: '09/15/2026' }), set: 1 }, {}, now)
  assert.deepEqual(file.cycles, ['2026-09-20'])
  assert.equal((await store.getRunPayload(email, '2026-09-20'))?.week.length, 1)
})

test('a connect reads only its own set and dates for duplicates, and the full entry list once to rebuild', async () => {
  const store = createMemoryDataStore(), queries: EntryQuery[] = []
  const service = new DataService({ ...store, listEntries: (account, query = {}) => { queries.push(query); return store.listEntries(account, query) } })
  await service.connect(email, { set: 2, system: 'UKG Pro', site: 'Pacific Cold Storage' }, {}, now)
  queries.length = 0
  const { files } = await service.connect(email, { set: 1, system: 'Bullhorn' }, {}, now)
  assert.ok(files[0].entryCount! > 6000)
  assert.deepEqual(queries, [{ set: 1, from: files[0].firstDate, to: files[0].lastDate }, {}])
})

test('an entry insert that fails mid-batch leaves the file received; the next connect re-ingests it under its id and ends normalized', async () => {
  const store = createMemoryDataStore()
  let fail = true
  // The worst case: one batch landed, the next failed, and no rollback ran.
  const service = new DataService({ ...store, replaceEntries: async (account, fileId, entries) => {
    if (!fail) return store.replaceEntries(account, fileId, entries)
    await store.replaceEntries(account, fileId, entries.slice(0, 1000))
    throw new Error('data_entries_write_failed')
  } })
  const body = { set: 2, system: 'UKG', site: 'Pacific Cold Storage' }
  await assert.rejects(service.connect(email, body, {}, now), /data_entries_write_failed/)
  const [stuck] = await store.listFiles(email)
  assert.equal(stuck.status, 'received')
  assert.equal((await store.listEntries(email)).length, 0)
  assert.equal((await store.listEntries(email, { fileId: stuck.id, includeUnnormalized: true })).length, 1000)
  fail = false
  const retry = await service.connect(email, body, {}, now)
  assert.equal(retry.files[0].id, stuck.id); assert.equal(retry.files[0].status, 'normalized')
  assert.ok(retry.files[0].entryCount! > 6000); assert.deepEqual(retry.cycles, ['2026-09-20'])
  assert.equal((await store.listFiles(email)).length, 1)
  assert.equal((await store.listEntries(email, { fileId: stuck.id, includeUnnormalized: true })).length, retry.files[0].entryCount)
  assert.equal((await store.listEntries(email)).filter(e => e.set === 2).length, retry.files[0].entryCount)
})

test('a connect whose file does not end normalized is an error, on the first attempt and on the retry', async () => {
  const store = createMemoryDataStore(), service = new DataService(store)
  const ukg = generateSample(recentCycles(calendarFrom({}), 2, localToday([], {}, now))[1]).files.find(f => f.name.startsWith('ukg'))!
  // A cached layout the sample no longer fits: the ingest ends at needs_mapping.
  await store.ensureAccount(email)
  await store.upsertMapping(email, { id: 'map_broken', fingerprint: parseFile(ukg.bytes, ukg.name).fingerprint!, spec: { source: { system: 'UKG' } } as MappingSpec, author: 'agent', version: 2, updatedAt: now.toISOString() })
  const body = { set: 2, system: 'UKG', site: 'Pacific Cold Storage' }
  const incomplete = (error: unknown) => error instanceof DataError && error.status === 500 && error.message === 'connect_incomplete'
  await assert.rejects(service.connect(email, body, {}, now), incomplete)
  assert.equal((await store.listFiles(email))[0].status, 'needs_mapping')
  await assert.rejects(service.connect(email, body, {}, now), incomplete)
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

test('QA R4-6: a repeat connect of the same source and period returns its file; another client or vendor still loads its own', async () => {
  const { store, service } = setup()
  const card = await service.connect(email, { set: 2, system: 'ADP', site: 'Lonestar Packaging' }, {}, now)
  const entries = (await store.listEntries(email)).length
  const settings = await service.connect(email, { set: 2, system: 'ADP Workforce Now' }, {}, now)
  assert.equal(settings.files[0].id, card.files[0].id); assert.equal(settings.files[0].status, 'normalized')
  assert.equal((await store.listFiles(email)).length, 1)
  assert.equal((await store.listEntries(email)).length, entries)
  const other = await service.connect(email, { set: 2, system: 'ADP Workforce Now', site: 'Mercy General' }, {}, now)
  assert.notEqual(other.files[0].id, card.files[0].id)
  const sheet = await service.connect(email, { set: 2, system: 'Shared sheet', site: 'Lonestar Packaging' }, {}, now)
  assert.notEqual(sheet.files[0].id, card.files[0].id)
  assert.equal((await store.listFiles(email)).length, 3)
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

test('a generic "Time entries" connection keeps the sample vendor names and the finding copy stays human', async () => {
  const { store, service } = setup()
  await service.connect(email, { set: 1, system: 'Time entries' }, {}, now)
  await service.connect(email, { set: 2, system: 'Time entries' }, {}, now)
  await service.connect(email, { set: 3 }, {}, now)
  const systems = (await store.listSources(email)).map(s => s.system)
  assert.ok(!systems.includes('Time entries'), systems.join(', '))
  const closing = recentCycles(calendarFrom({}), 2, localToday([], {}, now))[1]
  const run = await store.getRunPayload(email, closing.id)
  assert.ok(run && run.groups.length && run.extraGroups.length)
  for (const group of [...run.groups, ...run.extraGroups]) {
    const copy = [group.tag === group.ruleId ? '' : group.tag, group.title, group.summary, group.why, group.action, group.draft ?? '', group.hoursLabel].join(' | ')
    assert.doesNotMatch(copy, /Time entries's|engine (findings|evidence)|\bshifts?\b/i, copy)
  }
  const vms = run.groups.find(g => g.ruleId === 'SRC-VMS-01')
  if (vms) assert.match(vms.summary, /Bullhorn differs from UKG by /)
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

test('removing an upload takes its time entries out of every pay run and brings back the export it replaced', async () => {
  const { store, service } = setup(), later = (s: number) => new Date(now.getTime() + s * 1000)
  const original = await service.ingestFile(email, { name: 'bullhorn_09-20-2026.csv', bytes: csv(), set: 1 }, {}, now)
  const kept = await service.ingestFile(email, { name: 'bullhorn_09-13-2026.csv', bytes: csv({ date: '09/08/2026' }), set: 1 }, {}, later(1))
  const [before] = await store.listEntries(email, { fileId: original.id })
  const wrong = await service.ingestFile(email, { name: 'bullhorn_09-20-2026 (2).csv', bytes: csv({ start: '7:00 AM', end: '3:00 PM' }), set: 1 }, {}, later(2))
  assert.equal(wrong.replaced, 1)
  assert.equal((await store.listEntries(email, { fileId: original.id, includeSuperseded: true }))[0].supersededBy, wrong.id)
  const other = 'other-account@example.com'
  await service.ingestFile(other, { name: 'bullhorn_09-20-2026.csv', bytes: csv({ start: '7:00 AM', end: '3:00 PM' }), set: 1 }, {}, now)
  const otherBefore = await store.manifest(other), mappings = await store.listMappings(email)
  const [wrongEntry] = await store.listEntries(email, { fileId: wrong.id })
  assert.ok((await store.getRunPayload(email, '2026-09-20'))?.week.some(shift => shift.entryIds.includes(wrongEntry.id)))

  const result = await service.removeFile(email, wrong.id, {}, later(3))
  assert.equal(result.ok, true); assert.ok(result.cycles.includes('2026-09-20'))
  assert.equal(await store.getFile(email, wrong.id), null)
  assert.equal(await store.getObject(email, wrong.storagePath), null)
  assert.equal((await store.listEntries(email, { fileId: wrong.id, includeSuperseded: true, includeUnnormalized: true })).length, 0)
  const keptIds = (await store.listEntries(email, { fileId: kept.id })).map(e => e.id)
  assert.deepEqual((await store.listEntries(email)).map(e => [e.id, e.fileId, e.supersededBy]).sort(),
    [[before.id, original.id, null], ...keptIds.map(id => [id, kept.id, null])].sort())
  const payload = await store.getRunPayload(email, '2026-09-20')
  assert.ok(payload?.week.some(shift => shift.entryIds.includes(before.id)))
  assert.ok(!payload?.week.some(shift => shift.entryIds.includes(wrongEntry.id)))
  assert.deepEqual((await store.listFiles(email)).map(f => f.id).sort(), [original.id, kept.id].sort())
  assert.deepEqual(await store.listMappings(email), mappings, 'cached layouts stay')
  assert.deepEqual(await store.manifest(other), otherBefore)
  assert.equal((await store.listEntries(other)).length, 1)
})

test('removing an upload restores ids it took over, drops a source no file uses, and refuses sample or unknown files', async () => {
  const { store, service } = setup(), later = (s: number) => new Date(now.getTime() + s * 1000)
  const original = await service.ingestFile(email, { name: 'bullhorn_09-20-2026.csv', bytes: csv(), set: 1 }, {}, now)
  const [before] = await store.listEntries(email)
  const reexport = await service.ingestFile(email, { name: 'bullhorn_09-20-2026 (2).csv', bytes: csv({ comment: 'fixed' }), set: 1 }, {}, later(1))
  assert.equal((await store.listEntries(email))[0].fileId, reexport.id, 'the re-export owns the shared id')
  await service.removeFile(email, reexport.id, {}, later(2))
  const [restored] = await store.listEntries(email)
  assert.equal(restored.id, before.id); assert.equal(restored.fileId, original.id); assert.equal(restored.comment, 'original')
  assert.equal((await store.getRunPayload(email, '2026-09-20'))?.week.length, 1)

  const location = await service.ingestFile(email, { name: 'hypertrack_location_09-20-2026.csv', set: 3, sample: true, method: 'simulated',
    bytes: Buffer.from('Worker,Site,Date,Entered,Exited\r\nAna Pena,Pacific Cold Storage,09/14/2026,5:58 AM,2:03 PM\r\n') }, {}, later(3))
  await assert.rejects(service.removeFile(email, location.id, {}, later(4)), (error: DataError) => error.status === 409 && error.message === 'sample_file')
  await assert.rejects(service.removeFile(email, 'f_unknown', {}, later(4)), (error: DataError) => error.status === 404)
  await assert.rejects(service.removeFile('other-account@example.com', original.id, {}, later(4)), (error: DataError) => error.status === 404)

  const unknown = await service.ingestFile(email, { name: 'mystery.csv', bytes: Buffer.from('Person,Date,Hours\nAlex,09/15/2026,8\n') }, {}, later(5))
  assert.equal(unknown.status, 'needs_mapping')
  await service.removeFile(email, unknown.id, {}, later(6))
  await service.removeFile(email, original.id, {}, later(7))
  assert.deepEqual((await store.listFiles(email)).map(f => f.id), [location.id])
  assert.deepEqual((await store.listSources(email)).map(s => s.id), [location.sourceId], 'a source no file uses goes with its last file')
  assert.equal(await store.getRun(email, '2026-09-20'), null, 'a week left with no time entries has no pay run')
})

test('removing an export a later one fully took over leaves only the newest export, never the oldest beside it', async () => {
  const { store, service } = setup(), later = (s: number) => new Date(now.getTime() + s * 1000)
  const sheet = (...rows: [string, string, string][]) => Buffer.from([header, ...rows.map(([worker, start, end]) =>
    [worker, worker.slice(0, 3), 'Pacific Cold Storage', 'Picker', '09/14/2026', start, end, '0', '8', '20', '30', 'Clock import', 'Approved', 'Supervisor', 'note'])]
    .map(row => row.join(',')).join('\r\n') + '\r\n')
  const oldest = await service.ingestFile(email, { name: 'bullhorn_09-20-2026.csv', bytes: sheet(['Ana Pena', '6:00 AM', '2:00 PM'], ['Ben Ruiz', '6:00 AM', '2:00 PM']), set: 1 }, {}, now)
  const middle = await service.ingestFile(email, { name: 'bullhorn_09-20-2026 (2).csv', bytes: sheet(['Ana Pena', '7:00 AM', '3:00 PM'], ['Ben Ruiz', '6:00 AM', '2:00 PM']), set: 1 }, {}, later(1))
  const newest = await service.ingestFile(email, { name: 'bullhorn_09-20-2026 (3).csv', bytes: sheet(['Ana Pena', '7:00 AM', '3:00 PM'], ['Ben Ruiz', '6:00 AM', '2:00 PM'], ['Cal Ortiz', '6:00 AM', '2:00 PM']), set: 1 }, {}, later(2))
  assert.equal(await store.countEntries(email, middle.id), 0, 'the newest export took over every id the middle one had')

  await service.removeFile(email, middle.id, {}, later(3))
  const active = await store.listEntries(email)
  assert.deepEqual(active.map(e => e.fileId), [newest.id, newest.id, newest.id])
  assert.equal((await store.listEntries(email, { fileId: oldest.id, includeSuperseded: true })).every(e => e.supersededBy === newest.id), true)
  const payload = await store.getRunPayload(email, '2026-09-20')
  assert.equal(payload?.week.length, 3)
  assert.ok(payload?.week.every(shift => shift.entryIds.length === 1), 'no worker-day is paid twice')
})

test('an original that cannot be replayed refuses the removal before anything is deleted', async () => {
  const store = createMemoryDataStore(), later = (s: number) => new Date(now.getTime() + s * 1000)
  let missing = ''
  const service = new DataService({ ...store, getObject: (account, path) => path === missing ? Promise.resolve(null) : store.getObject(account, path) })
  const original = await service.ingestFile(email, { name: 'bullhorn_09-20-2026.csv', bytes: csv(), set: 1 }, {}, now)
  const wrong = await service.ingestFile(email, { name: 'bullhorn_09-20-2026 (2).csv', bytes: csv({ start: '7:00 AM', end: '3:00 PM' }), set: 1 }, {}, later(1))
  const before = await store.listEntries(email, { includeSuperseded: true })
  missing = original.storagePath
  await assert.rejects(service.removeFile(email, wrong.id, {}, later(2)), (error: DataError) => error.message === 'original_unavailable')
  assert.ok(await store.getFile(email, wrong.id), 'still listed, so Remove can run again')
  assert.deepEqual(await store.listEntries(email, { includeSuperseded: true }), before)
})
