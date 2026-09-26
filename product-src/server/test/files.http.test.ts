import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { Buffer } from 'node:buffer'
import { createServer } from '../src/index.ts'
import { gunzipSync } from 'node:zlib'
import { createMemoryDataStore } from '../src/datastore.ts'
import { DataService } from '../src/data.ts'
import { signSession } from '../src/auth.ts'
import type { CyclePayload } from '../src/pipeline.ts'
import { RERUN_RULES } from '../../src/bench/engine.js'
import { effectiveJourneyRun, journeyPayroll, shiftRules } from '../../src/lib/journeyPay.ts'

const baseEnv = { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: 'dev@hypertrack.io', ALLOWED_DOMAINS: 'hypertrack.io', SESSION_SECRET: 'p5-test-secret-that-is-at-least-32-bytes' }
const post = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const bullhorn = (name = 'Test Worker', minutes = 0) => Buffer.from([
  'Candidate,Placement ID,Client,Job Title,Date,Start,End,Break (min),Hours,Pay Rate,Bill Rate,Entered Via,Status,Approved By,Comment',
  `${name},123,Pacific Cold Storage,Warehouse,09/21/2026,8:00 AM,4:00 PM,${minutes},${8-minutes/60},20,30,Clock import,Approved,Supervisor,`,
].join('\r\n'))
const upload = (body: Buffer, name = 'bullhorn.csv') => ({ method: 'POST', headers: { 'Content-Type': 'text/csv', 'X-File-Name': encodeURIComponent(name), 'X-Set': '1' }, body: new Uint8Array(body) })
async function serve(t: TestContext, signedOut = false, store = createMemoryDataStore()) {
  const root = await mkdtemp(join(tmpdir(), 'closeout-files-http-'))
  const server = createServer({ dataStore: store, env: { ...baseEnv, CLOSEOUT_DEV_EMAIL: signedOut ? undefined : baseEnv.CLOSEOUT_DEV_EMAIL, CLOSEOUT_DATA_DIR: root }, claudeVersion: async () => 'test' })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }) })
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store }
}

test('file and data endpoints reject a signed-out caller', async t => {
  const { url } = await serve(t, true)
  for (const path of ['/files', '/files/foreign/raw', '/data/cycles', '/data/sample']) {
    const response = await fetch(url + path, path === '/data/sample' ? post({}) : {})
    assert.equal(response.status, 401)
    assert.equal((await fetch(url + path, { method: 'DELETE' })).status, 401)
  }
})

test('uploads enforce raw byte caps, magic-byte media checks and safe file names', async t => {
  const { url } = await serve(t)
  assert.equal((await fetch(url + '/files', upload(Buffer.alloc(10 * 1024 * 1024 + 1), 'huge.csv'))).status, 413)
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
  assert.equal((await fetch(url + '/files', upload(png, 'disguised.csv'))).status, 415)
  const response = await fetch(url + '/files', upload(bullhorn(), '../../x.csv'))
  assert.equal(response.status, 201)
  const { file } = await response.json() as { file: { id: string; name: string; status: string; entries: number } }
  assert.equal(file.name, 'x.csv')
  assert.equal(file.status, 'normalized')
  assert.equal(file.entries, 1)
  const raw = await fetch(`${url}/files/${file.id}/raw`)
  assert.deepEqual(Buffer.from(await raw.arrayBuffer()), bullhorn())
  assert.match(raw.headers.get('content-disposition')!, /attachment/)
  const detail = await fetch(`${url}/files/${file.id}`)
  assert.ok((await detail.json() as { profile: string }).profile.includes('Candidate'))
  const duplicate = await fetch(url + '/files', upload(bullhorn(), 'renamed.csv'))
  assert.equal(duplicate.status, 409)
  assert.deepEqual(await duplicate.json(), { error: 'duplicate_file', id: file.id })
  const { sessionToken } = await signSession({ sub: 'other', email: 'other@hypertrack.io', name: 'Other', picture: '' }, baseEnv.SESSION_SECRET)
  const foreign = await fetch(`${url}/files/${file.id}/raw`, { headers: { Authorization: `Bearer ${sessionToken}` } })
  assert.equal(foreign.status, 404)
})

test('unknown layouts await mapping and PDFs await extraction; CORS supports upload headers', async t => {
  const { url } = await serve(t)
  const response = await fetch(url + '/files', upload(Buffer.from('Person,Date,Hours\nAlex,09/21/2026,8\n'), 'unknown.csv'))
  assert.equal(response.status, 201)
  assert.equal((await response.json() as { file: { status: string } }).file.status, 'needs_mapping')
  const pdf = await fetch(url + '/files', upload(Buffer.from('%PDF-1.4\n%%EOF\n'), 'document.pdf'))
  assert.equal(pdf.status, 201)
  assert.equal((await pdf.json() as { file: { status: string } }).file.status, 'needs_extraction')
  const cors = await fetch(url + '/files', { method: 'OPTIONS', headers: { Origin: 'https://closeoutcopilot.com', 'Access-Control-Request-Headers': 'X-File-Name,X-Set', 'Access-Control-Request-Method': 'POST' } })
  assert.equal(cors.status, 204)
  assert.match(cors.headers.get('access-control-allow-headers')!, /X-File-Name/)
  assert.match(cors.headers.get('access-control-allow-methods')!, /DELETE/)
  assert.equal((await fetch(url + '/files', { method: 'OPTIONS', headers: { Origin: 'https://other.example' } })).status, 403)
})

test('sample HTTP seed, gzip cycle, evidence, idempotence and deletion use the ordinary pipeline', async t => {
  const { url, store } = await serve(t)
  const response = await fetch(url + '/data/sample', post({}))
  assert.equal(response.status, 200)
  const seeded = await response.json() as { cycleId: string; entries: number; files: string[]; groups: { id: number; cases: number; amount: number }[] }
  assert.deepEqual(seeded.groups.map(g => [g.id, g.cases, g.amount]), [[1,140,4428],[2,12,3000],[3,8,1664],[4,95,1900],[5,60,270],[6,5,185],[7,6,648]])
  const detail = await fetch(`${url}/data/cycles/${seeded.cycleId}`)
  assert.equal(detail.status, 200)
  assert.equal(detail.headers.get('content-encoding'), 'gzip')
  const cycle = await detail.json() as { week: { id: string; entryIds?: string[]; prov: object }[]; extraGroups: { ruleId: string; cases: number }[]; results: (CyclePayload['results'][number] & { passed: number[] })[]; rulesChecked: string[] }
  assert.equal(cycle.week.length, 6283)
  assert.equal(cycle.extraGroups.find(g => g.ruleId === 'CA-OT-8')?.cases, 1452)
  // The app's copy drops what it never reads; the stored run keeps all of it.
  const run = (await store.getRun(baseEnv.CLOSEOUT_DEV_EMAIL, seeded.cycleId))!
  const stored = JSON.parse(gunzipSync((await store.getObject(baseEnv.CLOSEOUT_DEV_EMAIL, run.storagePath))!).toString()) as CyclePayload
  const rows = cycle.results.flatMap(r => r.rows), storedRows = stored.results.flatMap(r => r.rows)
  assert.deepEqual(cycle.rulesChecked, [...new Set(storedRows.map(row => row.ruleId))])
  assert.equal(cycle.rulesChecked.length, 20)
  assert.ok(rows.every(row => !('kindDefault' in row) && (row.effect || (row.status !== 'pass' && row.status !== 'na') || RERUN_RULES.includes(row.ruleId))), 'no pass/na rows but the rerun markers')
  const fired = (list: typeof rows) => list.filter(row => row.status !== 'pass' && row.status !== 'na').length
  assert.equal(fired(rows), fired(storedRows))
  assert.ok(storedRows.length > 2.5 * rows.length)
  assert.ok(cycle.week.every(shift => !('entryIds' in shift) && !('cols' in shift.prov)))
  // Same pay and the same Closeout Agent view of every time entry (ShiftPage) from either copy, before and after dismissals.
  const week = stored.week.map(s => ({ ...s, fac: stored.sites[s.fac] }))
  const effectRules = [...new Set(storedRows.filter(row => row.effect).map(row => row.ruleId))]
  for (const dismissed of [[], ...effectRules.map(ruleId => [ruleId]), effectRules]) {
    const decisions = dismissed.map(ruleId => ({ groupId: ruleId, decision: 'dismissed' }))
    assert.deepEqual(journeyPayroll(week, cycle.results, decisions), journeyPayroll(week, stored.results, decisions), dismissed.join())
    const view = effectiveJourneyRun(week, cycle.results, decisions).map(result => shiftRules(result, cycle.rulesChecked))
    assert.deepEqual(view, effectiveJourneyRun(week, stored.results, decisions).map(result => shiftRules(result)), dismissed.join())
  }
  // A shift's time entries load on demand, with their column maps.
  const first = stored.week[0]
  const evidence = await fetch(`${url}/data/entries?cycle=${seeded.cycleId}&shift=${first.id}`)
  const entries = (await evidence.json() as { entries: { id: string; prov: { file: string; row: number; cols: object } }[] }).entries
  assert.ok(entries.length > 0)
  assert.ok(entries.every(e => first.entryIds.includes(e.id) && e.prov.row > 0 && Object.keys(e.prov.cols).length > 0))
  const paged = await fetch(`${url}/data/entries?cycle=${seeded.cycleId}`)
  assert.equal((await paged.json() as { entries: unknown[] }).entries.length, 2000)
  const before = await store.manifest(baseEnv.CLOSEOUT_DEV_EMAIL)
  assert.equal((await fetch(url + '/data/sample', post({}))).status, 200)
  assert.deepEqual(await store.manifest(baseEnv.CLOSEOUT_DEV_EMAIL), before)
  assert.equal((await fetch(url + '/data/sample', { method: 'DELETE' })).status, 200)
  assert.equal((await store.listFiles(baseEnv.CLOSEOUT_DEV_EMAIL)).length, 0)
  assert.equal((await store.listEntries(baseEnv.CLOSEOUT_DEV_EMAIL)).length, 0)
  assert.equal((await store.listRuns(baseEnv.CLOSEOUT_DEV_EMAIL)).length, 0)
  const health = await (await fetch(url + '/health')).json() as { engineSha: string }
  assert.match(health.engineSha, /^[a-f0-9]{64}$/)
})

test('facts validate before mutation and simulated location uses this account time entries', async t => {
  const { url, store } = await serve(t)
  assert.equal((await fetch(url + '/data/facts', post({ kind: 'site', key: 'x', value: { state: 'XX' } }))).status, 400)
  assert.equal((await fetch(url + '/data/facts', post({ kind: 'site', key: 'pacific cold storage', value: { state: 'CA', tz: 'America/Los_Angeles' } }))).status, 200)
  await fetch(url + '/files', upload(bullhorn()))
  const response = await fetch(url + '/data/connect', post({ set: 3 }))
  assert.equal(response.status, 200)
  assert.equal((await store.listEntries(baseEnv.CLOSEOUT_DEV_EMAIL)).filter(e => e.set === 3).length, 1)
})

const within = <T>(promise: Promise<T>, ms: number) => Promise.race([promise, new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), ms))])

test('pure reads do not wait behind a data write; cycle reads still do', async t => {
  const memory = createMemoryDataStore()
  let open!: () => void
  const gate = new Promise<void>(resolve => { open = resolve })
  const { url } = await serve(t, false, { ...memory, upsertFact: async (...args) => { await gate; return memory.upsertFact(...args) } })
  try {
    const write = fetch(url + '/data/facts', post({ kind: 'account', key: 'burden', value: { value: 0.3 } }))
    await new Promise(resolve => setTimeout(resolve, 50))
    const cycles = fetch(url + '/data/cycles')
    assert.equal(await within(fetch(url + '/files').then(r => r.status), 2000), 200)
    assert.equal(await within(fetch(url + '/data/disputes').then(r => r.status), 2000), 200)
    assert.equal(await within(cycles, 200), 'pending')
    open()
    assert.equal((await write).status, 200); assert.equal((await cycles).status, 200)
  } finally { open() }
})

test('DELETE /files/:id removes an own upload under the data lock; sample, unknown and foreign files are refused', async t => {
  const memory = createMemoryDataStore(), email = baseEnv.CLOSEOUT_DEV_EMAIL
  let open = () => {}, gate = Promise.resolve()
  const { url } = await serve(t, false, { ...memory, upsertFact: async (...args) => { await gate; return memory.upsertFact(...args) } })
  const { file } = await (await fetch(url + '/files', upload(bullhorn()))).json() as { file: { id: string } }
  const sample = await new DataService(memory).ingestFile(email, { name: 'sample.csv', bytes: bullhorn('Sample Worker'), set: 1, sample: true, method: 'simulated' })
  const remove = (id: string, init: RequestInit = {}) => fetch(`${url}/files/${id}`, { ...init, method: 'DELETE' })

  const { sessionToken } = await signSession({ sub: 'other', email: 'other@hypertrack.io', name: 'Other', picture: '' }, baseEnv.SESSION_SECRET)
  assert.equal((await remove(file.id, { headers: { Authorization: `Bearer ${sessionToken}` } })).status, 404)
  assert.equal((await remove('f_unknown')).status, 404)
  assert.equal((await remove(`${file.id}/raw`)).status, 404)
  const refused = await remove(sample.id)
  assert.equal(refused.status, 409); assert.deepEqual(await refused.json(), { error: 'sample_file' })
  assert.equal((await memory.listFiles(email)).length, 2)

  gate = new Promise<void>(resolve => { open = resolve })
  try {
    const write = fetch(url + '/data/facts', post({ kind: 'account', key: 'burden', value: { value: 0.3 } }))
    await new Promise(resolve => setTimeout(resolve, 50))
    const removal = remove(file.id)
    assert.equal(await within(removal, 200), 'pending', 'a removal waits for the account data lock')
    open()
    assert.equal((await write).status, 200)
    const response = await removal
    assert.equal(response.status, 200)
    const body = await response.json() as { ok: boolean; cycles: string[] }
    assert.equal(body.ok, true); assert.ok(body.cycles.includes('2026-09-27'))
  } finally { open() }
  assert.deepEqual((await memory.listFiles(email)).map(f => f.id), [sample.id])
  assert.deepEqual((await memory.listEntries(email)).map(e => e.worker), ['Sample Worker'])
  assert.deepEqual((await memory.getRunPayload(email, '2026-09-27'))?.week.map(s => s.worker), ['Sample Worker'])
  assert.equal((await remove(file.id)).status, 404)
})

test('the workspace rebuild after a write does not hold the data lock', async t => {
  const memory = createMemoryDataStore()
  let open!: () => void, reached!: () => void
  const gate = new Promise<void>(resolve => { open = resolve }), rebuilding = new Promise<void>(resolve => { reached = resolve })
  const { url } = await serve(t, false, { ...memory, manifest: async email => { reached(); await gate; return memory.manifest(email) } })
  try {
    const write = fetch(url + '/data/facts', post({ kind: 'account', key: 'burden', value: { value: 0.3 } }))
    await rebuilding
    assert.equal(await within(fetch(url + '/data/cycles').then(r => r.status), 2000), 200)
    assert.equal(await within(write, 50), 'pending')
    open()
    assert.equal((await write).status, 200)
  } finally { open() }
})

test('a failed request logs its route, code and cause, never the query or row values', async t => {
  const memory = createMemoryDataStore()
  const logged = t.mock.method(console, 'error', () => {})
  const { url } = await serve(t, false, { ...memory, listFiles: async () => { throw new Error('data_files_read_failed', { cause: '57014 canceling statement due to statement timeout' }) } })
  assert.equal((await fetch(url + '/files?who=dev@hypertrack.io')).status, 500)
  assert.deepEqual(logged.mock.calls.at(-1)?.arguments, ['Request failed:', 'GET /files', 'Error: data_files_read_failed (57014 canceling statement due to statement timeout)'])
  t.mock.reset()
  const { url: other } = await serve(t, false, { ...memory, listFiles: async () => JSON.parse('Ana Pena ana@example.com') })
  const again = t.mock.method(console, 'error', () => {})
  assert.equal((await fetch(other + '/files')).status, 500)
  const line = again.mock.calls.at(-1)?.arguments.join(' ') ?? ''
  assert.match(line, /^Request failed: GET \/files SyntaxError: /); assert.doesNotMatch(line, /Ana Pena|ana@example\.com/)
})
