import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestContext } from 'node:test'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, turnTimeoutMs } from '../src/index.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { DataService } from '../src/data.ts'
import type { RunOptions } from '../src/claude.ts'
import type { MappingSpec } from '../src/ingest.ts'
import { signSession } from '../src/auth.ts'
import { systemPrompt, ingestPrompt, onboardPrompt } from '../src/prompts.ts'

const email = 'ingest@hypertrack.io'
const env = { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: email, ALLOWED_DOMAINS: 'hypertrack.io', SESSION_SECRET: 'ingest-secret-longer-than-thirty-two-bytes' }
const bytes = (date = '09/21/2026') => Buffer.from(`Team Member,Assignment,Service Day,Arrival,Departure,Unpaid,Duration\nAda West,Pacific Cold Storage,${date},8:00 AM,4:30 PM,30,8\n`)
const spec = (file: string): MappingSpec => ({ v: 1, file, set: 1, source: { system: 'UKG' }, headerRow: 1, grain: 'shift', overnight: 'next-day', columns: {
  worker: { col: 'Team Member', name: 'first last' }, site: { col: 'Assignment' }, date: { col: 'Service Day', format: 'MM/DD/YYYY' },
  start: { col: 'Arrival', format: 'h:mm A' }, end: { col: 'Departure', format: 'h:mm A' }, breakMin: { col: 'Unpaid', unit: 'minutes' }, hours: { col: 'Duration', unit: 'decimal', per: 'row' },
} })
const fence = (kind: string, body: unknown) => '```' + kind + '\n' + JSON.stringify(body) + '\n```'
function finish(options: RunOptions, text: string) { options.onEvent({ text }); options.onEvent({ done: true, sessionId: 'shared-session', final: text }) }
const post = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
async function setup(t: TestContext, runAgent: (options: RunOptions) => Promise<void>, doc: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'closeout-ingest-chat-')), store = createMemoryDataStore()
  const server = createServer({ env: { ...env, CLOSEOUT_DATA_DIR: root }, dataStore: store, claudeVersion: async () => 'test', runAgent,
    stateStore: { get: async () => ({ doc, updated_at: '2026-09-25T00:00:00Z' }), put: async () => { throw new Error('not used') } } })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }) })
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const upload = async (contents = bytes()) => {
    const response = await fetch(url + '/files', { method: 'POST', headers: { 'X-File-Name': 'unfamiliar.csv', 'X-Set': '1', 'X-System': 'UKG', 'X-Site': encodeURIComponent('Pacific Cold Storage') }, body: new Uint8Array(contents) })
    assert.equal(response.status, 201)
    return (await response.json() as { file: { id: string; status: string; mappingAuthor: string | null } }).file
  }
  const chat = async (fileIds: string[], mode = 'ingest') => {
    const response = await fetch(url + '/chat', post({ mode, message: 'Read these time entries', context: { fileIds } }))
    const events = (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)))
    assert.equal(response.status, 200)
    return events
  }
  return { url, store, upload, chat }
}

test('valid mapping persists, reruns with the closeout_state calendar, and holds done', async t => {
  let id = ''
  const app = await setup(t, async options => {
    assert.match(await readFile(join(options.cwd, 'files', id, 'profile.md'), 'utf8'), /UKG/)
    finish(options, 'Arrival and Departure are actual clock times.\n' + fence('mapping', spec(id)))
  }, { frequency: 'Monthly', timezone: 'America/New_York' })
  const file = await app.upload(); id = file.id; assert.equal(file.status, 'needs_mapping')
  const events = await app.chat([id]), normalized = events.find(e => e.ingest)?.ingest
  assert.equal(normalized.status, 'normalized'); assert.equal(normalized.entries, 1); assert.deepEqual(normalized.cycles, ['2026-09-30'])
  assert.ok(events.findIndex(e => e.ingest) < events.findIndex(e => e.done)); assert.equal(events.filter(e => e.done).length, 1)
  const mapping = (await app.store.listMappings(email))[0]
  assert.equal(mapping.author, 'agent'); assert.equal(mapping.version, 1)
  assert.equal((await app.store.listEntries(email))[0].minutes, 480)
  assert.equal((await app.store.getRunPayload(email, '2026-09-30'))?.cycle.start, '2026-09-01')
  const future = await app.upload(bytes('09/22/2026'))
  assert.equal(future.status, 'normalized'); assert.equal(future.mappingAuthor, 'agent')
})

test('hours disagreement retries in the same workspace with at most three data traces per turn', async t => {
  let id = '', calls = 0, cwd = ''
  const app = await setup(t, async options => {
    calls++; if (cwd) assert.equal(options.cwd, cwd); cwd = options.cwd
    options.onEvent({ trace: 'Read handbooks/ingest.md' })
    for (let n = 0; n < 3; n++) options.onEvent({ trace: `Read data/attempt-${calls}-${n}.json` })
    const mapping = spec(id)
    if (calls === 1) delete mapping.columns.breakMin
    else assert.match(options.message, /Hours disagrees with the times/)
    finish(options, fence('mapping', mapping))
  })
  id = (await app.upload()).id
  const events = await app.chat([id])
  assert.equal(calls, 2); assert.equal(events.find(e => e.ingest)?.ingest.status, 'normalized'); assert.equal(events.filter(e => e.done).length, 1)
  assert.equal(events.filter(e => e.trace?.startsWith('Read data/')).length, 3)
  assert.equal(events.filter(e => e.trace === 'Read handbooks/ingest.md').length, 1)
})

test('two failed attempts leave needs_mapping with errors and no entries', async t => {
  let id = '', calls = 0
  const app = await setup(t, async options => { calls++; const mapping = spec(id); mapping.columns.start!.col = 'No such column'; finish(options, fence('mapping', mapping)) })
  id = (await app.upload()).id
  const result = (await app.chat([id])).find(e => e.ingest)?.ingest
  assert.equal(calls, 2); assert.equal(result.status, 'needs_mapping'); assert.match(result.errors.join(' '), /Unknown column/)
  assert.equal((await app.store.listEntries(email)).length, 0); assert.equal((await app.store.listMappings(email)).length, 0)
})

test('clarification without a mapping stops after one P6 question card', async t => {
  let calls = 0
  const app = await setup(t, async options => { calls++; finish(options, 'Are Arrival and Departure actual times?\n' + fence('card', { kind: 'question', input: 'chips', chips: ['Actual times', 'Scheduled times'], topics: ['workerHours'] })) })
  const events = await app.chat([(await app.upload()).id])
  assert.equal(calls, 1); assert.equal(events.find(e => e.ingest)?.ingest.status, 'needs_mapping'); assert.match(events.at(-1).final, /```card/)
})

test('set_fact saves agent provenance, reruns and closes the rate gap before done', async t => {
  const app = await setup(t, async options => finish(options, 'The hourly rate is $24.\n' + fence('action', { type: 'set_fact', kind: 'rate', key: 'pacific cold storage|*', value: { pay: 24 } })))
  const file = await app.upload(); assert.equal((await new DataService(app.store).applyAgentMapping(email, file.id, spec(file.id))).ok, true)
  const prior = (await app.store.listRuns(email))[0]; assert.ok(prior.gaps.some(g => g.kind === 'rate'))
  const events = await app.chat([], 'chat'), saved = (await app.store.listFacts(email))[0]
  assert.equal(saved.source, 'agent'); assert.equal(saved.value.pay, 24); assert.equal(events.find(e => e.facts)?.facts.applied, 1)
  assert.ok(events.findIndex(e => e.facts) < events.findIndex(e => e.done))
  const next = (await app.store.listRuns(email))[0]
  assert.notEqual(next.runId, prior.runId); assert.equal(next.gaps.some(g => g.kind === 'rate'), false)
  assert.equal((await app.store.getRunPayload(email, next))?.totals.gross, 192)
})

test('invalid set_fact is skipped with one app note while valid facts apply without a retry', async t => {
  const logs = t.mock.method(console, 'warn', () => {})
  let turns = 0
  const app = await setup(t, async options => {
    turns++
    finish(options, fence('action', { type: 'set_fact', kind: 'site', key: 'secret site', value: { state: 'INVALID' } })
      + '\n' + fence('action', { type: 'set_fact', kind: 'rate', key: 'pacific cold storage|*', value: { pay: 24 } }))
  })
  const events = await app.chat([], 'onboard')
  assert.equal((await app.store.listFacts(email)).length, 1); assert.equal(events.find(e => e.facts)?.facts.applied, 1)
  assert.equal((await app.store.listFacts(email))[0].value.pay, 24)
  assert.equal(logs.mock.callCount(), 1); assert.equal(String(logs.mock.calls[0].arguments).includes('secret site'), false)
  assert.equal(events.at(-1).done, true)
  assert.ok(!events.at(-1).final.includes('secret site'))
  assert.match(events.at(-1).final, /Skipped set_fact: invalid fields/)
  assert.equal(turns, 1)
})

test('ingest rejects absent, normalized, repeated, oversized and other-account files before SSE', async t => {
  let calls = 0
  const app = await setup(t, async () => { calls++ }), file = await app.upload()
  for (const fileIds of [[], [file.id, file.id], ['f_zzzzzzzzzzzz'], Array.from({ length: 6 }, (_, i) => `f_abcdefghijk${String.fromCharCode(97 + i)}`)]) {
    assert.equal((await fetch(app.url + '/chat', post({ mode: 'ingest', message: 'Read', context: { fileIds } }))).status, 400)
  }
  const { sessionToken } = await signSession({ sub: 'other', email: 'other@hypertrack.io', name: 'Other', picture: '' }, env.SESSION_SECRET)
  assert.equal((await fetch(app.url + '/chat', { ...post({ mode: 'ingest', message: 'Read', context: { fileIds: [file.id] } }), headers: { Authorization: `Bearer ${sessionToken}` } })).status, 400)
  await new DataService(app.store).applyAgentMapping(email, file.id, spec(file.id))
  assert.equal((await fetch(app.url + '/chat', post({ mode: 'ingest', message: 'Read', context: { fileIds: [file.id] } }))).status, 400); assert.equal(calls, 0)
})

test('accepting one layout normalizes all requested files with that fingerprint', async t => {
  let id = ''
  const app = await setup(t, async options => finish(options, fence('mapping', spec(id))))
  id = (await app.upload()).id
  const other = await app.upload(bytes('09/22/2026')), events = await app.chat([id, other.id])
  assert.equal(events.filter(e => e.ingest?.status === 'normalized').length, 2)
  assert.equal((await app.store.listMappings(email)).length, 1); assert.equal((await app.store.listEntries(email)).length, 2)
})

test('ingest timeout and all modes support one just-in-time fact question with P6 cards', () => {
  assert.equal(turnTimeoutMs('ingest', {}), 300000); assert.equal(turnTimeoutMs('ingest', { CLOSEOUT_INGEST_TIMEOUT_MS: '900' }), 900)
  for (const prompt of [systemPrompt({}), onboardPrompt({}), ingestPrompt([])]) {
    assert.match(prompt, /ONE just-in-time question/); assert.match(prompt, /"kind":"question"/)
    assert.match(prompt, /minimum wage/); assert.match(prompt, /worker aliases/); assert.match(prompt, /set_fact/)
  }
})
