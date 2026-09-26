import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { createMemoryDataStore } from '../src/datastore.ts'
import { createServer } from '../src/index.ts'

for (const path of ['/data/cycles/2026-09-20/decisions', '/files']) {
  test(`an aborted queued ${path} cannot strand the account data lock`, { timeout: 5_000 }, async t => {
    const store = createMemoryDataStore()
    let release!: () => void, reached!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const held = new Promise<void>(resolve => { reached = resolve })
    let holdFirst = true
    const server = createServer({
      env: { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: `abort-${path === '/files' ? 'upload' : 'decision'}@hypertrack.io`,
        ALLOWED_DOMAINS: 'hypertrack.io', SESSION_SECRET: 'abort-data-test-secret-at-least-32-bytes' },
      claudeVersion: async () => 'test', runAgent: async () => { throw new Error('No agent calls in abort tests') },
      dataStore: { ...store, async listRuns(email) {
        if (holdFirst) { holdFirst = false; reached(); await gate }
        return store.listRuns(email)
      } },
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(async () => {
      release()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    })
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const first = fetch(base + '/data/cycles')
    await held
    const received = new Promise<void>(resolve => server.once('request', () => resolve()))
    const aborted = new Promise<void>(resolve => server.once('request', request => request.once('aborted', () => resolve())))
    // The body is incomplete when the browser closes, before this queued handler can read it.
    const queued = httpRequest(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '100' } })
    queued.on('error', () => {})
    queued.write('{')
    await received
    queued.destroy()
    await aborted
    release()
    assert.equal((await first).status, 200)
    assert.equal((await fetch(base + '/files', { signal: AbortSignal.timeout(1000) })).status, 200, 'unlocked reads still work')
    const next = await fetch(base + '/data/cycles', { signal: AbortSignal.timeout(1000) })
    assert.equal(next.status, 200, 'the abandoned body reader must reject and release the queued lock')
  })
}
