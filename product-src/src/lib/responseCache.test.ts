import { describe, expect, it, vi } from 'vitest'
import { ResponseCache, type CachedResponse, type ResponseStorage } from './responseCache'

function storage() {
  const rows = new Map<string, CachedResponse>()
  const adapter: ResponseStorage = {
    async read(account) { return structuredClone([...rows.values()].filter(row => row.account === account)) },
    async write(row) { rows.set(row.key, structuredClone(row)) },
    async remove(keys) { keys.forEach(key => rows.delete(key)) },
    async clear(account) { for (const [key, row] of rows) if (!account || row.account === account) rows.delete(key) },
  }
  return { rows, adapter }
}
const json = (body: unknown, etag = '"v1"') => new Response(JSON.stringify(body), { headers: { ETag: etag } })
const account = 'noload@example.com'
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

describe('parsed GET response cache', () => {
  it('dedupes hover/focus/touch intent; the later click uses the same parsed body without a request', async () => {
    let answer!: (value: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { answer = resolve }))
    const cache = new ResponseCache(storage().adapter, fetcher)
    const hover = cache.read(account, '/data/cycles/current')
    const focus = cache.read(account, '/data/cycles/current')
    const touch = cache.read(account, '/data/cycles/current')
    await tick()
    expect(fetcher).toHaveBeenCalledTimes(1)
    answer(json({ cycle: { id: 'current', end: '2026-09-27' }, total: 20 }))
    const [first, second, third] = await Promise.all([hover, focus, touch])
    const clicked = await cache.read(account, '/data/cycles/current')
    expect(clicked.body).toBe(first.body)
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('a warm reload paints persisted data before the network answers, then publishes fresh data', async () => {
    const disk = storage()
    const beforeReload = new ResponseCache(disk.adapter, vi.fn())
    beforeReload.put(account, '/state', { doc: { firm: 'Saved firm' }, updated_at: 'one' })
    beforeReload.put(account, '/data/cycles/current', { cycle: { id: 'current', end: '2026-09-27' }, count: 20 }, '"v1"')
    await beforeReload.settled()
    let answer!: (value: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { answer = resolve }))
    const afterReload = new ResponseCache(disk.adapter, fetcher)
    const paints: unknown[] = []
    afterReload.subscribe(row => { if (row.path.includes('current')) paints.push(row.body) })
    const warm = await afterReload.read(account, '/data/cycles/current', { mode: 'stale-while-revalidate' })
    expect(warm.body).toMatchObject({ count: 20 })
    expect(paints).toEqual([warm.body])
    expect(fetcher).toHaveBeenCalledTimes(1)
    answer(json({ cycle: { id: 'current', end: '2026-09-27' }, count: 21 }, '"v2"'))
    await tick()
    expect(paints).toHaveLength(2)
    expect(afterReload.peek(account, '/data/cycles/current')).toMatchObject({ count: 21 })
  })

  it('sends If-None-Match and retains object identity when the server returns an empty 304', async () => {
    const fetcher = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 304 }))
    const cache = new ResponseCache(storage().adapter, fetcher)
    const body = { cycles: [{ id: 'current' }] }
    cache.put(account, '/data/cycles', body, '"unchanged"')
    const result = await cache.read(account, '/data/cycles', { mode: 'network-first' })
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('If-None-Match')).toBe('"unchanged"')
    expect(result.body).toBe(body)
  })

  it('keeps current and previous cycles on disk, and clears only the signed-out account', async () => {
    const disk = storage(), cache = new ResponseCache(disk.adapter, vi.fn())
    for (const id of ['2026-09-13', '2026-09-20', '2026-09-27']) cache.put(account, `/data/cycles/${id}`, { cycle: { id, end: id } })
    cache.put('other@example.com', '/memory', { instincts: [] })
    await cache.settled()
    expect([...disk.rows.values()].filter(row => row.account === account).map(row => row.path).sort()).toEqual(['/data/cycles/2026-09-20', '/data/cycles/2026-09-27'])
    await cache.clear(account)
    expect(cache.peek(account, '/data/cycles/2026-09-27')).toBeUndefined()
    expect([...disk.rows.values()].map(row => row.account)).toEqual(['other@example.com'])
  })

  it('cannot repopulate an account after sign-out when a read was already in flight', async () => {
    const disk = storage()
    let answer!: (value: Response) => void
    const cache = new ResponseCache(disk.adapter, () => new Promise<Response>(resolve => { answer = resolve }))
    const pending = cache.read(account, '/memory')
    await tick()
    await cache.clear(account)
    answer(json({ instincts: ['private'] }))
    await expect(pending).rejects.toThrow('The account cache was cleared')
    await cache.settled()
    expect(cache.peek(account, '/memory')).toBeUndefined()
    expect(disk.rows.size).toBe(0)
  })

  it('does not allow an old GET to overwrite a confirmed local mutation', async () => {
    let answer!: (value: Response) => void
    const cache = new ResponseCache(storage().adapter, () => new Promise<Response>(resolve => { answer = resolve }))
    cache.put(account, '/memory', { count: 0 })
    const pending = cache.read(account, '/memory', { mode: 'network-first' })
    await tick()
    cache.put(account, '/memory', { count: 1 })
    answer(json({ count: 0 }))
    expect((await pending).body).toEqual({ count: 1 })
  })
  it('a late 304 cannot replace a newer confirmed row', async () => {
    let answer!: (value: Response) => void
    const cache = new ResponseCache(storage().adapter, () => new Promise<Response>(resolve => { answer = resolve }))
    cache.put(account, '/memory', { count: 0 }, '"old"')
    const pending = cache.read(account, '/memory', { mode: 'network-first' })
    await tick()
    cache.put(account, '/memory', { count: 1 }, '"new"')
    answer(new Response(null, { status: 304 }))
    expect((await pending).body).toEqual({ count: 1 })
  })

  it('rejects a late 304 after sign-out instead of exposing the erased row', async () => {
    let answer!: (value: Response) => void
    const cache = new ResponseCache(storage().adapter, () => new Promise<Response>(resolve => { answer = resolve }))
    cache.put(account, '/memory', { count: 0 }, '"old"')
    const pending = cache.read(account, '/memory', { mode: 'network-first' })
    await tick()
    await cache.clear(account)
    answer(new Response(null, { status: 304 }))
    await expect(pending).rejects.toThrow('The account cache was cleared')
  })

  it('uses the network when IndexedDB fails instead of retrying hydration forever', async () => {
    const disk = storage()
    disk.adapter.read = async () => { throw new Error('Storage is disabled') }
    const fetcher = vi.fn(async () => json({ count: 1 }))
    const cache = new ResponseCache(disk.adapter, fetcher)
    expect((await cache.read(account, '/memory')).body).toEqual({ count: 1 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not restart a cache read when sign-out interrupts IndexedDB restoration', async () => {
    const disk = storage()
    let answer!: (value: CachedResponse[]) => void
    disk.adapter.read = () => new Promise(resolve => { answer = resolve })
    const fetcher = vi.fn(async () => json({ count: 1 }))
    const cache = new ResponseCache(disk.adapter, fetcher)
    const pending = cache.read(account, '/memory')
    await cache.clear()
    answer([])
    await expect(pending).rejects.toThrow('The account cache was cleared')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('a confirmed mutation supersedes an older intent GET before refreshing its data', async () => {
    let answer!: (value: Response) => void
    const fetcher = vi.fn(() => Promise.resolve(json({ count: 2 })))
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { answer = resolve }))
    const cache = new ResponseCache(storage().adapter, fetcher)
    const beforeMutation = cache.read(account, '/data/cycles')
    await tick()
    cache.supersede(account, ['/data/cycles'])
    const confirmed = await cache.read(account, '/data/cycles', { mode: 'network-first' })
    answer(json({ count: 1 }))
    await expect(beforeMutation).rejects.toThrow('A newer refresh replaced this request')
    expect(confirmed.body).toEqual({ count: 2 })
    expect(cache.peek(account, '/data/cycles')).toEqual({ count: 2 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('persists a thread intent that arrives before its cycle detail and bounds thread history', async () => {
    const disk = storage(), cache = new ResponseCache(disk.adapter, vi.fn())
    cache.put(account, '/data/threads?cycleId=current', { threads: [{ id: 'reply' }] })
    await cache.settled()
    expect([...disk.rows.values()].map(row => row.path)).toContain('/data/threads?cycleId=current')
    let time = 1
    const bounded = new ResponseCache(disk.adapter, vi.fn(), () => time++)
    for (const id of ['old', 'previous', 'current']) bounded.put(account, `/data/threads?cycleId=${id}`, { threads: [] })
    await bounded.settled()
    expect([...disk.rows.values()].filter(row => row.path.startsWith('/data/threads?')).map(row => row.path).sort()).toEqual(['/data/threads?cycleId=current', '/data/threads?cycleId=previous'])
  })

})
