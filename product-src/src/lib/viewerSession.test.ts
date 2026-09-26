import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anySession, currentUserEmail, ensureViewerSession, expireSession, signInWithGoogle, signOut, viewerSession } from './viewerSession'

// One sign-in across /product, /answers and /job (shared/session.js): two backends, two keys, one origin.
const KEY = 'closeout:session:v1'
const JOBS_KEY = 'job:viewer-session:v1'
const CLOSEOUT_URL = 'https://closeout-agent.fly.dev/session'
const JOBS_URL = 'https://agent-keyboard.fly.dev/sites/closeout-jobs/session'
const session = { sessionToken: 'closeout-token', exp: 2_000_000_000, email: 'dev@hypertrack.io', name: 'Dev', picture: 'https://example.com/photo.png' }
const jobs = { sessionToken: 'jobs-token', exp: 2_000_000_000, email: 'dev@hypertrack.io' }
let values: Map<string, string>

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status })
function backends(closeout: () => Promise<Response>, agentKeyboard: () => Promise<Response>) {
  const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => (url === CLOSEOUT_URL ? closeout() : url === JOBS_URL ? agentKeyboard() : Promise.reject(new Error(url))))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
function google(promptResult: 'credential' | 'skipped') {
  let callback: (response: { credential: string }) => void = () => {}
  const id = {
    initialize: vi.fn((options: { callback: typeof callback }) => { callback = options.callback }),
    prompt: vi.fn((notify: (n: { isSkippedMoment(): boolean }) => void) => {
      if (promptResult === 'credential') callback({ credential: 'google-id-token' })
      else notify({ isSkippedMoment: () => true })
    }),
    cancel: vi.fn(),
    disableAutoSelect: vi.fn(),
  }
  vi.stubGlobal('window', { __GOOGLE_CLIENT_ID: 'client-id', google: { accounts: { id } }, location: { reload: vi.fn() } })
  return id
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(1_900_000_000_000)
  values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Closeout sessions', () => {
  it('reads its own session and sees a job session as signed in elsewhere', async () => {
    values.set(KEY, JSON.stringify(session))
    expect(viewerSession()).toEqual(session)
    expect(await currentUserEmail()).toBe(session.email)
    values.delete(KEY)
    values.set(JOBS_KEY, JSON.stringify(jobs))
    expect(viewerSession()).toBeNull()
    expect(anySession()).toEqual(jobs)
  })

  it('exchanges one Google credential with both backends and stores both keys', async () => {
    const fetcher = backends(async () => reply(200, { ...session, unused: 'not persisted' }), async () => reply(200, jobs))
    const result = await signInWithGoogle('google-id-token')
    expect(result).toEqual({ session, status: 200 })
    expect(fetcher.mock.calls.map(([url]) => url).sort()).toEqual([JOBS_URL, CLOSEOUT_URL].sort())
    for (const [, init] of fetcher.mock.calls) expect(JSON.parse(init?.body as string)).toEqual({ idToken: 'google-id-token' })
    expect(JSON.parse(values.get(KEY)!)).toEqual(session)
    expect(JSON.parse(values.get(JOBS_KEY)!)).toEqual(jobs)
  })

  it('keeps the Closeout session when Agent Keyboard is down', async () => {
    backends(async () => reply(200, session), async () => { throw new Error('offline') })
    expect((await signInWithGoogle('google-id-token')).session).toEqual(session)
    expect(values.has(JOBS_KEY)).toBe(false)
  })

  it('reports invite-only but still signs into /answers and /job', async () => {
    backends(async () => reply(403, { error: 'invite_only' }), async () => reply(200, jobs))
    expect(await signInWithGoogle('google-id-token')).toEqual({ session: null, status: 403 })
    expect(values.has(KEY)).toBe(false)
    expect(JSON.parse(values.get(JOBS_KEY)!)).toEqual(jobs)
  })

  it.each([
    { ...session, exp: 1_900_000_000 },
    { ...session, exp: '2000000000' },
    { ...session, sessionToken: '' },
    { ...session, email: null },
    null,
  ])('rejects expired or malformed session data: %j', async (invalid) => {
    values.set(KEY, JSON.stringify(invalid))
    values.set(JOBS_KEY, JSON.stringify(invalid))
    expect(viewerSession()).toBeNull()
    expect(anySession()).toBeNull()
    backends(async () => reply(200, invalid), async () => reply(200, invalid))
    expect((await signInWithGoogle('google-id-token')).session).toBeNull()
  })

  it('returns no session if storage is corrupt or unavailable', () => {
    values.set(KEY, '{')
    expect(viewerSession()).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Disabled') } })
    expect(viewerSession()).toBeNull()
    expect(anySession()).toBeNull()
  })

  it('mints its own session with a silent One Tap when only the job session exists', async () => {
    values.set(JOBS_KEY, JSON.stringify(jobs))
    const id = google('credential')
    backends(async () => reply(200, session), async () => reply(200, { ...jobs, sessionToken: 'jobs-token-2' }))
    expect(await ensureViewerSession()).toEqual(session)
    expect(id.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'client-id', auto_select: true }))
    expect(JSON.parse(values.get(KEY)!)).toEqual(session)
    expect(JSON.parse(values.get(JOBS_KEY)!).sessionToken).toBe('jobs-token-2')
  })

  it('falls back to the sign-in page when One Tap is skipped, and never prompts a signed-out visitor', async () => {
    values.set(JOBS_KEY, JSON.stringify(jobs))
    const id = google('skipped')
    const fetcher = backends(async () => reply(200, session), async () => reply(200, jobs))
    expect(await ensureViewerSession()).toBeNull()
    values.clear()
    expect(await ensureViewerSession()).toBeNull()
    expect(id.prompt).toHaveBeenCalledOnce()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not prompt when its own session is already there', async () => {
    values.set(KEY, JSON.stringify(session))
    const id = google('credential')
    expect(await ensureViewerSession()).toEqual(session)
    expect(id.prompt).not.toHaveBeenCalled()
  })

  it('signs out of every page: clears both keys, disables Google auto select and reloads', async () => {
    values.set(KEY, JSON.stringify(session))
    values.set(JOBS_KEY, JSON.stringify(jobs))
    values.set('closeout-onboarding-v2', 'kept')
    const id = google('credential')
    await signOut()
    expect(values.has(KEY)).toBe(false)
    expect(values.has(JOBS_KEY)).toBe(false)
    expect(values.get('closeout-onboarding-v2')).toBe('kept')
    expect(id.disableAutoSelect).toHaveBeenCalledOnce()
    expect(window.location.reload).toHaveBeenCalledOnce()
  })

  it('reloads on sign-out when Google is not loaded', async () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    await signOut()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('on a 401 drops only its own session so the reload can re-mint it', () => {
    values.set(KEY, JSON.stringify(session))
    values.set(JOBS_KEY, JSON.stringify(jobs))
    const id = google('credential')
    expireSession()
    expect(values.has(KEY)).toBe(false)
    expect(JSON.parse(values.get(JOBS_KEY)!)).toEqual(jobs)
    expect(id.disableAutoSelect).not.toHaveBeenCalled()
    expect(window.location.reload).toHaveBeenCalledOnce()
  })
})
