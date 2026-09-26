import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { createServer } from '../src/index.ts'
import { signSession } from '../src/auth.ts'
import type { RunOptions } from '../src/claude.ts'
import { accountHash, createMemoryDataStore } from '../src/datastore.ts'
import type { DataStore } from '../src/datastore.ts'
import { createMemoryJourneyStore } from '../src/journeyStore.ts'
import type { JourneyStore } from '../src/journeyStore.ts'
import { createMemoryMemoryStore } from '../src/memoryStore.ts'
import type { MemoryStore } from '../src/memoryStore.ts'
import { workspacePath } from '../src/workspace.ts'

// A is the loopback dev account (no Authorization header); B and the acme.com account sign in with a session token.
const A = 'dev@hypertrack.io', B = 'other@hypertrack.io', OUTSIDER = 'ops@acme.com'
const baseEnv = { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: A, ALLOWED_DOMAINS: 'hypertrack.io,acme.com', SESSION_SECRET: 'reset-test-secret-that-is-at-least-32-bytes', OPENAI_API_KEY: 'sk-test' }
const SDP = 'v=0\r\no=- 1 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
const CALL = '0f8fad5b-d9cb-469f-a165-70867728950e'
const RESET = { confirm: 'start over' }

async function until(predicate: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 500; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  assert.fail(`${what} was not reached`)
}
async function gone(path: string): Promise<boolean> {
  try { await stat(path); return false } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' }
}

async function serve(t: TestContext, options: { runAgent?: (options: RunOptions) => Promise<void>; env?: Record<string, string> } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'closeout-reset-'))
  const env = { ...baseEnv, CLOSEOUT_DATA_DIR: root, HOME: join(root, 'home'), ...options.env }
  const data = createMemoryDataStore(), journey = createMemoryJourneyStore(), memory = createMemoryMemoryStore()
  const server = createServer({ env, dataStore: data, journeyStore: journey, memoryStore: memory, claudeVersion: async () => 'test',
    runAgent: options.runAgent ?? (async run => run.onEvent({ done: true, sessionId: 'cli', final: 'ok' })),
    stateStore: { get: async () => ({ doc: {}, updated_at: '2026-09-25T00:00:00Z' }), put: async () => { throw new Error('not used') } },
    liveFetch: async () => Response.json({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'v=0\r\n' } }, { status: 201 }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  })
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const tokens = new Map<string, string>()
  /** A request as `email`; A rides the loopback dev identity. */
  const send = async (path: string, body: unknown, email = A) => {
    if (email !== A && !tokens.has(email)) tokens.set(email, (await signSession({ sub: email, email, name: '', picture: '' }, env.SESSION_SECRET)).sessionToken)
    return fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(email === A ? {} : { Authorization: `Bearer ${tokens.get(email)}` }) }, body: JSON.stringify(body) })
  }
  return { url, env, data, journey, memory, send }
}

/** Every table the account has, by name. */
async function everything(data: DataStore, journey: JourneyStore, memory: MemoryStore, email: string) {
  const runs = await data.listRuns(email), threads = await journey.listThreads(email)
  return {
    sources: await data.listSources(email), mappings: await data.listMappings(email), files: await data.listFiles(email),
    entries: await data.listEntries(email, { includeUnnormalized: true, includeSuperseded: true }), facts: await data.listFacts(email), runs,
    findings: (await Promise.all(runs.map(run => data.listFindings(email, run.cycleId)))).flat(), empty_cycles: await data.listEmptyCycles(email),
    chat: await data.listChat(email), calls: await data.getCall(email, CALL),
    decisions: await journey.listDecisions(email), threads, messages: await journey.listMessages(email, threads.map(thread => thread.id)),
    batches: await journey.listBatches(email), disputes: await journey.listDisputes(email),
    instincts: await memory.listInstincts(email), memory_runs: await memory.listRuns(email, 100),
  }
}
const filled = (tables: Record<string, unknown>) => Object.entries(tables).filter(([, rows]) => rows !== null && Object.keys(rows as object).length > 0).map(([name]) => name)

async function seed(data: DataStore, journey: JourneyStore, memory: MemoryStore, email: string) {
  const at = '2026-09-20T12:00:00.000Z'
  await data.upsertMapping(email, { id: 'map_1', fingerprint: 'fp', spec: {} as never, author: 'user', version: 1, updatedAt: at })
  await data.upsertFact(email, { kind: 'account', key: 'timezone', value: { value: 'America/Chicago' }, source: 'user', sample: false, updatedAt: at })
  await data.setEmptyCycle(email, '2026-01-04', 'hash')
  await data.appendChat(email, [{ id: 'm1', role: 'user', text: 'Travis Reed signs off Lonestar time', at: Date.now() }])
  await data.putCall(email, { id: CALL, startedAt: at, seconds: 60, transcript: [{ role: 'user', text: 'Hi', startMs: 0 }], summary: null })
  await journey.upsertDecision(email, { id: 'd_1', cycleId: '2026-09-20', groupId: 'OT-1', shiftIds: [], decision: 'approved', reason: null, by: 'user', at })
  await journey.saveConversation(email, { id: 't_1', cycleId: '2026-09-20', shiftId: null, disputeId: 'dp_1', counterparty: { kind: 'worker', name: 'Test Worker' }, status: 'open', createdAt: at },
    [{ id: 'msg_1', threadId: 't_1', dir: 'in', text: 'I worked Saturday', status: 'recorded', at }],
    { id: 'dp_1', cycleId: '2026-09-20', worker: 'Test Worker', description: 'Missing Saturday', source: 'paste', status: 'open', adjustment: null, createdAt: at })
  await journey.createBatch(email, { id: 'b_1', cycleId: '2026-09-20', destination: 'ADP', workers: 1, gross: 100, held: 0, csvPath: `${accountHash(email)}/batches/b_1.csv`, createdAt: at })
  await memory.insertInstinct(email, { id: `i_${accountHash(email)}`, kind: 'context', text: 'Travis Reed signs off Lonestar time', source: 'chat', status: 'active', until: null, ruleId: null, replacedBy: null, at, updatedAt: at })
  await memory.saveRun(email, { id: 'mr_1', trigger: 'chat', ref: null, startedAt: at, finishedAt: at, ops: [], dropped: [], error: null })
}

test('Start over is for internal accounts only, and only with the typed confirm', async t => {
  const app = await serve(t)
  const outsider = await app.send('/account/reset', RESET, OUTSIDER)
  assert.equal(outsider.status, 403)
  assert.deepEqual(await outsider.json(), { error: 'not_internal' })
  for (const body of [{}, null, 'start over', { confirm: 'Start over' }, { confirm: 'start over ' }, { confirm: true }]) {
    const response = await app.send('/account/reset', body)
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.deepEqual(await response.json(), { error: 'invalid_body' })
  }
  const ok = await app.send('/account/reset', RESET)
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { ok: true })

  // INTERNAL_DOMAINS is read like ALLOWED_DOMAINS: it replaces the hypertrack.io default.
  const other = await serve(t, { env: { INTERNAL_DOMAINS: ' Acme.com ' } })
  assert.equal((await other.send('/account/reset', RESET)).status, 403)
  assert.equal((await other.send('/account/reset', RESET, OUTSIDER)).status, 200)
})

test('a chat turn in flight makes Start over answer busy instead of waiting', async t => {
  let finish!: () => void
  const turn = new Promise<void>(resolve => { finish = resolve })
  let started = false
  const app = await serve(t, { runAgent: async run => { started = true; await turn; run.onEvent({ done: true, sessionId: 'cli', final: 'ok' }) } })
  const chat = app.send('/chat', { mode: 'chat', message: 'Hello', context: {} })
  await until(() => started, 'the chat turn')
  const busy = await app.send('/account/reset', RESET)
  assert.equal(busy.status, 409)
  assert.deepEqual(await busy.json(), { error: 'busy' })
  finish()
  await (await chat).text()
  assert.equal((await app.send('/account/reset', RESET)).status, 200)
})

test('Start over wipes every table, object and workspace of one account, ends its call and memory run, and leaves others alone', async t => {
  let consolidating = false, cancelled = false
  const app = await serve(t, { runAgent: async run => {
    if (!run.fresh) { run.onEvent({ done: true, sessionId: 'cli', final: 'ok' }); return }
    // The memory consolidation holds until Start over stops it.
    consolidating = true
    await new Promise<void>(resolve => run.signal?.addEventListener('abort', () => resolve(), { once: true }))
    cancelled = true
  } })
  const { data, journey, memory, env } = app

  assert.equal((await app.send('/data/sample', {})).status, 200)
  await seed(data, journey, memory, A)
  await seed(data, journey, memory, B)
  await data.putObject(B, `${accountHash(B)}/files/f_1/b.csv`, Buffer.from('b'))
  const before = await everything(data, journey, memory, A), others = await everything(data, journey, memory, B)
  assert.deepEqual(filled(before), Object.keys(before), 'the fixture fills every table')
  const objects = [...before.files.map(file => file.storagePath), ...before.runs.map(run => run.storagePath)]
  assert.ok(objects.length >= 2 && (await Promise.all(objects.map(path => data.getObject(A, path)))).every(Boolean))

  // A live call holds the one-call lock; a memory run is in flight in its own snapshot workspace.
  assert.equal((await app.send('/live-session', { sdp: SDP, purpose: 'desk' })).status, 200)
  assert.equal((await app.send('/live-session', { sdp: SDP, purpose: 'desk' })).status, 409)
  assert.equal((await app.send('/memory/consolidate', { trigger: 'chat' })).status, 202)
  await until(() => consolidating, 'the memory run')
  await writeFile(join(workspacePath(A, env), 'session.json'), JSON.stringify({ sessionId: '6f1c3c9e-0d6e-4f0a-9d6c-6b1a2f3e4d5c' }) + '\n')
  assert.ok(!await gone(workspacePath(A, env, 'memory')))
  // The CLI's own transcripts of both workspaces' sessions, named after each real working directory; B's stay.
  const transcripts = async (email: string, variant?: 'memory') => join(env.HOME, '.claude', 'projects', (await realpath(workspacePath(email, env, variant))).replace(/[^a-zA-Z0-9]/g, '-'))
  const cli = [await transcripts(A), await transcripts(A, 'memory')]
  await mkdir(workspacePath(B, env), { recursive: true })
  const kept = await transcripts(B)
  for (const dir of [...cli, kept]) { await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'session.jsonl'), '{}\n') }

  const log = t.mock.method(console, 'log', () => {})
  const reset = await app.send('/account/reset', RESET)
  log.mock.restore()
  assert.equal(reset.status, 200)
  assert.deepEqual(await reset.json(), { ok: true })

  assert.ok(cancelled, 'the memory run was stopped')
  assert.deepEqual(filled(await everything(data, journey, memory, A)), [], 'no table keeps a row, including the stopped memory run')
  for (const path of objects) assert.equal(await data.getObject(A, path), null)
  assert.deepEqual(await everything(data, journey, memory, B), others)
  assert.ok(await data.getObject(B, `${accountHash(B)}/files/f_1/b.csv`))
  assert.ok(await gone(workspacePath(A, env)), 'the chat workspace and its session.json')
  assert.ok(await gone(workspacePath(A, env, 'memory')), 'the memory snapshot workspace')
  for (const dir of cli) assert.ok(await gone(dir), 'the CLI transcripts')
  assert.ok(!await gone(kept), 'another account\'s CLI transcripts')

  const lines = log.mock.calls.map(call => call.arguments.join(' '))
  assert.deepEqual(lines.filter(line => line.startsWith('Account reset:')), [`Account reset: ${accountHash(A)}`])
  assert.ok(lines.every(line => !line.includes(A)), 'the email is never logged')

  // The call lock is gone, and the account works again from nothing.
  assert.equal((await app.send('/live-session', { sdp: SDP, purpose: 'onboard' })).status, 200)
  assert.equal((await app.send('/data/sample', {})).status, 200)
})
