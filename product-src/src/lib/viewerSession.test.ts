import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentUserEmail, saveViewerSession, signOut, viewerSession } from './viewerSession'

const KEY = 'closeout:session:v1'
const LEGACY_KEY = 'job:viewer-session:v1'
const session = { sessionToken: 'closeout-token', exp: 2_000_000_000, email: 'dev@hypertrack.io', name: 'Dev', picture: 'https://example.com/photo.png' }
let values: Map<string, string>

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
  it('stores the session under its own key and keeps the job session intact', async () => {
    values.set(LEGACY_KEY, 'old-session')
    saveViewerSession({ ...session, unused: 'not persisted' })
    expect(JSON.parse(values.get(KEY)!)).toEqual(session)
    expect(values.get(LEGACY_KEY)).toBe('old-session')
    expect(viewerSession()).toEqual(session)
    expect(await currentUserEmail()).toBe(session.email)
  })

  it('does not use a job session to sign into Closeout', async () => {
    values.set(LEGACY_KEY, JSON.stringify(session))
    expect(viewerSession()).toBeNull()
    expect(await currentUserEmail()).toBeNull()
  })

  it.each([
    { ...session, exp: 1_900_000_000 },
    { ...session, exp: '2000000000' },
    { ...session, sessionToken: '' },
    { ...session, email: null },
    { ...session, picture: false },
    null,
  ])('rejects expired or malformed session data: %j', (invalid) => {
    values.set(KEY, JSON.stringify(invalid))
    expect(viewerSession()).toBeNull()
    expect(() => saveViewerSession(invalid)).toThrow('Invalid session')
  })

  it('returns no session if storage is corrupt or unavailable', () => {
    values.set(KEY, '{')
    expect(viewerSession()).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Disabled') } })
    expect(viewerSession()).toBeNull()
  })

  it('clears only Closeout, disables Google auto select and reloads', () => {
    values.set(KEY, JSON.stringify(session))
    values.set(LEGACY_KEY, 'old-session')
    const disableAutoSelect = vi.fn()
    const reload = vi.fn()
    vi.stubGlobal('window', { google: { accounts: { id: { disableAutoSelect } } }, location: { reload } })
    signOut()
    expect(values.has(KEY)).toBe(false)
    expect(values.get(LEGACY_KEY)).toBe('old-session')
    expect(disableAutoSelect).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads on sign-out when Google is not loaded', () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    signOut()
    expect(reload).toHaveBeenCalledOnce()
  })
})
