import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, type To } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULTS, useOnboarding } from '@/lib/onboarding'

// RequireAuth reads the QA bypass at import, so it must be set before the app loads.
vi.hoisted(() => { vi.stubEnv('VITE_QA_BYPASS_AUTH', '1') })
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  Navigate: ({ to }: { to: To }) => h('a', { 'data-navigate': to }),
}))
vi.mock('@/lib/onboarding', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/onboarding')>(), useOnboarding: vi.fn() }))
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => h('main', null, children) }))
vi.mock('@/pages/setup/Agent', () => ({ Agent: () => h('div', { 'data-setup-agent': true }) }))

const { AppRoutes } = await import('@/App')

function renderRoute(url: string, forwarded = false) {
  vi.mocked(useOnboarding).mockReturnValue([{ ...DEFAULTS, forwarded }, vi.fn()])
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] }, h(AppRoutes)))
}

function redirect(url: string, forwarded = false) {
  return renderRoute(url, forwarded).match(/data-navigate="([^"]*)"/)?.[1]
}

describe('setup routes', () => {
  it.each(['/setup', '/setup/calendar', '/setup/check?issue=1', '/setup/forward', '/onboarding', '/onboarding/check', '/onboarding/done'])('sends %s to the agent setup', (url) => {
    expect(redirect(url)).toBe('/setup/agent')
  })

  it('sends an unfinished account from the desk to the agent setup', () => {
    expect(redirect('/payroll')).toBe('/setup/agent')
    expect(redirect('/settings')).toBe('/setup/agent')
  })

  it.each([false, true])('allows agent setup for an account with forwarded %s', (forwarded) => {
    const html = renderRoute('/setup/agent', forwarded)
    expect(html).not.toContain('data-navigate')
    expect(html).toContain('data-setup-agent="true"')
  })
})
