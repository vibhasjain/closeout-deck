import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { conditionalState, createStateStore } from '../src/state.ts'

const current = { doc: { old: true }, updated_at: '2026-09-25T12:00:00.000Z' }

test('conditional state conflicts on stale versions and accepts matching or empty state', () => {
  const now = new Date('2026-09-25T12:01:00Z')
  assert.deepEqual(conditionalState(current, {}, null, now), { kind: 'conflict', row: current })
  assert.deepEqual(conditionalState(current, {}, 'stale', now), { kind: 'conflict', row: current })
  const expected = { kind: 'upsert', row: { doc: { new: true }, updated_at: now.toISOString() } }
  assert.deepEqual(conditionalState(current, { new: true }, current.updated_at, now), expected)
  assert.deepEqual(conditionalState(null, { new: true }, null, now), expected)
})

test('a successful write always advances the version, including within one millisecond', () => {
  const decision = conditionalState(current, {}, current.updated_at, new Date(current.updated_at))
  assert.equal(decision.kind, 'upsert')
  assert.equal(decision.row.updated_at, '2026-09-25T12:00:00.001Z')
})

function mockStore(replies: Array<{ status?: number; data: unknown }>) {
  const requests: Array<{ method: string; url: URL; body: Record<string, unknown> | null }> = []
  const client = createClient('https://test.supabase.co', 'test-service-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const reply = replies.shift()
        assert.ok(reply, 'unexpected database request')
        requests.push({
          method: init?.method ?? 'GET', url: new URL(String(input)),
          body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null,
        })
        return new Response(JSON.stringify(reply.data), {
          status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  })
  return { store: createStateStore(client), requests }
}

test('state update filters both email and the observed version', async () => {
  const saved = { doc: { new: true }, updated_at: '2026-09-25T12:01:00.000Z' }
  const { store, requests } = mockStore([{ data: [current] }, { data: [saved] }])
  assert.deepEqual(await store.put('alex@hypertrack.io', saved.doc, current.updated_at), { status: 200, row: saved })
  assert.equal(requests[1].method, 'PATCH')
  assert.equal(requests[1].url.searchParams.get('email'), 'eq.alex@hypertrack.io')
  assert.equal(requests[1].url.searchParams.get('updated_at'), `eq.${current.updated_at}`)
})

test('a lost update race returns the winning row with 409', async () => {
  const winner = { doc: { winner: true }, updated_at: '2026-09-25T12:01:00.000Z' }
  const { store, requests } = mockStore([{ data: [current] }, { data: [] }, { data: [winner] }])
  assert.deepEqual(await store.put('alex@hypertrack.io', {}, current.updated_at), { status: 409, row: winner })
  assert.equal(requests.length, 3)
})

test('a competing insert returns 409 instead of overwriting the new row', async () => {
  const { store, requests } = mockStore([
    { data: [] }, { status: 409, data: { code: '23505', message: 'duplicate' } }, { data: [current] },
  ])
  assert.deepEqual(await store.put('alex@hypertrack.io', {}, null), { status: 409, row: current })
  assert.equal(requests[1].method, 'POST')
  assert.equal(requests[1].body?.email, 'alex@hypertrack.io')
})
