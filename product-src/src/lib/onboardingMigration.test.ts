import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules() })

it('durably adopts legacy chat before an unavailable history route can interrupt migration', async () => {
  vi.useFakeTimers()
  vi.resetModules()
  const saved = new Map<string, string>()
  const message = { id: 'legacy-message', role: 'agent', text: 'A saved exchange', at: 1 }
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/state')
    ? Response.json({ doc: { chat: [message], forwarded: true }, updated_at: '1' })
    : new Response(null, { status: 503 })))
  const { getOnboarding, hydrateOnboarding } = await import('./onboarding')
  await hydrateOnboarding()
  expect(getOnboarding().chat).toEqual([message])
  expect(JSON.parse(saved.get('closeout-chat-pending-v1:development')!)).toEqual([message])
  expect(JSON.parse(saved.get('closeout-onboarding-v2')!).chat).toEqual([message])
  // A reload can reconstruct both transcript and unsent rows after the network failed.
  vi.resetModules()
  expect((await import('./onboarding')).getOnboarding().chat).toEqual([message])
})
