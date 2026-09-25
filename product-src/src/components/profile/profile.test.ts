import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import { ProfileCard } from './ProfileCard'
import { ProfileModal } from './ProfileModal'
import { RulebookModal } from './RulebookModal'
import { NeverContactInput } from './NeverContactInput'

const store = vi.hoisted(() => ({ state: null as Onboarding | null }))
vi.mock('@/lib/onboarding', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/onboarding')>()
  return { ...original, useOnboarding: () => [store.state ?? original.DEFAULTS, vi.fn()] }
})

beforeEach(() => { store.state = structuredClone(DEFAULTS) })

describe('Payroll profile surfaces', () => {
  it('does not present calendar and authority defaults as learned answers', () => {
    const markup = renderToStaticMarkup(createElement(ProfileCard))
    expect(markup.match(/>Not Yet</g)).toHaveLength(7)
    expect(markup).not.toContain('$100')
    expect(markup).not.toContain('paid Friday')
    const merelyCovered = renderToStaticMarkup(createElement(ProfileCard, { state: { ...DEFAULTS, covered: ['authority'] } }))
    expect(merelyCovered).not.toContain('$100')
  })

  it('renders firm facts, source actions and structured profile values live', () => {
    const state: Onboarding = { ...DEFAULTS, firm: { name: 'Pacific Cold Storage', summary: '', states: ['CA', 'TX'], verticals: ['Light industrial'], clientTypes: [], size: '', staffing: true, icon: 'https://example.com/apple-touch-icon.png' },
      sources: [{ set: 1, kind: 'email', label: 'Payroll inbox' }], profile: { clientHours: { system: 'Fieldglass', how: 'Approved export' } }, covered: ['calendar', 'authority'], authorityConfigured: true }
    const markup = renderToStaticMarkup(createElement(ProfileCard, { state }))
    expect(markup).toContain('Pacific Cold Storage')
    expect(markup).toContain('apple-touch-icon.png')
    expect(markup).toContain('Payroll inbox')
    expect(markup).toContain('system: Fieldglass')
    expect(markup).toContain('paid Friday')
    expect(markup).toContain('$100 per entry')
  })

  it('gives each modal exactly one primary action in every section', () => {
    const surfaces = [createElement(ProfileModal, { onClose() {} }), ...(['states', 'contracts', 'authority', 'refinements', 'never-contact'] as const).map((initialSection) => createElement(RulebookModal, { initialSection, onClose() {} }))]
    for (const surface of surfaces) {
      const markup = renderToStaticMarkup(surface)
      expect(markup.match(/class="btn primary"/g)).toHaveLength(1)
      expect(markup).toContain('>Done</button>')
    }
  })

  it('shows the actual engine rules only for the firm jurisdictions plus federal', () => {
    store.state!.firm = { name: 'Texas firm', summary: '', states: ['TX'], verticals: [], clientTypes: [], size: '', staffing: true }
    const texas = renderToStaticMarkup(createElement(RulebookModal, { onClose() {} }))
    expect(texas).toContain('FLSA')
    expect(texas).not.toContain('Labor Code §510')
    store.state!.firm.states = ['CA']
    const california = renderToStaticMarkup(createElement(RulebookModal, { onClose() {} }))
    expect(california).toContain('Labor Code §510')
  })

  it('prefills exclusions and makes each name removable', () => {
    const markup = renderToStaticMarkup(createElement(NeverContactInput, { value: ['Alex at Pacific'], onChange() {} }))
    expect(markup).toContain('Remove Alex at Pacific')
    expect(markup).toContain('Add another name…')
    expect(markup).not.toContain('btn primary')
  })
})
