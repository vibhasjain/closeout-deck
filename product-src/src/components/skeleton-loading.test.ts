import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Payroll } from '@/pages/Payroll'
import { Agent, WritingProfile } from '@/pages/setup/Agent'
import { SkeletonRegion } from './Skeleton'
import { PayRuns } from './shell/PayRuns'
import { OverlayProvider } from './shell/Overlay'
import { FindingsCard } from './journey/FindingsCard'
import { FormCard, SendForm, DisputeForm } from './journey/FormCard'
import { TaskCard } from './journey/TaskCard'
import { Intake } from './Intake'
import { FactQuestion } from './chat/FactQuestion'
import { QuestionScreen } from './setup/QuestionScreen'
import { cycleIntake } from '@/lib/intake'
import { Thread } from './Thread'
import { MemoryPanelContent } from './memory/MemoryPanel'
import { CallCard } from './chat/CallCard'
import { RulebookModal } from './profile/RulebookModal'
import { OnboardingSyncBoundary } from './OnboardingSyncBoundary'
import { hydrate, type CyclePayload } from '@/lib/data'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import * as desk from '@/lib/desk'
import recorded from '@/lib/fixtures/server-cycle.json'

const state = vi.hoisted(() => ({ forceBusy: false, pendingActionKey: null as string | null, profile: null as Onboarding | null }))
vi.mock('react', async original => {
  const react = await original<typeof import('react')>()
  return { ...react, useState: (initial: unknown) => react.useState(state.forceBusy && initial === false ? true : initial) }
})
vi.mock('@/lib/onboarding', async original => ({ ...await original<typeof import('@/lib/onboarding')>(),
  useOnboarding: () => [state.profile ?? DEFAULTS, vi.fn()],
  useOnboardingSyncStatus: () => ({ ready: false, loading: true, saving: false, error: null }),
}))
vi.mock('@/lib/journey', async original => ({ ...await original<typeof import('@/lib/journey')>(),
  useJourneyCycle: () => ({ cycle: undefined, row: undefined, empty: false, loading: true, error: null }),
  useJourneyThreads: () => ({ threads: [], loaded: false, loading: true, error: null }),
}))
vi.mock('@/lib/useDictation', () => ({ useDictation: () => ({ active: false, finishing: false, state: 'idle' }) }))
vi.mock('@/lib/useVoiceCall', () => ({ useVoiceCall: () => ({ snapshot: null }) }))
vi.mock('@/lib/usePendingAction', async original => {
  const actual = await original<typeof import('@/lib/usePendingAction')>()
  return { ...actual, usePendingAction: (...args: Parameters<typeof actual.usePendingAction>) => {
    const action = actual.usePendingAction(...args)
    return state.pendingActionKey === null ? action : { ...action, status: 'pending', pending: true, key: state.pendingActionKey }
  } }
})

const payload = recorded.payload as unknown as CyclePayload
const cycle = hydrate(payload, DEFAULTS)
const render = (node: ReactElement) => renderToStaticMarkup(h(MemoryRouter, { initialEntries: ['/payroll'] }, h(OverlayProvider, null, node)))
/** Ignore complete hidden subtrees, including nested reserved button labels and the screen-reader announcement. */
function visibleText(html: string) {
  const stack: boolean[] = []
  const text: string[] = []
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
  for (const [token] of html.matchAll(/<[^>]+>|[^<]+/g)) {
    if (token.startsWith('</')) { stack.pop(); continue }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)?.[1]
      if (!tag || voidTags.has(tag) || token.endsWith('/>')) continue
      const hidden = !!stack.at(-1) || /\baria-hidden="true"|\shidden(?:="[^"]*")?(?=[\s>])|\bstyle="[^"]*(?:visibility:\s*hidden|display:\s*none)|\bclass="[^"]*\bsr-only\b/.test(token)
      stack.push(hidden)
    } else if (!stack.at(-1)) text.push(token)
  }
  return text.join(' ').replace(/\s+/g, ' ').trim()
}

function assertSkeleton(html: string) {
  expect(visibleText(html)).not.toMatch(/\bloading\b|\breading your\b|\bfetching\b/i)
  expect(html).toMatch(/aria-busy="true"[^>]*data-skeleton=/)
  expect(html).toContain('class="sr-only skeleton-label">Loading</span>')
  expect(html).toMatch(/class="skeleton [^"]*" aria-hidden="true"/)
}

beforeEach(() => {
  state.forceBusy = false
  state.pendingActionKey = null
  state.profile = { ...DEFAULTS, setupStep: 'conversation' }
  vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle, loaded: false, loading: true, error: null })
})
afterEach(() => vi.restoreAllMocks())

describe('content loading is ghosted, with no visible loading copy', () => {
  const surfaces: [string, () => ReactElement][] = [
    ['Payroll', () => h(Payroll)],
    ['pay-run rail', () => h(PayRuns)],
    ['findings card', () => h(FindingsCard, { cycleId: cycle.id })],
    ...(['gaps', 'send', 'dispute', 'connect'] as const).map(form => [`${form} card`, () => h(FormCard, { form, cycleId: cycle.id })] as [string, () => ReactElement]),
    ['task card', () => h(TaskCard, { cycleId: cycle.id })],
    ['conversation', () => h(Thread, { cycle: { ...cycle, server: true } })],
    ['memory', () => h(MemoryPanelContent, { snapshot: { instincts: [], proposals: [], lastRun: null }, loading: true, error: null, refresh: async () => {}, onMakeRule: async () => {} })],
    ['Payroll profile hydration', () => h(OnboardingSyncBoundary, null, h('p', null, 'Profile'))],
    ['onboarding conversation', () => h(Agent)],
    ['profile preparation', () => h(WritingProfile, { state: DEFAULTS, onDone() {} })],
    ['export preview', () => h(SendForm, { cycle: { ...payload, batch: null, adjustments: undefined } })],
    ['dispute history', () => h(DisputeForm, { cycle: { ...payload, batch: { id: 'pending-batch' } as NonNullable<CyclePayload['batch']> } })],
  ]
  it.each(surfaces)('%s', (_name, surface) => assertSkeleton(render(surface())))
  it('retains existing memories with a skeleton while refreshing', () => {
    const html = render(h(MemoryPanelContent, { snapshot: { instincts: [{
      id: 'i_saved', kind: 'context', text: 'Travis signs off time entries', source: 'chat', status: 'active', until: null, ruleId: null, at: '2026-09-25T16:00:00.000Z',
    }], proposals: [], lastRun: null }, loading: true, error: null, refresh: async () => {}, onMakeRule: async () => {} }))
    assertSkeleton(html)
    expect(html).toContain('>Travis signs off time entries</textarea>')
  })
  it.each(['transcript', 'contracts'])('%s fetch', name => {
    state.forceBusy = true
    if (name === 'contracts') state.pendingActionKey = 'contracts'
    const html = render(name === 'transcript'
      ? h(CallCard, { card: { kind: 'call', callId: 'saved-call', seconds: 15 } })
      : h(RulebookModal, { onClose() {}, initialSection: 'contracts' }))
    assertSkeleton(html)
    if (name === 'contracts') {
      const buttons = [...html.matchAll(/<button\b[^>]*data-action-state="pending"[^>]*>[\s\S]*?<\/button>/g)]
      expect(buttons).toHaveLength(1)
      expect(visibleText(buttons[0][0])).toBe('Reading…')
      expect(buttons[0][0]).toContain('disabled=""')
    }
  })
  it.each(['time entries', 'chat files', 'setup files'])('%s upload', name => {
    state.forceBusy = true
    state.pendingActionKey = 'upload'
    const html = render(name === 'time entries' ? h(Intake, { cycle, intake: cycleIntake(cycle, DEFAULTS) })
      : name === 'chat files' ? h(FactQuestion, { card: { kind: 'question', input: 'files', topics: [] }, onAnswer() {} })
        : h(QuestionScreen, { question: 'Add your files', card: { kind: 'question', input: 'files', topics: [] }, busy: false, canBack: false, onBack() {}, onAnswer() {} }))
    assertSkeleton(html)
    {
      const buttons = [...html.matchAll(/<button\b[^>]*data-action-state="pending"[^>]*>[\s\S]*?<\/button>/g)]
      expect(buttons).toHaveLength(1)
      expect(visibleText(buttons[0][0])).toBe('Uploading…')
      expect(buttons[0][0]).toContain('disabled=""')
      expect(buttons[0][0]).toContain('aria-busy="true"')
    }
  })
  it('ignores hidden reserved labels but still rejects standalone visible Loading copy', () => {
    const skeleton = render(h(SkeletonRegion))
    const reserved = '<span style="visibility:hidden" aria-hidden="true"><span>Loading</span></span>'
    expect(visibleText(`${reserved}<button>Uploading…</button>`)).toBe('Uploading…')
    expect(() => assertSkeleton(`${skeleton}${reserved}<button>Uploading…</button>`)).not.toThrow()
    expect(() => assertSkeleton(`${skeleton}<p>Loading…</p>`)).toThrow()
  })
  it('has a bar and pill, five number tiles, five review rows and three rail rows without buttons', () => {
    const next = render(h(SkeletonRegion, { variant: 'next-step' }))
    const kpis = render(h(SkeletonRegion, { variant: 'kpis' }))
    const review = render(h(SkeletonRegion, { variant: 'review' }))
    const rail = render(h(SkeletonRegion, { variant: 'rail' }))
    expect(next).toContain('skeleton-step-line')
    expect(next).toContain('skeleton-pill')
    expect(kpis.match(/class="skeleton-kpi"/g)).toHaveLength(5)
    expect(review.match(/class="skeleton-review-row"/g)).toHaveLength(5)
    expect(review.match(/class="skeleton skeleton-amount"/g)).toHaveLength(10)
    expect(rail.match(/class="skeleton-rail-row"/g)).toHaveLength(3)
    expect(next + kpis + review + rail).not.toContain('<button')
  })
})
