import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ASK_FIRST, DEFAULTS, type Onboarding } from '@/lib/onboarding'
import { ProfileCard } from './ProfileCard'
import { ProfileModal } from './ProfileModal'
import { AuthorityEditor, RulebookModal } from './RulebookModal'
import { NeverContactInput } from './NeverContactInput'

const store = vi.hoisted(() => ({ state: null as Onboarding | null, update: vi.fn() }))
vi.mock('@/lib/onboarding', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/onboarding')>()
  return { ...original, getOnboarding: () => store.state ?? original.DEFAULTS, useOnboarding: () => [store.state ?? original.DEFAULTS, store.update] }
})

beforeEach(() => { store.state = structuredClone(DEFAULTS); store.update.mockReset(); store.update.mockImplementation((patch: Partial<Onboarding>) => { store.state = { ...store.state!, ...patch } }) })

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
    const state: Onboarding = { ...DEFAULTS, firm: { name: 'Summit Staffing', domain: 'example.com', summary: '', states: ['CA', 'TX'], verticals: ['Light industrial'], clientTypes: [], size: '', staffing: true, icon: 'https://example.com/apple-touch-icon.png' },
      sources: [{ set: 1, kind: 'email', label: 'Payroll inbox' }], profile: { clientHours: { system: 'Fieldglass', how: 'Approved export' } }, covered: ['calendar', 'authority'], authorityConfigured: true }
    const markup = renderToStaticMarkup(createElement(ProfileCard, { state }))
    expect(markup).toContain('Summit Staffing')
    expect(markup).toContain('apple-touch-icon.png')
    expect(markup).toContain('Payroll inbox')
    expect(markup).toContain('Fieldglass · Approved export')
    expect(markup).not.toMatch(/(?:system|how): /)
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


type ElementProps = { children?: ReactNode; 'aria-label'?: string; onClick?(): void; onChange?(event: { target: { value: string; checked: boolean } }): void }
const elements = (tree: ReactNode): ReactElement<ElementProps>[] => Children.toArray(tree).flatMap((node) => isValidElement<ElementProps>(node) ? [node, ...elements(node.props.children)] : [])

describe('Rulebook consent and compact preview', () => {
  it('owner decision: an empty or $0 weekly cap is saved as no cap, never $0', () => {
    const cap = () => elements(AuthorityEditor()).find(({ props }) => props['aria-label'] === 'Weekly cap in dollars')!
    for (const value of ['', '0']) {
      cap().props.onChange!({ target: { value, checked: false } })
      expect(store.update).toHaveBeenLastCalledWith({ authority: { ...DEFAULTS.authority, weeklyCap: null } })
    }
  })
  it('weekly cap, decided: the Rulebook offers the suggested cap as optional, and an unset cap shows no figure', () => {
    store.state = { ...store.state!, authorityConfigured: true, authority: { ...DEFAULTS.authority, weeklyCap: null }, authoritySuggestion: { weeklyCap: 1000 } }
    const html = renderToStaticMarkup(AuthorityEditor())
    expect(html).toContain('A weekly cap of $1,000 (optional)')
    expect(html).toMatch(/aria-label="Weekly cap in dollars" placeholder="No weekly cap"[^>]*value=""/)
  })
  it('keeps all permission defaults as suggestions when editing just the weekly cap', () => {
    const tree = AuthorityEditor()
    const cap = elements(tree).find(({ props }) => props['aria-label'] === 'Weekly cap in dollars')!
    cap.props.onChange!({ target: { value: '500', checked: false } })
    expect(store.update).toHaveBeenLastCalledWith({ authority: { ...DEFAULTS.authority, weeklyCap: 500 } })
    expect(store.state!.authorityConfigured).toBe(false)
    expect(store.state!.covered).not.toContain('authority')
    const accept = elements(AuthorityEditor()).find(({ props }) => props.children === 'Accept these settings')!
    accept.props.onClick!()
    expect(store.state).toMatchObject({ authorityConfigured: true, authority: { weeklyCap: 500 } })
    expect(store.state!.covered).toContain('authority')
  })
  it('accepts only the named proposal when authority has never been configured', () => {
    store.state!.authoritySuggestion = { textWorkers: true }
    const accept = elements(AuthorityEditor()).find(({ props }) => props.children === 'Accept suggested changes')!
    accept.props.onClick!()
    expect(store.state!.authority).toEqual({ ...ASK_FIRST, textWorkers: true })
    expect(store.state!.authorityConfigured).toBe(true)
    expect(store.state!.authoritySuggestion).toBeNull()
  })
  it('renders every Rulebook section together and names each completeness mark', () => {
    store.state!.authorityConfigured = true
    const html = renderToStaticMarkup(createElement(RulebookModal, { initialSection: 'authority', onClose() {} }))
    expect(html.match(/class="rulebook-section"/g)).toHaveLength(5)
    expect(html).toContain('aria-label="What I fix on my own: Complete"')
    expect(html).toContain('aria-label="Clients and contracts: Not Yet"')
    expect(html).toContain('id="rulebook-states"')
    expect(html).toContain('id="rulebook-never-contact"')
  })
  it('labels the sample agency and retains full structured detail only in the editor', () => {
    store.state!.firm = { name: 'Summit Staffing', domain: 'sample', summary: 'Clients: Pacific Cold Storage and Lonestar Packaging', states: ['CA', 'TX'], verticals: [], clientTypes: [], size: '', staffing: true }
    store.state!.profile.workerHours = { lag: 'Monday morning', access: 'Forward the site supervisor emails to the payroll inbox. '.repeat(5) }
    const card = renderToStaticMarkup(createElement(ProfileCard))
    expect(card).toContain('Summit Staffing')
    expect(card).toContain('>Sample</span>')
    expect(card).not.toContain('lag:')
    expect(card).not.toContain('access:')
    expect(card).not.toContain(store.state!.profile.workerHours.access)
    expect(renderToStaticMarkup(createElement(ProfileModal, { onClose() {} }))).toContain(store.state!.profile.workerHours.access)
  })
  it('drops external image URLs even from stored profiles', () => {
    store.state!.firm = { name: 'Example', domain: 'example.com', icon: 'https://evil.tld/payroll.png', summary: '', states: [], verticals: [], clientTypes: [], size: '', staffing: true }
    expect(renderToStaticMarkup(createElement(ProfileCard))).not.toContain('evil.tld')
  })
})
