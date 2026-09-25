import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { Buffer } from 'node:buffer'
import { createServer } from '../src/index.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { signSession } from '../src/auth.ts'

const baseEnv = { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: 'dev@hypertrack.io', ALLOWED_DOMAINS: 'hypertrack.io', SESSION_SECRET: 'p5-test-secret-that-is-at-least-32-bytes' }
const post = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const bullhorn = (name = 'Test Worker', minutes = 0) => Buffer.from([
  'Candidate,Placement ID,Client,Job Title,Date,Start,End,Break (min),Hours,Pay Rate,Bill Rate,Entered Via,Status,Approved By,Comment',
  `${name},123,Pacific Cold Storage,Warehouse,09/21/2026,8:00 AM,4:00 PM,${minutes},${8-minutes/60},20,30,Clock import,Approved,Supervisor,`,
].join('\r\n'))
const upload = (body: Buffer, name = 'bullhorn.csv') => ({ method: 'POST', headers: { 'Content-Type': 'text/csv', 'X-File-Name': encodeURIComponent(name), 'X-Set': '1' }, body: new Uint8Array(body) })
async function serve(t: TestContext, signedOut = false) {
  const root = await mkdtemp(join(tmpdir(), 'closeout-files-http-'))
  const store = createMemoryDataStore()
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
  const cycle = await detail.json() as { week: { id: string; entryIds: string[] }[]; extraGroups: { ruleId: string; cases: number }[] }
  assert.equal(cycle.week.length, 6283)
  assert.equal(cycle.extraGroups.find(g => g.ruleId === 'CA-OT-8')?.cases, 1452)
  const first = cycle.week[0]
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
