import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { signSession } from '../src/auth.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { entityTag, matchesTag } from '../src/freshness.ts'
import { createServer } from '../src/index.ts'
import { createMemoryJourneyStore } from '../src/journeyStore.ts'
import { createMemoryMemoryStore } from '../src/memoryStore.ts'

test('GET validators support weak comparison, lists and wildcard without matching other accounts or URLs', () => {
  const tag = entityTag('a@hypertrack.io', '/memory', 'same body')
  assert.equal(matchesTag(undefined, tag), false)
  assert.equal(matchesTag('"different"', tag), false)
  assert.equal(matchesTag(tag.replace(/^W\//, ''), tag), true)
  assert.equal(matchesTag(`"old", ${tag}`, tag), true)
  assert.equal(matchesTag('*', tag), true)
  assert.notEqual(tag, entityTag('b@hypertrack.io', '/memory', 'same body'))
  assert.notEqual(tag, entityTag('a@hypertrack.io', '/chat/history', 'same body'))
})

test('all paint endpoints revalidate with bodyless 304s and invalidate after their data changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-freshness-'))
  const email = 'freshness@hypertrack.io'
  const env = { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: email, ALLOWED_DOMAINS: 'hypertrack.io',
    SESSION_SECRET: 'freshness-test-secret-at-least-32-bytes', CLOSEOUT_DATA_DIR: root }
  const data = createMemoryDataStore(), journey = createMemoryJourneyStore(), memory = createMemoryMemoryStore()
  let objectReads = 0
  const server = createServer({ env, dataStore: { ...data, getObject: async (...args) => { objectReads++; return data.getObject(...args) } },
    journeyStore: journey, memoryStore: memory, claudeVersion: async () => 'test',
    runAgent: async () => { throw new Error('No model calls in freshness tests') } })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const get = (path: string, tag?: string, authorization?: string) => fetch(base + path, {
    headers: { Origin: 'http://localhost:9000', ...(tag ? { 'If-None-Match': tag } : {}), ...(authorization ? { Authorization: authorization } : {}) },
  })
  const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const unchanged = async (path: string) => {
    const first = await get(path)
    assert.equal(first.status, 200, path)
    const tag = first.headers.get('etag')!
    assert.match(tag, /^W\/"[0-9a-f]{64}"$/)
    assert.equal(first.headers.get('cache-control'), 'private, no-cache')
    assert.equal(first.headers.get('access-control-expose-headers'), 'ETag')
    assert.match(first.headers.get('vary')!, /Authorization/)
    await first.arrayBuffer()
    const second = await get(path, tag)
    assert.equal(second.status, 304, path)
    assert.equal(second.headers.get('etag'), tag)
    assert.equal((await second.arrayBuffer()).byteLength, 0, path)
    return tag
  }
  const changed = async (path: string, tag: string) => {
    const response = await get(path, tag)
    assert.equal(response.status, 200, path)
    assert.notEqual(response.headers.get('etag'), tag, path)
    return response.json()
  }

  const preflight = await fetch(base + '/memory', { method: 'OPTIONS', headers: { Origin: 'http://localhost:9000',
    'Access-Control-Request-Headers': 'If-None-Match', 'Access-Control-Request-Method': 'GET' } })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('access-control-allow-headers')!, /If-None-Match/)

  const cyclesTag = await unchanged('/data/cycles')
  const seededResponse = await post('/data/sample', {})
  assert.equal(seededResponse.status, 200)
  const { cycleId } = await seededResponse.json()
  assert.ok((await changed('/data/cycles', cyclesTag)).cycles.some((cycle: { sample: boolean }) => cycle.sample))
  await unchanged('/data/cycles')

  const cyclePath = `/data/cycles/${cycleId}`, cycleTag = await unchanged(cyclePath)
  const readsAfterWarm = objectReads
  const repeated = await get(cyclePath, cycleTag)
  assert.equal(repeated.status, 304)
  assert.equal(objectReads, readsAfterWarm, '304 does not read or decompress the stored time-entry payload')
  const decision = await post(`${cyclePath}/decisions`, { groupId: 'CA-MB-01', decision: 'approved' })
  assert.equal(decision.status, 200)
  await decision.arrayBuffer()
  assert.equal((await changed(cyclePath, cycleTag)).decisions[0].decision, 'approved')
  const approvedTag = await unchanged(cyclePath)

  const at = '2026-09-26T00:00:00.000Z'
  const dispute = { id: 'dp_0000000000000001', cycleId: '2026-09-01', worker: 'Test worker', description: 'Correction',
    status: 'adjusted' as const, source: 'paste' as const, createdAt: at,
    adjustment: { next_cycle_id: cycleId, amount: 25, hours: 1 } }
  // An adjustment is part of the detail representation even when the base run has not changed.
  await journey.upsertDispute(email, dispute)
  assert.equal((await changed(cyclePath, approvedTag)).adjustments.length, 1)

  const threadPath = `/data/threads?cycleId=${cycleId}`, threadsTag = await unchanged(threadPath)
  const thread = { id: 't_0000000000000001', cycleId, shiftId: null, disputeId: null, counterparty: { kind: 'worker' as const, name: 'Test worker' }, status: 'waiting' as const, createdAt: at }
  await journey.saveConversation(email, thread, [{ id: 'm_1', threadId: thread.id, dir: 'in', text: 'Recorded reply', status: 'recorded', at }])
  assert.equal((await changed(threadPath, threadsTag)).threads[0].messages[0].text, 'Recorded reply')
  await unchanged(threadPath)

  const memoryTag = await unchanged('/memory')
  await memory.insertInstinct(email, { id: 'i_0000000000000001', kind: 'context', text: 'Payroll contact confirmed', source: 'user',
    status: 'active', until: null, ruleId: null, replacedBy: null, at, updatedAt: at })
  assert.equal((await changed('/memory', memoryTag)).instincts.length, 1)
  await unchanged('/memory')

  const historyTag = await unchanged('/chat/history')
  const appended = await post('/chat/history', { messages: [{ id: 'user-1', role: 'user', text: 'Ready for review', at: 1 }] })
  assert.equal(appended.status, 200)
  assert.equal((await changed('/chat/history', historyTag)).messages[0].text, 'Ready for review')
  await unchanged('/chat/history')

  const { sessionToken } = await signSession({ sub: 'other', email: 'other@hypertrack.io', name: 'Other', picture: '' }, env.SESSION_SECRET)
  const other = await get('/chat/history', historyTag, `Bearer ${sessionToken}`)
  assert.equal(other.status, 200, 'the other account has identical empty history but a different validator')
  assert.notEqual(other.headers.get('etag'), historyTag)
  assert.deepEqual(await other.json(), { messages: [] })
  assert.equal((await get(cyclePath, '*', `Bearer ${sessionToken}`)).status, 404, 'wildcard cannot bypass account scoping or resource existence')
  assert.equal((await get(cyclePath, cycleTag, 'Bearer invalid')).status, 401, 'validators never bypass authentication')
})
