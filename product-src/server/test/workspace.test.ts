import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import test from 'node:test'
import { prepareWorkspace, readSessionId, workspacePath, writeSessionId } from '../src/workspace.js'

test('workspace paths are stable hashes and never contain the raw email', () => {
  const email = 'somebody@hypertrack.io'
  const path = workspacePath(email, { NODE_ENV: 'production', CLOSEOUT_DATA_DIR: '/untrusted' })
  const hash = createHash('sha256').update(email).digest('hex').slice(0, 16)
  assert.equal(path, `/data/accounts/${hash}`)
  assert.equal(path, workspacePath(email, { NODE_ENV: 'production' }))
  assert.equal(path, workspacePath('Somebody@HyperTrack.IO', { NODE_ENV: 'production' }))
  assert.match(basename(path), /^[0-9a-f]{16}$/)
  assert.ok(!path.includes(email))
  assert.notEqual(path, workspacePath('different@hypertrack.io', { NODE_ENV: 'production' }))
})

test('workspace refreshes account context and server-owned handbooks including ingestion', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-workspace-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const env = { NODE_ENV: 'test', CLOSEOUT_DATA_DIR: root }
  const cwd = await prepareWorkspace({ email: 'person@hypertrack.io', name: 'Person' }, env)
  const account = await readFile(join(cwd, 'CLAUDE.md'), 'utf8')
  for (const required of ['person@hypertrack.io', 'Person', new Date().toISOString().slice(0, 10),
    'Payroll profile not set up yet', 'Closeout Agent', 'Payroll with a capital P', 'time entries']) {
    assert.ok(account.includes(required), required)
  }
  assert.deepEqual((await readdir(join(cwd, 'handbooks'))).sort(), [
    'chase-missing-time.md', 'connect-a-source.md', 'ingest.md', 'mediation.md', 'send-to-payroll.md',
  ])
  await writeFile(join(cwd, 'handbooks', 'mediation.md'), 'stale')
  await prepareWorkspace({ email: 'person@hypertrack.io', name: 'New name' }, env)
  assert.match(await readFile(join(cwd, 'CLAUDE.md'), 'utf8'), /New name/)
  assert.notEqual(await readFile(join(cwd, 'handbooks', 'mediation.md'), 'utf8'), 'stale')
})

test('session IDs survive turns and malformed session files do not become CLI arguments', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'closeout-session-test-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  assert.equal(await readSessionId(cwd), null)
  const id = randomUUID()
  await writeSessionId(cwd, id)
  assert.equal(await readSessionId(cwd), id)
  await writeFile(join(cwd, 'session.json'), '{bad json')
  assert.equal(await readSessionId(cwd), null)
  await writeFile(join(cwd, 'session.json'), JSON.stringify({ sessionId: '--dangerously-skip-permissions' }))
  assert.equal(await readSessionId(cwd), null)
  await assert.rejects(writeSessionId(cwd, 'not-a-uuid'))
})
