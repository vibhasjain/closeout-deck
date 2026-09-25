import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestContext } from 'node:test'
import type { AddressInfo } from 'node:net'
import { AuthError, InviteOnlyError, signSession, verifySession } from '../src/auth.ts'
import { AGENT_ERROR } from '../src/claude.ts'
import { createServer, listenHost, turnTimeoutMs } from '../src/index.ts'
import { GlobalSemaphore } from '../src/queue.ts'
import { MAX_DOC_BYTES } from '../src/validation.ts'

const devEnv = {
  NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: 'dev@hypertrack.io',
  ALLOWED_DOMAINS: 'hypertrack.io', SESSION_SECRET: 'test-session-secret-at-least-32-bytes',
}
const chatBody = { mode: 'chat', message: 'Hi', context: { page: '/payroll' } }
const post = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 2_000; i += 1) {
    if (predicate()) return
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  assert.fail('Condition was not reached')
}

async function serve(t: TestContext, options: Parameters<typeof createServer>[0] = {}) {
  const server = createServer({ env: devEnv, claudeVersion: async () => '2.1.282 (Claude Code)', ...options })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

test('health is public but production never enables the dev identity', async t => {
  const url = await serve(t, { env: { ...devEnv, NODE_ENV: 'production' } })
  const health = await fetch(`${url}/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { ok: true, claude: '2.1.282 (Claude Code)' })
  for (const path of ['/chat', '/state', '/live-session', '/dictate', '/firm']) {
    const response = await fetch(`${url}${path}`, path === '/state' ? {} : post(chatBody))
    assert.equal(response.status, 401, path)
    assert.deepEqual(await response.json(), { error: 'invalid_token' })
  }
})

test('server startup rejects short secrets and uses loopback outside production', () => {
  for (const secret of [undefined, '', 'x'.repeat(31)]) {
    assert.throws(() => createServer({ env: { SESSION_SECRET: secret } }), /SESSION_SECRET must be at least 32 bytes/)
  }
  for (const NODE_ENV of [undefined, 'test', 'development']) assert.equal(listenHost({ NODE_ENV }), '127.0.0.1')
  assert.equal(listenHost({ NODE_ENV: 'production' }), '0.0.0.0')
  assert.equal(turnTimeoutMs('chat', {}), 180_000)
  assert.equal(turnTimeoutMs('chat', { CLOSEOUT_CHAT_TIMEOUT_MS: '2000' }), 2_000)
  assert.equal(turnTimeoutMs('scribe', { CLOSEOUT_SCRIBE_TIMEOUT_MS: '4000' }), 4_000)
})

test('account-queued requests receive early headers and a keepalive by 15 seconds', { timeout: 5_000 }, async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  let calls = 0
  let finishFirst!: () => void
  const firstTurn = new Promise<void>(resolve => { finishFirst = resolve })
  const interval = t.mock.method(globalThis, 'clearInterval')
  const url = await serve(t, {
    workspace: async () => '/test/workspace',
    runAgent: async options => {
      calls += 1
      if (calls === 1) await firstTurn
      options.onEvent({ done: true, sessionId: `session-${calls}` })
    },
  })
  const first = await fetch(`${url}/chat`, post(chatBody))
  await waitFor(() => calls === 1)
  const queued = await fetch(`${url}/chat`, post(chatBody))
  assert.equal(queued.status, 200)
  assert.match(queued.headers.get('Content-Type') ?? '', /text\/event-stream/)
  assert.equal(calls, 1, 'queued headers arrived before its runner started')
  const reader = queued.body!.getReader()
  const heartbeat = reader.read()
  t.mock.timers.tick(15_000)
  assert.equal(new TextDecoder().decode((await heartbeat).value), ': ka\n\n')
  const third = await fetch(`${url}/chat`, post(chatBody))
  assert.equal(third.status, 429)
  finishFirst()
  await first.text()
  while (!(await reader.read()).done) { /* drain terminal event */ }
  assert.equal(calls, 2)
  assert.ok(interval.mock.callCount() >= 2, 'timers were cleared on stream completion')
})

test('global admission returns HTTP 429 when a fourth account waits thirty seconds', { timeout: 5_000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const admission = t.mock.method(GlobalSemaphore.prototype, 'acquire')
  let active = 0
  const url = await serve(t, {
    workspace: async () => '/test/workspace',
    runAgent: async options => {
      active += 1
      await new Promise<void>(resolve => options.signal?.addEventListener('abort', () => { active -= 1; resolve() }, { once: true }))
    },
  })
  const controllers: AbortController[] = []
  const request = async (index: number) => {
    const { sessionToken } = await signSession({ sub: String(index), email: `${index}@hypertrack.io`, name: '', picture: '' }, devEnv.SESSION_SECRET)
    const controller = new AbortController()
    controllers.push(controller)
    return fetch(`${url}/chat`, { ...post(chatBody), headers: { Authorization: `Bearer ${sessionToken}` }, signal: controller.signal })
  }
  t.after(() => controllers.forEach(controller => controller.abort()))
  await Promise.all([request(1), request(2), request(3)])
  await waitFor(() => active === 3)
  const fourth = request(4)
  await waitFor(() => admission.mock.callCount() === 4)
  t.mock.timers.tick(30_000)
  const rejected = await fourth
  assert.equal(rejected.status, 429)
  assert.deepEqual(await rejected.json(), { error: 'queue_full' })
  assert.equal(active, 3)
})

test('HTTP rate limit rejects the thirty-first turn and expires after ten minutes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const url = await serve(t, {
    workspace: async () => '/test/workspace',
    runAgent: async options => {
      assert.equal(options.timeoutMs, 180_000)
      options.onEvent({ done: true, sessionId: 'session' })
    },
  })
  for (let i = 0; i < 30; i += 1) {
    const response = await fetch(`${url}/chat`, post(chatBody))
    assert.equal(response.status, 200)
    await response.text()
  }
  assert.equal((await fetch(`${url}/chat`, post(chatBody))).status, 429)
  t.mock.timers.tick(600_000)
  const next = await fetch(`${url}/chat`, post(chatBody))
  assert.equal(next.status, 200)
  await next.text()
})

test('unexpected failures log messages or plain objects but send fixed browser errors', async t => {
  const logged = t.mock.method(console, 'error', () => {})
  const url = await serve(t, {
    workspace: async () => '/test/workspace',
    runAgent: async () => { throw new Error('runner diagnostic') },
    stateStore: { get: async () => { throw { reason: 'state diagnostic' } }, put: async () => { throw new Error('unused') } },
  })
  const chat = await fetch(`${url}/chat`, post(chatBody))
  const body = await chat.text()
  assert.ok(body.includes(AGENT_ERROR))
  assert.ok(!body.includes('runner diagnostic'))
  const state = await fetch(`${url}/state`)
  assert.equal(state.status, 500)
  assert.deepEqual(await state.json(), { error: 'internal_error' })
  assert.deepEqual(logged.mock.calls.map(call => call.arguments), [
    ['Request failed:', 'runner diagnostic'],
    ['Request failed:', '{"reason":"state diagnostic"}'],
  ])
})

test('session exchanges a Google identity for a signed session and rejects wrong domains and bad tokens', async t => {
  const user = { sub: '123', email: 'user@hypertrack.io', name: 'User', picture: '' }
  const env = { NODE_ENV: 'production', GOOGLE_CLIENT_ID: 'google-client', ALLOWED_DOMAINS: 'hypertrack.io', SESSION_SECRET: 'test-session-secret-at-least-32-bytes' }
  const url = await serve(t, {
    env,
    verifyGoogle: async (token, audience, _keys, allowedDomains) => {
      assert.equal(audience, env.GOOGLE_CLIENT_ID)
      assert.equal(allowedDomains, env.ALLOWED_DOMAINS)
      if (token === 'bad') throw new AuthError()
      if (token === 'unlisted-hd') throw new InviteOnlyError()
      return token === 'wrong-domain' ? { ...user, email: 'user@evilhypertrack.io' } : user
    },
  })
  const success = await fetch(`${url}/session`, post({ idToken: 'good' }))
  assert.equal(success.status, 200)
  const session = await success.json() as { sessionToken: string; exp: number; email: string }
  assert.equal(session.email, user.email)
  assert.ok(session.exp > Date.now() / 1000)
  assert.deepEqual(await verifySession(session.sessionToken, env.SESSION_SECRET), user)
  const authenticated = await fetch(`${url}/firm`, { method: 'POST', headers: { Authorization: `Bearer ${session.sessionToken}` } })
  assert.equal(authenticated.status, 501)
  for (const [idToken, status, error] of [['wrong-domain', 403, 'invite_only'], ['unlisted-hd', 403, 'invite_only'], ['bad', 401, 'invalid_token']] as const) {
    const response = await fetch(`${url}/session`, post({ idToken }))
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), { error })
  }
})

test('CORS only allows the production and local app origins', async t => {
  const url = await serve(t)
  for (const origin of ['https://closeoutcopilot.com', 'http://localhost:9000']) {
    const response = await fetch(`${url}/health`, { headers: { Origin: origin } })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
  }
  const disallowed = await fetch(`${url}/health`, { headers: { Origin: 'https://closeoutcopilot.com.evil.com' } })
  assert.equal(disallowed.status, 403)
  assert.equal(disallowed.headers.get('Access-Control-Allow-Origin'), null)
  for (const [path, method] of [['/chat', 'POST'], ['/session', 'POST'], ['/state', 'GET'], ['/state', 'PUT']]) {
    const preflight = await fetch(`${url}${path}`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://closeoutcopilot.com',
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://closeoutcopilot.com')
    assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type')
    assert.ok(preflight.headers.get('Access-Control-Allow-Methods')?.split(', ').includes(method))
    assert.equal(preflight.headers.get('Vary'), 'Origin')
  }
})

test('chat validates bodies and unimplemented modes and endpoints remain authenticated stubs', async t => {
  let agentCalled = false
  const url = await serve(t, { env: devEnv, runAgent: async () => { agentCalled = true } })
  for (const mode of ['scribe', 'delegate', 'consolidate']) {
    const response = await fetch(`${url}/chat`, post({ ...chatBody, mode }))
    assert.equal(response.status, 501)
    assert.deepEqual(await response.json(), { error: 'not_yet' })
  }
  for (const context of [[], null, 'context', { long: 'x'.repeat(60_000) }]) {
    assert.equal((await fetch(`${url}/chat`, post({ ...chatBody, context }))).status, 400)
  }
  assert.equal((await fetch(`${url}/chat`, post({ ...chatBody, message: 'x'.repeat(8_001) }))).status, 400)
  assert.equal((await fetch(`${url}/chat`, post({ ...chatBody, mode: 'other' }))).status, 400)
  for (const path of ['/live-session', '/dictate', '/firm']) {
    const response = await fetch(`${url}${path}`, { method: 'POST' })
    assert.equal(response.status, 501)
    assert.deepEqual(await response.json(), { error: 'not_yet' })
  }
  assert.equal(agentCalled, false)
})

test('chat streams the exact SSE contract with a server-owned prompt', async t => {
  const url = await serve(t, {
    env: devEnv,
    workspace: async user => { assert.equal(user.email, devEnv.CLOSEOUT_DEV_EMAIL); return '/test/workspace' },
    runAgent: async options => {
      assert.equal(options.cwd, '/test/workspace')
      assert.equal(options.message, 'Hi')
      assert.match(options.prompt, /Closeout Agent/)
      assert.ok(options.prompt.includes(`CONTEXT (JSON): ${JSON.stringify(chatBody.context)}`))
      options.onEvent({ text: 'Hello' })
      options.onEvent({ done: true, sessionId: 'test-session' })
    },
  })
  const response = await fetch(`${url}/chat`, post(chatBody))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type') ?? '', /text\/event-stream/)
  assert.equal(await response.text(), 'data: {"text":"Hello"}\n\ndata: {"done":true,"sessionId":"test-session"}\n\n')
})

test('disconnecting chat aborts the runner and releases the account queue', { timeout: 5_000 }, async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const cleared = t.mock.method(globalThis, 'clearInterval')
  let calls = 0
  let didAbort!: () => void
  const aborted = new Promise<void>(resolve => { didAbort = resolve })
  const url = await serve(t, {
    env: devEnv,
    workspace: async () => '/test/workspace',
    runAgent: async options => {
      calls += 1
      if (calls === 1) {
        await new Promise<void>(resolve => options.signal?.addEventListener('abort', () => {
          didAbort()
          resolve()
        }, { once: true }))
      } else options.onEvent({ done: true, sessionId: 'second-session' })
    },
  })
  const controller = new AbortController()
  await fetch(`${url}/chat`, { ...post(chatBody), signal: controller.signal })
  const second = fetch(`${url}/chat`, post(chatBody))
  controller.abort()
  await aborted
  assert.ok(cleared.mock.callCount() > 0, 'disconnect clears the keepalive timer')
  assert.equal(await (await second).text(), 'data: {"done":true,"sessionId":"second-session"}\n\n')
  assert.equal(calls, 2)
})

test('state reads and conditional writes are scoped to the authenticated email and enforce the doc limit', async t => {
  let written = false
  const row = { doc: { saved: true }, updated_at: '2026-09-25T12:00:00.000Z' }
  const url = await serve(t, {
    env: devEnv,
    stateStore: {
      get: async email => { assert.equal(email, devEnv.CLOSEOUT_DEV_EMAIL); return null },
      put: async (email, doc, version) => {
        assert.equal(email, devEnv.CLOSEOUT_DEV_EMAIL)
        assert.deepEqual(doc, { draft: true })
        assert.equal(version, 'stale')
        written = true
        return { status: 409, row }
      },
    },
  })
  assert.deepEqual(await (await fetch(`${url}/state`)).json(), { doc: null })
  const conflict = await fetch(`${url}/state`, { ...post({ doc: { draft: true }, base_updated_at: 'stale' }), method: 'PUT' })
  assert.equal(conflict.status, 409)
  assert.deepEqual(await conflict.json(), row)
  assert.equal(written, true)
  written = false
  const oversized = await fetch(`${url}/state`, { ...post({ doc: 'x'.repeat(MAX_DOC_BYTES), base_updated_at: null }), method: 'PUT' })
  assert.equal(oversized.status, 400)
  assert.equal(written, false)
  for (const doc of [null, [], 'text', 3, true]) {
    const invalid = await fetch(`${url}/state`, { ...post({ doc, base_updated_at: null }), method: 'PUT' })
    assert.equal(invalid.status, 400)
  }
  assert.equal(written, false)
})
