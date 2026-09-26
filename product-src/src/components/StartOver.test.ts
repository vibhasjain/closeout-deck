import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({ email: 'dev@hypertrack.io' as string | null }))
vi.mock('@/lib/viewerSession', async (original) => ({ ...await original<typeof import('@/lib/viewerSession')>(),
  viewerSession: () => session.email ? { sessionToken: 'token', exp: 2_000_000_000, email: session.email, name: '', picture: '' } : null }))

const EMAIL = 'dev@hypertrack.io'
const ACCOUNT_KEYS = ['closeout-onboarding-v2', 'closeout-onboarding-owner', `closeout-onboarding-pending-v1:${EMAIL}`, `closeout-onboarding-base-v1:${EMAIL}`,
  `closeout-chat-pending-v1:${EMAIL}`, `closeout:live-call:v1:${EMAIL}`]
// The sign-in and other accounts' keys stay.
const KEPT = ['closeout:session:v1', 'job:viewer-session:v1', 'closeout-onboarding-pending-v1:else@hypertrack.io']
let saved: Map<string, string>, assign: ReturnType<typeof vi.fn>, reset: ReturnType<typeof vi.fn>

function backend(status: number) {
  reset = vi.fn(async (_url: string, init?: RequestInit) => { void init; return Response.json(status === 200 ? { ok: true } : { error: 'x' }, { status }) })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => url.endsWith('/account/reset') ? reset(url, init)
    : url.endsWith('/state') ? Response.json({ doc: { setupStep: 'profile' }, updated_at: '2026-09-25T00:00:00Z' }) : new Response(null, { status: 404 })))
}
beforeEach(() => {
  vi.resetModules()
  session.email = EMAIL
  saved = new Map([...ACCOUNT_KEYS, ...KEPT].map(key => [key, '{}']))
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) })
  assign = vi.fn()
  vi.stubGlobal('window', { location: { assign } })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('Start over', () => {
  it('shows only for HyperTrack emails, with outline buttons', async () => {
    const { StartOver } = await import('./StartOver')
    const html = renderToStaticMarkup(createElement(StartOver))
    expect(html).toContain('Wipes your onboarding, time entries, pay runs, decisions, chat, calls and what the Closeout Agent knows, then starts onboarding from scratch. Only on HyperTrack accounts.')
    expect(html).toMatch(/<button type="button" class="btn">Start over<\/button>/)
    expect(html).not.toContain('primary')
    for (const email of ['ops@acme.com', 'dev@hypertrack.io.evil.com', null]) {
      session.email = email
      expect(renderToStaticMarkup(createElement(StartOver)), String(email)).toBe('')
    }
    const { isInternal } = await import('@/lib/startOver')
    expect([isInternal('Dev@HyperTrack.io'), isInternal('hypertrack.io@acme.com'), isInternal('')]).toEqual([true, false, false])
  })

  it('needs the typed confirm before it calls the server', async () => {
    backend(200)
    const { confirmed, startOver } = await import('@/lib/startOver')
    expect([confirmed('start over'), confirmed('  Start Over '), confirmed('start'), confirmed('startover'), confirmed('')]).toEqual([true, true, false, false, false])
    expect(await startOver('start')).toBe('failed')
    expect(reset).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('on success clears this account\'s local keys, keeps the sign-in, and reloads into onboarding', async () => {
    backend(200)
    const { startOver } = await import('@/lib/startOver')
    expect(await startOver('Start over')).toBe('ok')
    expect(reset).toHaveBeenCalledOnce()
    expect(JSON.parse(String(reset.mock.calls[0][1]?.body))).toEqual({ confirm: 'start over' })
    expect([...saved.keys()].sort()).toEqual([...KEPT].sort())
    expect(assign).toHaveBeenCalledWith('/product/')
  })

  it('opens straight into the typed confirm when an account menu hosts it, with the wipe disabled until typed', async () => {
    const { StartOver } = await import('./StartOver')
    const html = renderToStaticMarkup(createElement(StartOver, { onClose() {} }))
    expect(html).toContain('Wipes your onboarding')
    expect(html).toContain('Type “start over” to confirm')
    expect(html).toMatch(/<button type="submit" disabled="" class="btn">Wipe and start over<\/button>/)
    expect(html).toMatch(/<button type="button" class="btn">Cancel<\/button>/)
    expect(html).not.toContain('primary')
    session.email = 'ops@acme.com'
    expect(renderToStaticMarkup(createElement(StartOver, { onClose() {} }))).toBe('')
  })

  it('a server refusal hides Start over everywhere until the next page load', async () => {
    backend(403)
    const { startOver, startOverAllowed } = await import('@/lib/startOver')
    const { StartOver } = await import('./StartOver')
    expect(startOverAllowed()).toBe(true)
    expect(await startOver('start over')).toBe('not_internal')
    expect(startOverAllowed()).toBe(false)
    expect(renderToStaticMarkup(createElement(StartOver))).toBe('')
  })

  it('keeps everything and stays put on busy, refusal or failure', async () => {
    for (const [status, result] of [[409, 'busy'], [403, 'not_internal'], [500, 'failed']] as const) {
      vi.resetModules()
      backend(status)
      const { startOver } = await import('@/lib/startOver')
      expect(await startOver('start over')).toBe(result)
      expect([...saved.keys()]).toEqual(expect.arrayContaining([...ACCOUNT_KEYS, ...KEPT]))
      expect(assign).not.toHaveBeenCalled()
    }
  })
})
