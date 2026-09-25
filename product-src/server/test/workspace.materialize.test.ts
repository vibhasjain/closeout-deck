import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createMemoryJourneyStore } from '../src/journeyStore.ts'
import { accountHash } from '../src/datastore.ts'
import { DataService } from '../src/data.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { materialize, workspaceFile } from '../src/workspace.ts'
import { inboxAddress } from '../../src/lib/inbox.ts'

const email = 'workspace@hypertrack.io'
const bytes = (day = '09/21/2026', comment = '') => Buffer.from(`Candidate,Placement ID,Client,Job Title,Date,Start,End,Break (min),Hours,Pay Rate,Bill Rate,Entered Via,Status,Approved By,Comment\r\nTest Worker,123,Pacific Cold Storage,Warehouse,${day},8:00 AM,4:00 PM,30,7.5,20,30,Clock import,Approved,Supervisor,${comment}\r\n`)
const now = new Date('2026-09-25T16:00:00Z')
const missing = async (file: string) => { try { await stat(file); return false } catch { return true } }
async function size(path: string): Promise<number> {
  let total = 0
  for (const item of await readdir(path, { withFileTypes: true })) total += item.isDirectory() ? await size(join(path, item.name)) : (await stat(join(path, item.name))).size
  return total
}

test('materialize writes the data tree, reuses derived files, and rebuilds verified entries after cache loss', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-materialize-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const env = { NODE_ENV: 'test', CLOSEOUT_DATA_DIR: root }, store = createMemoryDataStore(), service = new DataService(store)
  const file = await service.ingestFile(email, { name: 'bullhorn.csv', bytes: bytes(), set: 1 }, {}, now)
  assert.equal(file.status, 'normalized')
  const cwd = await materialize({ email }, env, store)
  const names = [ 'CLAUDE.md', 'sources.md', 'rulebook.md', 'data/gaps.md', 'data/decisions.jsonl', '.manifest.json',
    `files/${file.id}/bullhorn.csv`, `files/${file.id}/profile.md`, `mappings/${file.fingerprint}.json`,
    'data/cycles/2026-09-27.json', 'data/entries/2026-09-27.jsonl', 'data/findings/2026-09-27.jsonl' ]
  for (const name of names) assert.ok(!(await missing(join(cwd, name))), name)
  const originalEntries = await readFile(join(cwd, 'data/entries/2026-09-27.jsonl'), 'utf8')
  const entry = JSON.parse(originalEntries.trim()) as { prov: { file: string; row: number; cols: object } }
  assert.equal(entry.prov.file, file.id)
  assert.equal(entry.prov.row, 2)
  assert.ok(Object.keys(entry.prov.cols).length > 0)
  const watched = ['rulebook.md', `files/${file.id}/bullhorn.csv`, 'data/entries/2026-09-27.jsonl', 'handbooks/mediation.md']
  const before = await Promise.all(watched.map(name => stat(join(cwd, name)).then(s => s.mtimeMs)))
  const manifestCalls = t.mock.method(store, 'manifest'), entriesCalls = t.mock.method(store, 'listEntries')
  await materialize({ email }, env, store)
  assert.equal(manifestCalls.mock.callCount(), 1)
  assert.equal(entriesCalls.mock.callCount(), 0)
  assert.deepEqual(await Promise.all(watched.map(name => stat(join(cwd, name)).then(s => s.mtimeMs))), before)
  await rm(cwd, { recursive: true })
  const rebuilt = await materialize({ email }, env, store)
  assert.equal(await readFile(join(rebuilt, 'data/entries/2026-09-27.jsonl'), 'utf8'), originalEntries)
  assert.equal(entriesCalls.mock.callCount(), 0, 'rebuild does not page through entry rows')
  t.mock.method(store, 'countEntries', async () => 999)
  await rm(join(cwd, 'data/entries/2026-09-27.jsonl'))
  await assert.rejects(materialize({ email }, env, store), /rebuild_entry_count_mismatch/)
})

test('materialize rebuilds superseding exports with stable IDs and only current worker-days', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-reexport-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = createMemoryDataStore(), service = new DataService(store), env = { NODE_ENV: 'test', CLOSEOUT_DATA_DIR: root }
  await service.ingestFile(email, { name: 'first.csv', bytes: bytes(), set: 1 }, {}, now)
  const second = await service.ingestFile(email, { name: 'second.csv', bytes: bytes('09/21/2026', 'Corrected comment'), set: 1 }, {}, new Date(now.getTime() + 1000))
  const cwd = await materialize({ email }, env, store)
  const entries = (await readFile(join(cwd, 'data/entries/2026-09-27.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { fileId: string })
  assert.equal(entries.length, 1)
  assert.equal(entries[0].fileId, second.id)
})

test('materialize preserves the saved Payroll profile and never-contact instructions for later chat', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-profile-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const saved = { firm: { name: 'Acme', states: ['CA'] }, timezone: 'America/Los_Angeles', profile: { workerHours: 'Forwarded email' }, covered: ['workerHours'],
    sources: [{ set: 1, kind: 'email', label: 'Worker hours', how: `Forward them to ${inboxAddress(email)}` }], authorityConfigured: true, authority: { autoFix: false }, neverContact: ['Jane'] }
  const cwd = await materialize({ email }, { NODE_ENV: 'test', CLOSEOUT_DATA_DIR: root }, createMemoryDataStore(), saved)
  assert.deepEqual(JSON.parse(await readFile(join(cwd, 'payroll-profile.json'), 'utf8')), { ...saved, inbox: inboxAddress(email) })
  assert.match(await readFile(join(cwd, 'CLAUDE.md'), 'utf8'), /Read payroll-profile.json/)
  assert.match(await readFile(join(cwd, 'CLAUDE.md'), 'utf8'), /Account time zone: America\/Los_Angeles/)
})

test('workspace carries unconfigured authority as null and requires approval of every fix or contact', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-unconfirmed-authority-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cwd = await materialize({ email }, { NODE_ENV: 'test', CLOSEOUT_DATA_DIR: root }, createMemoryDataStore(), {
    authority: { autoFix: true, limit: 100, weeklyCap: 1000, textSupervisors: true }, authorityConfigured: false,
  })
  const profile = JSON.parse(await readFile(join(cwd, 'payroll-profile.json'), 'utf8'))
  assert.equal(profile.authorityConfigured, false)
  assert.equal(profile.authority, null)
  assert.equal(profile.inbox, inboxAddress(email))
  assert.match(await readFile(join(cwd, 'CLAUDE.md'), 'utf8'), /authorityConfigured is false.*ask before every fix and every contact/)
})

test('cache limits evict oldest cycle data first and paths cannot escape cwd', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-cache-cap-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = createMemoryDataStore(), service = new DataService(store), env = { NODE_ENV: 'test', CLOSEOUT_DATA_DIR: root }
  await service.ingestFile(email, { name: 'old.csv', bytes: bytes('09/14/2026', 'x'.repeat(50_000)), set: 1 }, {}, now)
  await service.ingestFile(email, { name: 'new.csv', bytes: bytes('09/21/2026', 'x'.repeat(50_000)), set: 1 }, {}, new Date(now.getTime() + 1000))
  const cwd = await materialize({ email }, env, store)
  const uncapped = await size(cwd)
  await materialize({ email }, env, store, {}, {}, { maxBytes: uncapped - 30_000 })
  assert.ok(await missing(join(cwd, 'data/entries/2026-09-20.jsonl')))
  assert.ok(!(await missing(join(cwd, 'data/entries/2026-09-27.jsonl'))))
  assert.ok(await size(cwd) <= uncapped - 30_000)
  await assert.rejects(workspaceFile(cwd, '../escape'), /invalid_workspace_path/)
  await assert.rejects(workspaceFile(cwd, '/outside'), /invalid_workspace_path/)
  await symlink(root, join(cwd, 'escape'))
  await assert.rejects(workspaceFile(cwd, 'escape/target'), /invalid_workspace_symlink/)
  await writeFile(join(root, 'outside'), 'sentinel')
  assert.equal(await readFile(join(root, 'outside'), 'utf8'), 'sentinel')
})


test('journey history is bounded, omitted explicitly and included in the final workspace cap', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-journey-cap-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = createMemoryDataStore(), service = new DataService(store), journey = createMemoryJourneyStore()
  const env = { NODE_ENV: 'test', CLOSEOUT_DATA_DIR: root }
  await service.ingestFile(email, { name: 'current.csv', bytes: bytes(), set: 1 }, {}, now)
  const createdAt = now.toISOString(), cycleId = '2026-09-27'
  for (let n = 0; n < 205; n++) {
    const id = `t_${String(n).padStart(5, '0')}`
    await journey.upsertThread(email, { id, cycleId, shiftId: null, disputeId: null, counterparty: { kind: 'worker', name: `Worker ${n}` }, status: 'waiting', createdAt })
    await journey.addMessage(email, { id: `m_${n}`, threadId: id, dir: 'in', status: 'recorded', text: 'x'.repeat(3900), at: createdAt })
  }
  await journey.upsertThread(email, { id: 't_old', cycleId: '2020-01-05', shiftId: null, disputeId: null, counterparty: { kind: 'worker', name: 'Old history' }, status: 'open', createdAt })
  for (let n = 0; n < 400; n++) await journey.upsertDecision(email, { id: `d_${n}`, cycleId, groupId: `rule-${n}`, shiftIds: [], decision: 'dismissed', reason: 'r'.repeat(500), by: 'user', at: createdAt })
  const csvPath = `${accountHash(email)}/batches/b_large.csv`
  await store.putObject(email, csvPath, Buffer.from('worker,regular_hours,ot_hours,premium_hours,gross,held_entries\n' + 'x'.repeat(500_000)))
  await journey.createBatch(email, { id: 'b_large', cycleId, destination: 'Payroll', workers: 1, gross: 160, held: 0, csvPath, createdAt })
  const cap = 100_000
  const cwd = await materialize({ email }, env, store, {}, {}, { journey, maxBytes: cap })
  assert.ok(await size(cwd) <= cap, 'all journey and final metadata bytes count')
  assert.ok(!await missing(join(cwd, `data/entries/${cycleId}.jsonl`)), 'unbounded history must not evict all current evidence')
  assert.ok(await missing(join(cwd, 'data/threads/t_old.md')), 'history outside selected cycles stays canonical only')
  assert.ok(await missing(join(cwd, `data/batches/${cycleId}.csv`)), 'oversized immutable CSV is omitted whole')
  assert.match(await readFile(join(cwd, 'data/journey.md'), 'utf8'), /[1-9]\d* records or artifacts omitted/)
  const decisions = await readFile(join(cwd, 'data/decisions.jsonl'), 'utf8')
  for (const row of decisions.trim().split('\n')) assert.doesNotThrow(() => JSON.parse(row))
  assert.equal((await journey.listMessages(email, ['t_00001'])).length, 1, 'canonical messages survive eviction')
  assert.equal((await journey.listDecisions(email)).length, 400)
  await materialize({ email }, env, store, {}, {}, { journey, maxBytes: cap })
  assert.ok(await size(cwd) <= cap, 'repeated materialization obeys the same cap')
})

test('materialize refuses a cap below essential account metadata instead of returning oversized context', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-minimum-cap-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await assert.rejects(materialize({ email }, { NODE_ENV: 'test', CLOSEOUT_DATA_DIR: root }, createMemoryDataStore(), {}, {}, { maxBytes: 100 }), /workspace_size_limit/)
})
