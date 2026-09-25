import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { accountHash, CHAT_HISTORY_LIMIT, createDataStore, createMemoryDataStore, DuplicateFileError, validateFact, verifyRebuiltEntries } from '../src/datastore.ts'
import type { FileRecord, RunRecord, SourceRecord } from '../src/datastore.ts'
import type { TimeEntry } from '../src/ingest.ts'
import type { CyclePayload, FindingCase } from '../src/pipeline.ts'

const email = 'first@hypertrack.io', other = 'second@hypertrack.io'
const source: SourceRecord = { id: 'src_one', set: 1, system: 'Spreadsheet', site: 'Site', method: 'upload', sample: false, createdAt: '2026-09-25T00:00:00.000Z', lastReceivedAt: null }
function file(id = 'f_one', sample = false): FileRecord {
  return { id, sourceId: source.id, mappingId: null, name: 'time.csv', mime: 'text/csv', bytes: 20, sha256: id, storagePath: `${accountHash(email)}/files/${id}/time.csv`, status: 'received', fingerprint: null, setHint: 1, periodEnd: null, firstDate: null, lastDate: null, rowCount: 1, entryCount: 1, unparsed: [], sample, receivedAt: '2026-09-25T00:00:00.000Z', normalizedAt: null }
}
function entry(fileId = 'f_one'): TimeEntry {
  return { id: `e_${fileId}`, fileId, sourceId: source.id, set: 1, kind: 'work', worker: 'Worker One', workerKey: 'worker one', workerExt: null, site: 'Site', siteKey: 'site', role: null, workDate: '2026-09-20', start: 480, end: 960, mealMin: null, minutes: 480, sched: null, payRate: 20, billRate: 30, capture: 'clock', payCode: null, approvedBy: null, edited: null, comment: null, dupOf: null, supersededBy: null, flags: [], prov: { file: fileId, row: 2, cols: { start: 'Start', end: 'End' } }, sample: false }
}
function run(runId = 'r_one'): RunRecord {
  return { cycleId: '2026-09-20', runId, periodStart: '2026-09-14', inputHash: runId, storagePath: `${accountHash(email)}/runs/2026-09-20/${runId}.json.gz`, totals: {} as CyclePayload['totals'], counts: { set1: 1, set2: 0, set3: 0 }, groups: [], gaps: [], sample: false, runAt: '2026-09-25T00:00:00.000Z' }
}
const finding: FindingCase = { shiftId: 'shift', ruleId: 'CS-01', seq: 0, status: 'flag', note: 'Duplicate time', delta: 0, exposure: 20, entryIds: ['e_f_one'], worker: 'Worker One', site: 'Site', workDate: '2026-09-20' }

test('memory store isolates accounts, hides incomplete and superseded data, preserves file provenance', async () => {
  const store = createMemoryDataStore()
  await store.upsertSource(email, source)
  await store.upsertFile(email, file())
  await store.replaceEntries(email, 'f_one', [entry()])
  assert.equal((await store.listEntries(email)).length, 0)
  assert.equal(await store.countEntries(email, 'f_one'), 1)
  await store.upsertFile(email, { ...file(), status: 'normalized' })
  assert.deepEqual((await store.listEntries(email))[0].prov, entry().prov)
  assert.equal(await store.getFile(other, 'f_one'), null)
  assert.deepEqual(await store.listEntries(other), [])
  await store.upsertFile(email, file('f_two'))
  assert.equal(await store.supersedeEntries(email, source.id, 'f_two', [{ workerKey: 'worker one', workDate: '2026-09-20' }]), 1)
  assert.deepEqual(await store.listEntries(email), [])
  assert.equal((await store.listEntries(email, { includeSuperseded: true }))[0].supersededBy, 'f_two')
  await assert.rejects(store.upsertFile(email, { ...file('f_three'), sha256: 'f_one' }), DuplicateFileError)
  const copied = await store.getFile(email, 'f_one')
  copied!.name = 'changed.csv'
  assert.equal((await store.getFile(email, 'f_one'))?.name, 'time.csv')
})

test('chat rows are append-only, account scoped and bounded when loading the latest history', async () => {
  const store = createMemoryDataStore()
  const row = { id: 'same-id', role: 'agent' as const, text: 'Original closing line', at: 1 }
  await store.appendChat(email, [row])
  await store.appendChat(email, [{ ...row, text: 'Overwritten' }])
  await store.appendChat(other, [{ ...row, text: 'Other account' }])
  assert.equal((await store.listChat(email))[0].text, row.text)
  assert.equal((await store.listChat(other))[0].text, 'Other account')
  await store.appendChat(email, Array.from({ length: CHAT_HISTORY_LIMIT + 10 }, (_, n) => ({ ...row, id: `line-${n}`, at: n + 2 })))
  const history = await store.listChat(email)
  assert.equal(history.length, CHAT_HISTORY_LIMIT)
  assert.equal(history[0].id, 'line-10')
  assert.ok(history[0].at < history.at(-1)!.at)
})

test('memory run publication serves only current findings and gzip payload, paths are account scoped', async () => {
  const store = createMemoryDataStore(), first = run(), second = run('r_two')
  const payload = { runId: first.runId } as CyclePayload
  await store.saveRun(email, first, [finding], payload)
  assert.deepEqual(await store.getRunPayload(email, first), payload)
  assert.deepEqual(await store.listFindings(other, first.cycleId), [])
  await store.saveRun(email, second, [], { runId: second.runId } as CyclePayload)
  assert.deepEqual(await store.listFindings(email, second.cycleId), [])
  assert.equal(await store.getRunPayload(email, first), null)
  assert.equal(await store.getObject(email, first.storagePath), null)
  await assert.rejects(store.getObject(other, second.storagePath), /invalid_storage_path/)
  await assert.rejects(store.putObject(email, `${accountHash(email)}/files/../secret`, Buffer.from('x')), /invalid_storage_path/)
  await store.deleteRun(other, second.cycleId)
  assert.ok(await store.getRun(email, second.cycleId))
  await store.deleteRun(email, second.cycleId)
  assert.equal(await store.getRun(email, second.cycleId), null)
  assert.equal(await store.getObject(email, second.storagePath), null)
})

test('rebuild verifies counts after deterministic ids transfer to a corrected export', async () => {
  const store = createMemoryDataStore()
  await store.upsertSource(email, source)
  await store.upsertFile(email, { ...file(), status: 'normalized' })
  const original = entry()
  await store.replaceEntries(email, 'f_one', [original])
  await store.upsertFile(email, file('f_two'))
  await store.supersedeEntries(email, source.id, 'f_two', [{ workerKey: original.workerKey, workDate: original.workDate }])
  const replacement = { ...original, fileId: 'f_two', prov: { ...original.prov, file: 'f_two' } }
  await store.replaceEntries(email, 'f_two', [replacement])
  await store.upsertFile(email, { ...file('f_two'), status: 'normalized' })
  assert.equal(await store.countEntries(email, 'f_one'), 0)
  assert.equal(await store.countEntries(email, 'f_two'), 1)
  const owned = await verifyRebuiltEntries(store, email, [{ fileId: 'f_one', entries: [{ ...original, supersededBy: 'f_two' }] }, { fileId: 'f_two', entries: [replacement] }])
  assert.deepEqual(owned, [replacement])
  await assert.rejects(verifyRebuiltEntries(store, email, [{ fileId: 'f_one', entries: [original] }]), /rebuild_entry_count_mismatch/)
})

test('sample deletion preserves real files, facts and sources, removes objects and advances fact manifest', async () => {
  const store = createMemoryDataStore()
  await store.upsertSource(email, source)
  await store.upsertSource(email, { ...source, id: 'sample', sample: true })
  await store.upsertFile(email, file())
  await store.upsertFile(email, { ...file('sample', true), sourceId: 'sample' })
  await store.putObject(email, file('sample', true).storagePath, Buffer.from('sample'))
  await store.upsertFact(email, { kind: 'account', key: 'burden', value: { value: .2 }, source: 'sample', sample: true, updatedAt: '' })
  await store.upsertFact(email, { kind: 'account', key: 'timezone', value: { value: 'UTC' }, source: 'user', sample: false, updatedAt: '' })
  const before = await store.manifest(email)
  await store.deleteSample(email)
  assert.equal((await store.listFiles(email)).length, 1)
  assert.equal((await store.listSources(email)).length, 1)
  assert.equal((await store.listFacts(email)).length, 1)
  assert.equal(await store.getObject(email, file('sample').storagePath), null)
  assert.ok((await store.manifest(email)).factsUpdatedAt! > before.factsUpdatedAt!)
})

test('fact validator rejects invalid state, timezone, non-finite rates and unknown fields', () => {
  for (const value of [
    { kind: 'site', key: 'site', value: { state: 'XX' } },
    { kind: 'site', key: 'site', value: { state: 'CA', tz: 'Not/AZone' } },
    { kind: 'rate', key: 'site|*', value: { pay: Infinity } },
    { kind: 'rate', key: 'site|*', value: { pay: 1001 } },
    { kind: 'differential', key: 'site', value: { perHour: -1 } },
    { kind: 'account', key: 'workweekStart', value: { value: 'Mon' } },
    { kind: 'alias', key: 'src|person', value: { workerKey: 'one', extra: true } },
  ]) assert.equal(validateFact(value).ok, false)
  assert.equal(validateFact({ kind: 'site', key: 'site', value: { state: 'CA', tz: 'America/Los_Angeles', minWage: 16.9, supervisor: { name: 'Manager' } } }).ok, true)
  assert.equal(validateFact({ kind: 'account', key: 'workweekStart', value: { value: 'Monday' } }).ok, true)
})

function mockStore(reply: (path: URL, method: string, body: unknown) => unknown) {
  const requests: { url: URL; method: string; body: unknown }[] = []
  const client = createClient('https://test.supabase.co', 'test-service-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)), method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : init?.body
      requests.push({ url, method, body })
      const data = reply(url, method, body)
      if (data instanceof Response) return data
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } },
  })
  return { store: createDataStore(client), requests }
}

test('Supabase manifest uses three narrow account-scoped queries', async () => {
  const { store, requests } = mockStore(url => url.pathname.endsWith('facts') ? [{ updated_at: '2026-09-25T00:00:00.000Z' }] : [])
  assert.deepEqual(await store.manifest(email), { files: [], runs: [], factsUpdatedAt: '2026-09-25T00:00:00.000Z' })
  assert.equal(requests.length, 3)
  for (const request of requests) {
    assert.equal(request.url.searchParams.get('email'), `eq.${email}`)
    assert.notEqual(request.url.searchParams.get('select'), '*')
  }
})

test('Supabase chat append namespaces local ids and reads only the authenticated account', async () => {
  const line = { id: 'local-id', role: 'agent' as const, text: 'Ready', at: Date.parse('2026-09-25T12:00:00.000Z'), scope: 'setup', cards: [], context: { traces: ['Read handbooks/disputes.md', 'Read data/decisions.jsonl'] } }
  const { store, requests } = mockStore((url, method) => method === 'GET' && url.pathname.endsWith('/closeout_chat')
    ? [{ ...line, id: `${accountHash(email)}:${line.id}`, at: new Date(line.at).toISOString() }]
    : [])
  await store.appendChat(email, [line])
  const append = requests.find(request => request.url.pathname.endsWith('/closeout_chat'))!
  assert.equal(append.method, 'POST')
  assert.deepEqual((append.body as { context: unknown }[])[0].context, line.context)
  assert.equal(append.url.searchParams.get('on_conflict'), 'id')
  assert.deepEqual((append.body as { id: string; email: string }[]).map(row => [row.id, row.email]), [[`${accountHash(email)}:${line.id}`, email]])
  assert.deepEqual(await store.listChat(email), [line])
  const read = requests.at(-1)!
  assert.equal(read.url.searchParams.get('email'), `eq.${email}`)
  assert.equal(read.url.searchParams.get('limit'), String(CHAT_HISTORY_LIMIT))
  assert.equal(read.url.searchParams.get('order'), 'at.desc')
})

test('Supabase entry reads filter normalized files and paginate beyond the default 1000', async () => {
  const { store, requests } = mockStore(url => {
    const size = url.searchParams.get('offset') === '0' ? 1000 : 1
    return Array.from({ length: size }, (_, index) => ({ id: `e_${index}`, email, file_id: 'f_one', work_date: '2026-09-20', sched_start: null, sched_end: null, closeout_files: { status: 'normalized' } }))
  })
  assert.equal((await store.listEntries(email, { limit: 2000 })).length, 1001)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].url.searchParams.get('closeout_files.status'), 'eq.normalized')
  assert.equal(requests[0].url.searchParams.get('superseded_by'), 'is.null')
  assert.equal(requests[1].url.searchParams.get('offset'), '1000')
  for (const request of requests) assert.equal(request.url.searchParams.get('email'), `eq.${email}`)
})

test('Supabase writes payload and batched findings before switching the account cycle pointer', async () => {
  const previous = run('r_previous'), next = run('r_next')
  const { store, requests } = mockStore((url, method) => {
    if (method === 'GET' && url.pathname.endsWith('/closeout_runs')) return [{ email, cycle_id: previous.cycleId, run_id: previous.runId, storage_path: previous.storagePath }]
    return []
  })
  const findings = Array.from({ length: 1001 }, (_, i) => ({ ...finding, shiftId: `shift_${i}` }))
  await store.saveRun(email, next, findings, { runId: next.runId } as CyclePayload)
  const uploads = requests.filter(r => r.method === 'POST' && r.url.pathname.includes('/storage/v1/object/'))
  assert.equal(uploads.length, 1)
  const batches = requests.filter(r => r.method === 'POST' && r.url.pathname.endsWith('/closeout_findings'))
  assert.deepEqual(batches.map(r => (r.body as unknown[]).length), [1000, 1])
  const published = requests.find(r => r.method === 'POST' && r.url.pathname.endsWith('/closeout_runs'))!
  assert.ok(requests.indexOf(uploads[0]) < requests.indexOf(batches[0]))
  assert.ok(requests.indexOf(batches[1]) < requests.indexOf(published))
  assert.ok(requests.findIndex(r => r.method === 'DELETE' && r.url.pathname.endsWith('/closeout_findings')) > requests.indexOf(published))
  for (const request of requests.filter(r => r.url.pathname.startsWith('/rest/v1/'))) {
    if (request.method === 'POST') {
      for (const row of Array.isArray(request.body) ? request.body : [request.body]) assert.equal((row as Record<string, unknown>).email, email)
    } else assert.equal(request.url.searchParams.get('email'), `eq.${email}`)
  }
})

test('a failed Supabase entry batch restores rows transferred from an older export', async () => {
  const original = { ...entry(), id: 'e_same' }, originalDb = {
    ...original, email, file_id: original.fileId, source_id: original.sourceId, set_no: 1,
    worker_key: original.workerKey, work_date: original.workDate, superseded_by: null,
  }
  const rows = new Map<string, Record<string, unknown>>([[original.id, originalDb]])
  let entryBatches = 0
  const { store, requests } = mockStore((url, method, body) => {
    if (url.pathname.endsWith('/closeout_sources')) return [{ ...source, email, set_no: source.set }]
    if (url.pathname.endsWith('/closeout_files')) {
      if (url.searchParams.has('id')) return [{ ...file('f_two'), email, source_id: source.id }]
      return [{ ...file(), email, source_id: source.id }, { ...file('f_two'), email, source_id: source.id }]
    }
    if (url.pathname.endsWith('/closeout_entries')) {
      if (method === 'GET') return [...rows.values()].filter(row => !url.searchParams.has('file_id') || `eq.${row.file_id}` === url.searchParams.get('file_id'))
      if (method === 'DELETE') { for (const [id, row] of rows) if (`eq.${row.file_id}` === url.searchParams.get('file_id')) rows.delete(id); return [] }
      if (method === 'POST') {
        entryBatches++
        if (entryBatches === 2) return new Response(JSON.stringify({ message: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
        for (const row of body as Record<string, unknown>[]) rows.set(row.id as string, row)
        return []
      }
    }
    return []
  })
  const replacement = Array.from({ length: 1001 }, (_, i) => ({ ...entry('f_two'), id: i === 0 ? original.id : `e_${i}` }))
  await assert.rejects(store.replaceEntries(email, 'f_two', replacement), /data_entries_write_failed/)
  assert.equal(rows.size, 1)
  assert.equal(rows.get(original.id)?.file_id, 'f_one')
  assert.equal(rows.get(original.id)?.superseded_by, null)
  assert.equal(entryBatches, 3, 'two attempted batches followed by restoring the snapshot')
  for (const request of requests.filter(r => r.method !== 'POST')) assert.equal(request.url.searchParams.get('email'), `eq.${email}`)
})

test('Supabase sample removal limits deletes to sample rows and removes only their storage objects', async () => {
  const sampleFile = file('sample', true), realFile = file(), sampleRun = { ...run('r_sample'), sample: true }
  const { store, requests } = mockStore((url, method) => {
    if (method === 'GET' && url.pathname.endsWith('/closeout_files')) return [sampleFile, realFile].map(f => ({ ...f, email, storage_path: f.storagePath }))
    if (method === 'GET' && url.pathname.endsWith('/closeout_runs')) return [{ ...sampleRun, email, cycle_id: sampleRun.cycleId, run_id: sampleRun.runId, storage_path: sampleRun.storagePath }]
    return []
  })
  await store.deleteSample(email)
  const deletes = requests.filter(r => r.method === 'DELETE' && r.url.pathname.startsWith('/rest/v1/'))
  assert.equal(deletes.length, 6)
  for (const request of deletes) {
    assert.equal(request.url.searchParams.get('email'), `eq.${email}`)
    if (!request.url.pathname.endsWith('/closeout_findings')) assert.equal(request.url.searchParams.get('sample'), 'eq.true')
    else assert.equal(request.url.searchParams.get('run_id'), `eq.${sampleRun.runId}`)
  }
  const storageDelete = requests.find(r => r.method === 'DELETE' && r.url.pathname.includes('/storage/v1/object/'))!
  assert.deepEqual((storageDelete.body as { prefixes: string[] }).prefixes, [sampleFile.storagePath, sampleRun.storagePath])
  assert.ok(!(storageDelete.body as { prefixes: string[] }).prefixes.includes(realFile.storagePath))
})

test('Supabase call rows upsert after the account row and read back scoped to the account', async () => {
  const call = { id: '0f9c2b1e-5d7a-4c3b-9e8f-1a2b3c4d5e6f', startedAt: '2026-09-25T12:00:00.000Z', seconds: 276, transcript: [{ role: 'user' as const, text: 'Weekly', startMs: 1_000 }], summary: null }
  const { store, requests } = mockStore((url, method) => method === 'GET' && url.pathname.endsWith('/closeout_calls')
    ? { id: call.id, started_at: '2026-09-25T12:00:00+00:00', seconds: 276, transcript: call.transcript, summary: null } : [])
  await store.putCall(email, call)
  const [account, write] = requests
  assert.ok(account.url.pathname.endsWith('/closeout_state'))
  assert.ok(write.url.pathname.endsWith('/closeout_calls')); assert.equal(write.method, 'POST'); assert.equal(write.url.searchParams.get('on_conflict'), 'id')
  assert.deepEqual(write.body, { id: call.id, email, started_at: call.startedAt, seconds: 276, transcript: call.transcript, summary: null })
  assert.deepEqual(await store.getCall(email, call.id), call)
  const read = requests.at(-1)!
  assert.equal(read.url.searchParams.get('email'), `eq.${email}`); assert.equal(read.url.searchParams.get('id'), `eq.${call.id}`)
})
