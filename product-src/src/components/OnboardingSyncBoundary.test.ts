import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingSyncBoundary } from './OnboardingSyncBoundary'
import type { SyncStatus } from '@/lib/onboardingSync'
const status = vi.hoisted(() => ({ value: { ready: false, loading: false, saving: false, error: null } as SyncStatus }))
vi.mock('@/lib/onboarding', () => ({ hydrateOnboarding: vi.fn(), flushOnboarding: vi.fn(), useOnboardingSyncStatus: () => status.value }))
const render = () => renderToStaticMarkup(createElement(OnboardingSyncBoundary, null, createElement('input', { placeholder: 'Editable profile' })))
describe('canonical state hydration boundary', () => {
  it('does not offer editable defaults until the server profile is loaded', () => {
    status.value = { ready: false, loading: true, saving: false, error: null }
    expect(render()).toContain('data-skeleton="profile"')
    expect(render()).not.toContain('Editable profile')
  })
  it('shows a retry when hydration fails and retains editable content after a save failure', () => {
    status.value = { ready: false, loading: false, saving: false, error: 'Read failed' }
    expect(render()).toContain('Read failed')
    expect(render()).toContain('Retry')
    expect(render()).not.toContain('Editable profile')
    status.value = { ready: true, loading: false, saving: false, error: 'Save failed' }
    expect(render()).toContain('Save failed')
    expect(render()).toContain('Editable profile')
  })
})
