import { afterEach, describe, expect, it, vi } from 'vitest'
import { authedFetch } from '@/lib/api'
import * as session from '@/lib/viewerSession'
vi.mock('@/lib/viewerSession', () => ({ viewerSession: vi.fn(() => null), signOut: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('authenticated transport', () => {
  it('preserves raw bodies and caller headers while adding the current token', async () => {
    vi.mocked(session.viewerSession).mockReturnValue({ sessionToken: 'test-session', exp: 9999999999, email: 'fixture@example.com' })
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    const body = new Blob(['raw,csv\n'])
    await authedFetch('/files', { method: 'POST', headers: [['X-Set', '2']], body })
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('/api/files')
    expect(init.body).toBe(body)
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-session')
    expect(new Headers(init.headers).get('X-Set')).toBe('2')
  })
  it('signs out on a rejected session and returns the response for the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    expect((await authedFetch('/data/cycles')).status).toBe(401)
    expect(session.signOut).toHaveBeenCalledOnce()
  })
})

describe('API base', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
  it.each([
    [true, 'https://closeout-agent.fly.dev'],
    [false, '/api'],
  ] as const)('routes PROD=%s calls to %s', async (production, base) => {
    vi.stubEnv('PROD', production)
    vi.resetModules()
    expect((await import('./api')).API_BASE).toBe(base)
  })
})
