import { authedFetch } from '@/lib/api'
import { viewerSession } from '@/lib/viewerSession'

/** GET bodies stay parsed in memory; IndexedDB stores structured clones, never session tokens. */
export interface CachedResponse { key: string; account: string; path: string; body: unknown; etag: string | null; checkedAt: number }
export interface ResponseStorage {
  read(account: string): Promise<CachedResponse[]>
  write(row: CachedResponse): Promise<void>
  remove(keys: string[]): Promise<void>
  clear(account?: string): Promise<void>
}
const DATABASE = 'closeout-responses-v1'
let database: Promise<IDBDatabase | null> | undefined
function openDatabase(): Promise<IDBDatabase | null> {
  if (!database) database = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    try {
      const request = indexedDB.open(DATABASE, 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('responses', { keyPath: 'key' })
        store.createIndex('account', 'account')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
  return database
}
export const indexedDBResponses: ResponseStorage = {
  async read(account) {
    const db = await openDatabase()
    if (!db) return []
    return new Promise(resolve => {
      const request = db.transaction('responses').objectStore('responses').index('account').getAll(account)
      request.onsuccess = () => resolve(request.result as CachedResponse[])
      request.onerror = () => resolve([])
    })
  },
  async write(row) {
    const db = await openDatabase()
    if (!db) return
    await new Promise<void>(resolve => {
      const tx = db.transaction('responses', 'readwrite')
      tx.objectStore('responses').put(row)
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => resolve()
    })
  },
  async remove(keys) {
    const db = await openDatabase()
    if (!db || !keys.length) return
    await new Promise<void>(resolve => {
      const tx = db.transaction('responses', 'readwrite')
      for (const key of keys) tx.objectStore('responses').delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => resolve()
    })
  },
  async clear(account) {
    const db = await openDatabase()
    if (!db) return
    if (account) { await this.remove((await this.read(account)).map(row => row.key)); return }
    await new Promise<void>(resolve => {
      const tx = db.transaction('responses', 'readwrite')
      tx.objectStore('responses').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => resolve()
    })
  },
}
export type CacheMode = 'cache-first' | 'network-first' | 'stale-while-revalidate'
export interface CacheOptions { mode?: CacheMode; maxAge?: number }
const persistent = (path: string) => /^\/(state|memory|chat\/history|data\/cycles(?:\/[^/?]+)?|data\/threads)(?:\?|$)/.test(path) || path === '/files'
const cycleDetail = (path: string) => /^\/data\/cycles\/([^/?]+)$/.exec(path)?.[1]
export class ResponseCache {
  private rows = new Map<string, CachedResponse>()
  private pending = new Map<string, Promise<CachedResponse>>()
  private restored = new Map<string, Promise<void>>()
  private ready = new Set<string>()
  private listeners = new Set<(row: CachedResponse) => void>()
  private generations = new Map<string, number>()
  private revisions = new Map<string, number>()
  private persistence: Promise<void> = Promise.resolve()
  private storage: ResponseStorage
  private fetcher: (path: string, init?: RequestInit, account?: string) => Promise<Response>
  private now: () => number
  constructor(storage: ResponseStorage, fetcher: (path: string, init?: RequestInit, account?: string) => Promise<Response>, now = () => Date.now()) { this.storage = storage; this.fetcher = fetcher; this.now = now }
  private key(account: string, path: string) { return `${account}\n${path}` }
  subscribe(listener: (row: CachedResponse) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  paths(account: string): string[] { return [...this.rows.values()].filter(row => row.account === account && persistent(row.path)).map(row => row.path) }
  peek<T>(account: string, path: string): T | undefined { return this.rows.get(this.key(account, path))?.body as T | undefined }
  restore(account: string): Promise<void> {
    let work = this.restored.get(account)
    if (!work) {
      const generation = this.generations.get(account) ?? 0
      work = this.storage.read(account).then(rows => {
        if (generation !== (this.generations.get(account) ?? 0)) return
        this.ready.add(account)
        for (const row of rows) if (!this.rows.has(row.key)) { this.rows.set(row.key, row); this.listeners.forEach(listener => listener(row)) }
      }).catch(() => { if (generation === (this.generations.get(account) ?? 0)) this.ready.add(account) })
      this.restored.set(account, work)
    }
    return work
  }
  put(account: string, path: string, body: unknown, etag: string | null = null): CachedResponse {
    const row = { key: this.key(account, path), account, path, body, etag, checkedAt: this.now() }
    this.rows.set(row.key, row)
    this.listeners.forEach(listener => listener(row))
    if (persistent(path)) this.persistence = this.persistence.then(async () => {
      await this.storage.write(row)
      // Cycle dates are sortable ISO strings. Keep the current pay run plus its predecessor.
      const cycles = [...this.rows.values()].filter(item => item.account === account && cycleDetail(item.path))
        .sort((a, b) => String((b.body as { cycle?: { end?: string } }).cycle?.end ?? '').localeCompare(String((a.body as { cycle?: { end?: string } }).cycle?.end ?? '')))
      const old = cycles.slice(2)
      await this.storage.remove(old.map(item => item.key))
      // Thread rows for evicted cycles must not grow the persisted store without bound either.
      const listed = (this.peek<{ cycles?: { id: string; end: string }[] }>(account, '/data/cycles')?.cycles ?? [])
        .slice().sort((a, b) => b.end.localeCompare(a.end)).slice(0, 2)
      const allowed = new Set([...cycles.slice(0, 2).map(item => cycleDetail(item.path)), ...listed.map(item => item.id)])
      const threads = [...this.rows.values()].filter(item => item.account === account && item.path.startsWith('/data/threads?'))
        .sort((a, b) => b.checkedAt - a.checkedAt)
      // A thread intent can win the race with its cycle detail (or the cycle has no run yet).
      const keepThreads = new Set(threads.filter(item => !allowed.size || allowed.has(new URLSearchParams(item.path.split('?')[1]).get('cycleId') ?? '')).slice(0, 2).map(item => item.key))
      await this.storage.remove(threads.filter(item => !keepThreads.has(item.key)).map(item => item.key))
    }).catch(() => {})
    // Time-entry/evidence intent reads are short-lived and never written to disk.
    if (this.rows.size > 160) for (const [key, item] of this.rows) { if (!persistent(item.path)) this.rows.delete(key); if (this.rows.size <= 128) break }
    return row
  }
  read(account: string, path: string, options: CacheOptions = {}): Promise<CachedResponse> {
    if (!this.ready.has(account) && !(this.storage === indexedDBResponses && typeof indexedDB === 'undefined')) {
      const generation = this.generations.get(account) ?? 0
      return this.restore(account).then(() => {
        if (generation !== (this.generations.get(account) ?? 0)) throw new Error('The account cache was cleared.')
        return this.read(account, path, options)
      })
    }
    const key = this.key(account, path), existing = this.rows.get(key)
    const mode = options.mode ?? 'cache-first'
    if (existing && mode !== 'network-first') {
      if (mode === 'stale-while-revalidate' || this.now() - existing.checkedAt > (options.maxAge ?? 30_000)) void this.revalidate(account, path).catch(() => {})
      return Promise.resolve(existing)
    }
    return this.revalidate(account, path)
  }
  revalidate(account: string, path: string): Promise<CachedResponse> {
    const key = this.key(account, path), pending = this.pending.get(key)
    if (pending) return pending
    const generation = this.generations.get(account) ?? 0, revision = this.revisions.get(key) ?? 0
    const existing = this.rows.get(key)
    const headers = new Headers()
    if (existing?.etag) headers.set('If-None-Match', existing.etag)
    const work = this.fetcher(path, existing?.etag ? { headers } : undefined, account).then(async response => {
      if (generation !== (this.generations.get(account) ?? 0)) throw new Error('The account cache was cleared.')
      if (revision !== (this.revisions.get(key) ?? 0)) throw new Error('A newer refresh replaced this request.')
      if (this.rows.get(key) !== existing && this.rows.has(key)) return this.rows.get(key)!
      if (response.status === 304 && existing) {
        existing.checkedAt = this.now()
        return existing
      }
      if (!response.ok) throw new CachedRequestError(response)
      const body: unknown = await response.json()
      if (generation !== (this.generations.get(account) ?? 0)) throw new Error('The account cache was cleared.')
      if (revision !== (this.revisions.get(key) ?? 0)) throw new Error('A newer refresh replaced this request.')
      // A confirmed mutation published while the request was running owns the cache.
      if (this.rows.get(key) !== existing && this.rows.has(key)) return this.rows.get(key)!
      return this.put(account, path, body, response.headers.get('ETag'))
    }).finally(() => { if (this.pending.get(key) === work) this.pending.delete(key) })
    this.pending.set(key, work)
    return work
  }
  /** A completed mutation makes older in-flight GETs ineligible to satisfy its refresh. */
  supersede(account: string, prefixes: string[]) {
    for (const key of this.pending.keys()) if (key.startsWith(`${account}\n`) && prefixes.some(prefix => key.slice(account.length + 1).startsWith(prefix))) {
      this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1)
      this.pending.delete(key)
    }
  }
  async clear(account?: string) {
    const accounts = account ? [account] : [...new Set([...this.restored.keys(), ...[...this.rows.values()].map(row => row.account), ...[...this.pending.keys()].map(key => key.split('\n')[0])])]
    for (const owner of accounts) { this.generations.set(owner, (this.generations.get(owner) ?? 0) + 1); this.restored.delete(owner); this.ready.delete(owner) }
    for (const [key, row] of this.rows) if (!account || row.account === account) this.rows.delete(key)
    for (const key of this.pending.keys()) if (!account || key.startsWith(`${account}\n`)) this.pending.delete(key)
    await this.persistence
    await this.storage.clear(account)
  }
  /** Test/cleanup barrier: all queued IndexedDB writes have committed. */
  settled() { return this.persistence }
}
export class CachedRequestError extends Error {
  readonly response: Response
  constructor(response: Response) { super(`The request could not be completed (${response.status}).`); this.response = response }
}
const account = () => viewerSession()?.email ?? 'development'
const responses = new ResponseCache(indexedDBResponses, async (path, init, requestedAccount) => {
  if (requestedAccount !== account()) throw new Error('The account changed. Reopen this pane and try again.')
  const response = await authedFetch(path, init)
  if (requestedAccount !== account()) throw new Error('The account changed. Reopen this pane and try again.')
  return response
})
const warmKey = (owner: string) => `closeout-cache-warm:${owner}`
const warmAtBoot = new Map<string, boolean>()
export function hasWarmResponseCache(): boolean {
  const owner = account()
  if (!warmAtBoot.has(owner)) {
    try { warmAtBoot.set(owner, localStorage.getItem(warmKey(owner)) === '1') } catch { warmAtBoot.set(owner, false) }
  }
  return warmAtBoot.get(owner) ?? false
}
responses.subscribe(row => {
  if (row.path !== '/state' && row.path !== '/data/cycles') return
  if (responses.peek(row.account, '/state') && responses.peek(row.account, '/data/cycles')) {
    try { localStorage.setItem(warmKey(row.account), '1') } catch { /* Private browsing may disable storage. */ }
  }
})
export const supersedeCachedReads = (prefixes: string[]) => responses.supersede(account(), prefixes)
export const restoreResponseCache = () => responses.restore(account())
export const clearResponseCache = async (owner?: string) => {
  if (owner) warmAtBoot.delete(owner); else warmAtBoot.clear()
  try {
    if (owner) localStorage.removeItem(warmKey(owner))
    else for (const key of Object.keys(localStorage)) if (key.startsWith('closeout-cache-warm:')) localStorage.removeItem(key)
  } catch { /* Storage may be disabled. */ }
  await responses.clear(owner)
}
export const peekCached = <T>(path: string) => responses.peek<T>(account(), path)
export const subscribeCached = (path: string, listener: (body: unknown) => void) => responses.subscribe(row => { if (row.account === account() && row.path === path) listener(row.body) })
export const subscribeAllCached = (listener: (path: string, body: unknown) => void) => responses.subscribe(row => { if (row.account === account()) listener(row.path, row.body) })
export const cacheResponse = (path: string, body: unknown, owner = account()) => {
  if (owner === account() && responses.peek(owner, path) !== body) responses.put(owner, path, body)
}
export async function cachedJson<T>(path: string, options: CacheOptions = {}): Promise<T> {
  const owner = account(), row = await responses.read(owner, path, options)
  if (owner !== account()) throw new Error('The account changed. Reopen this pane and try again.')
  return row.body as T
}
export async function cachedFetch(path: string, options: CacheOptions = {}): Promise<Response> {
  try {
    const owner = account(), row = await responses.read(owner, path, options)
    if (owner !== account()) throw new Error('The account changed. Reopen this pane and try again.')
    return new Response(JSON.stringify(row.body), { headers: { 'Content-Type': 'application/json', ...(row.etag ? { ETag: row.etag } : {}) } })
  } catch (cause) { if (cause instanceof CachedRequestError) return cause.response.clone(); throw cause }
}
export const savesData = () => typeof navigator !== 'undefined' && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
export async function prefetchGet(path: string): Promise<void> { if (!savesData()) await cachedJson(path).then(() => {}, () => {}) }
/** Start the two independent boot reads before React's effects, while the shell renders. */
export function startBootCache(): void {
  void restoreResponseCache().then(() => {
    for (const path of new Set(['/state', '/data/cycles', '/memory', '/chat/history', ...responses.paths(account())])) void cachedJson(path, { mode: 'stale-while-revalidate' }).catch(() => {})
  })
}
