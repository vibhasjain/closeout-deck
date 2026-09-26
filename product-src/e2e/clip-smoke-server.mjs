import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const serverRoot = fileURLToPath(new URL('../server/', import.meta.url))
const serverRequire = createRequire(new URL('../server/package.json', import.meta.url))
const loopback = value => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(value).toLowerCase())

/** Deny external HTTP and socket traffic for the lifetime of this local fixture. */
function offlineNetwork(blockedCalls) {
  const originalFetch = globalThis.fetch
  const originalConnect = net.Socket.prototype.connect
  const reject = (kind, destination) => {
    blockedCalls.push({ kind, destination: String(destination) })
    throw new Error(`Clip smoke blocked ${kind}: ${destination}`)
  }
  globalThis.fetch = function (input, options) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (!loopback(url.hostname) || !['http:', 'https:'].includes(url.protocol)) reject('external fetch', url.origin)
    return originalFetch.call(this, input, options)
  }
  net.Socket.prototype.connect = function (...args) {
    const normalized = Array.isArray(args[0]) ? args[0] : args
    const options = normalized[0]
    // Local pipes are used by browser tooling. TCP must stay on loopback.
    const host = options && typeof options === 'object'
      ? options.path ? null : options.host ?? 'localhost'
      : typeof options === 'string' && !/^\d+$/.test(options) ? null
        : typeof normalized[1] === 'string' ? normalized[1] : 'localhost'
    if (host !== null && !loopback(host)) reject('external socket', host)
    return originalConnect.apply(this, args)
  }
  return () => {
    globalThis.fetch = originalFetch
    net.Socket.prototype.connect = originalConnect
  }
}

/**
 * Real HTTP API with isolated memory stores and fresh, signed development identities.
 * No process.env or .env is passed to the application; all model/firm/live callbacks reject.
 *
 * Returns { apiOrigin, blockedCalls, seedIdentity, setState, request, stores, close }.
 * seedIdentity({ email, doc = {}, sample = true, name }) returns { session, sample, cycles, sources }.
 * request(session, path, init) invokes the real authenticated API and returns parsed JSON.
 * setState(email, doc) replaces that identity's state using the real conditional-write helper.
 * The Vite proxy must remove its Origin header: the application has a fixed CORS allowlist.
 * Always await close() after closing browser contexts and Vite; it restores network patches.
 */
export async function startOfflineServer() {
  const blockedCalls = []
  const restoreNetwork = offlineNetwork(blockedCalls)
  let unregister
  let server
  let dataDirectory
  let closed = false
  async function close() {
    if (closed) return
    closed = true
    try {
      if (server?.listening) {
        await new Promise((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve())
          server.closeAllConnections()
        })
      }
    } finally {
      try { if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true }) }
      finally {
        try { await unregister?.() }
        finally { restoreNetwork() }
      }
    }
  }
  try {
    const { register } = await import(pathToFileURL(serverRequire.resolve('tsx/esm/api')).href)
    const loader = register({ namespace: `clip-smoke-${randomUUID()}` })
    unregister = loader.unregister
    const mod = name => loader.import(pathToFileURL(join(serverRoot, 'src', `${name}.ts`)).href, import.meta.url)
    const [http, dataModule, journeyModule, memoryModule, stateModule, auth] = await Promise.all([
      mod('index'), mod('datastore'), mod('journeyStore'), mod('memoryStore'), mod('state'), mod('auth'),
    ])
    dataDirectory = await mkdtemp(join(tmpdir(), 'closeout-clip-smoke-'))
    const env = {
      NODE_ENV: 'development',
      ALLOWED_DOMAINS: 'hypertrack.io',
      CLOSEOUT_DEV_EMAIL: 'clip-smoke-dev@hypertrack.io',
      SESSION_SECRET: randomBytes(32).toString('hex'),
      CLOSEOUT_DATA_DIR: dataDirectory,
    }
    const rows = new Map()
    const data = dataModule.createMemoryDataStore()
    const journey = journeyModule.createMemoryJourneyStore()
    const memory = memoryModule.createMemoryMemoryStore()
    const state = {
      async get(email) { return rows.get(email) ?? null },
      async put(email, doc, base) {
        const next = stateModule.conditionalState(rows.get(email) ?? null, structuredClone(doc), base)
        if (next.kind === 'conflict') return { status: 409, row: next.row }
        rows.set(email, next.row)
        return { status: 200, row: next.row }
      },
    }
    const remove = data.deleteAccount.bind(data)
    data.deleteAccount = async email => { await remove(email); rows.delete(email) }
    const rejectCall = kind => async () => {
      blockedCalls.push({ kind })
      throw new Error(`${kind} disabled in offline clip smoke`)
    }
    server = http.createServer({
      env, dataStore: data, journeyStore: journey, memoryStore: memory, stateStore: state,
      claudeVersion: async () => 'offline-clip-smoke',
      runAgent: rejectCall('agent'),
      liveFetch: rejectCall('live'),
      verifyGoogle: rejectCall('Google authentication'),
      firmReader: { read: rejectCall('firm lookup') },
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const apiOrigin = `http://127.0.0.1:${server.address().port}`
    async function request(session, path, init = {}) {
      if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected local API path')
      const response = await fetch(`${apiOrigin}${path}`, {
        ...init,
        ...(init.body && typeof init.body === 'object' && !(init.body instanceof Uint8Array)
          ? { body: JSON.stringify(init.body) } : {}),
        headers: { Authorization: `Bearer ${session.sessionToken}`, 'Content-Type': 'application/json', ...init.headers },
      })
      const body = await response.json()
      if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`)
      return body
    }
    async function setState(email, doc) {
      const previous = await state.get(email)
      const result = await state.put(email, doc, previous?.updated_at ?? null)
      if (result.status !== 200) throw new Error('Unexpected fixture state conflict')
      return result.row
    }
    async function seedIdentity({ email = `clip-smoke-${randomUUID()}@hypertrack.io`, doc = {}, sample = true, name = 'Clip Smoke' } = {}) {
      if (!auth.isAllowedEmail(email, env.ALLOWED_DOMAINS)) throw new Error('Fixture identity must use hypertrack.io')
      const session = await auth.signSession({ sub: email, email, name, picture: '' }, env.SESSION_SECRET)
      await setState(email, doc)
      const seeded = sample ? await request(session, '/data/sample', { method: 'POST', body: '{}' }) : null
      const overview = sample ? await request(session, '/data/cycles') : { cycles: [], sources: [] }
      return { session, sample: seeded, cycles: overview.cycles, sources: overview.sources }
    }
    return { apiOrigin, blockedCalls, seedIdentity, setState, request, stores: { data, journey, memory, state }, close }
  } catch (error) {
    await close()
    throw error
  }
}
