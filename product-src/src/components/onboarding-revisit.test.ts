import { Children, isValidElement, type EffectCallback, type ReactElement, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PayCycleForm } from '@/components/PayCycles'
import { CycleFields } from '@/components/PayrollCalendar'
import { TopNav } from '@/components/shell/TopNav'
import { Settings } from '@/pages/Settings'
import { Agent } from '@/pages/setup/Agent'
import { sourcesLine, STAGES, TURNS } from '@/lib/agentOnboarding'
import { buildCycles } from '@/lib/desk'
import { HANDOFF_LINE, intakeHref } from '@/lib/intake'
import { DEFAULTS, getOnboarding, updateOnboarding, type Onboarding } from '@/lib/onboarding'

// Node has no DOM renderer. Exercise the components' real event handlers and
// onboarding store; effects that need layout, focus, or animation stay outside this suite.
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as EffectCallback[] }))
const router = vi.hoisted(() => ({
  pathname: '/setup/agent',
  params: new URLSearchParams(),
  navigate: vi.fn(),
  setParams: vi.fn(),
}))
const store = vi.hoisted(() => ({ update: vi.fn() }))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T>(initial: T | (() => T)) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[slot] as T, (next: T | ((previous: T) => T)) => {
      hooks.slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[slot] as T) : next
    }]
  },
  useRef: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useMemo: <T>(factory: () => T) => factory(),
  useCallback: <T>(callback: T) => callback,
  useId: () => 'account-menu',
  useEffect: (effect: EffectCallback) => { hooks.effects.push(effect) },
  useLayoutEffect: () => {},
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useLocation: () => ({ pathname: router.pathname }),
  useNavigate: () => router.navigate,
  useSearchParams: () => [router.params, router.setParams],
}))
vi.mock('@/lib/onboarding', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/onboarding')>()
  return { ...original, useOnboarding: () => [original.getOnboarding(), store.update] }
})
vi.mock('@/lib/useCurrentEmail', () => ({ useCurrentEmail: () => null }))
vi.mock('@/components/shell/Overlay', () => ({ useOverlay: () => ({ openModal: vi.fn(), close: vi.fn(), toast: vi.fn() }) }))
vi.mock('@/components/chat/ChatPane', () => ({ useChatContext: () => ({}), useSetChatContext: () => {} }))

type ElementProps = {
  children?: ReactNode
  right?: ReactNode
  className?: string
  to?: string
  disabled?: boolean
  tabIndex?: number
  onClick?: () => void
  onSubmit?: (event: { preventDefault(): void }) => void
  onDone?: () => void
  text?: string
  'aria-label'?: string
  'aria-disabled'?: boolean
  'aria-expanded'?: boolean
}

function elements(node: ReactNode): ReactElement<ElementProps>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<ElementProps>(child)
    ? [child, ...elements(child.props.children), ...elements(child.props.right)] : [])
}

function label(node: ReactNode): string {
  return Children.toArray(node).map((child) => isValidElement<ElementProps>(child)
    ? label(child.props.children) : String(child)).join('')
}

function button(tree: ReactNode, name: string) {
  return elements(tree).find(({ props }) => props.onClick && (props['aria-label'] === name || label(props.children) === name))
}

function mount(component: () => ReactNode) {
  hooks.slots = []
  return () => {
    hooks.cursor = 0
    hooks.effects = []
    return component()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() })
  vi.stubGlobal('window', {
    setTimeout, clearTimeout, matchMedia: () => ({ matches: true }),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })
  router.pathname = '/setup/agent'
  router.params = new URLSearchParams()
  router.setParams.mockImplementation((next: (previous: URLSearchParams) => URLSearchParams) => { router.params = next(router.params) })
  updateOnboarding({ ...structuredClone(DEFAULTS), forwarded: true })
  store.update.mockImplementation((patch: Partial<Onboarding>) => updateOnboarding(patch))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('skipping onboarding', () => {
  it.each(Array.from({ length: TURNS }, (_, index) => index + 1))('completes setup from step %i and preserves saved answers', (step) => {
    updateOnboarding({ forwarded: false, payDay: 'Thursday', discovery: { ...DEFAULTS.discovery, payroll: 'ADP' } })
    router.params = new URLSearchParams(`step=${step}`)
    const before = getOnboarding()
    const header = elements(mount(Agent)()).find(({ props }) => props.className === 'convo-head')!
    const progress = elements(header).find((element) => element.type === 'span')!
    expect(label(progress.props.children)).toBe(`${step} of ${TURNS}`)
    const skip = button(header, 'Skip')!
    expect(skip.props.className?.split(' ')).toContain('ghost')
    expect(skip.props.disabled).not.toBe(true)
    router.navigate.mockImplementationOnce(() => { expect(getOnboarding().forwarded).toBe(true) })
    skip.props.onClick!()
    expect(store.update).toHaveBeenCalledExactlyOnceWith({ forwarded: true })
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith('/timesheets')
    expect(getOnboarding()).toEqual({ ...before, forwarded: true })
    expect(JSON.parse(vi.mocked(localStorage.setItem).mock.calls.at(-1)![1])).toEqual(getOnboarding())
  })

  it('keeps the demo available when skipped before any answers', () => {
    updateOnboarding(structuredClone(DEFAULTS))
    button(mount(Agent)(), 'Skip')!.props.onClick!()
    const cycles = buildCycles(getOnboarding())
    expect(cycles).toHaveLength(26)
    expect(cycles.every((cycle) => cycle.week.length > 0 && cycle.run.shifts.length > 0)).toBe(true)
    const nav = mount(TopNav)()
    expect(elements(nav).filter(({ props }) => props.to).every(({ props }) => !props['aria-disabled'])).toBe(true)
  })

  it('cancels an answer animation when Skip unmounts setup', () => {
    updateOnboarding({ forwarded: false })
    router.params = new URLSearchParams('step=2')
    const render = mount(Agent)
    const tree = render()
    const cleanups = hooks.effects.map((effect) => effect())
    button(tree, 'Monthly')!.props.onClick!()
    const typing = render()
    button(typing, 'Skip')!.props.onClick!()
    cleanups.forEach((cleanup) => { if (cleanup) cleanup() })
    vi.runAllTimers()
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith('/timesheets')
    expect(router.setParams).not.toHaveBeenCalled()
    expect(getOnboarding()).toMatchObject({ forwarded: true, frequency: 'Monthly' })
  })
})

describe('pay cycle form', () => {
  const submit = (tree: ReactNode) => elements(tree).find(({ props }) => props.onSubmit)!.props.onSubmit!({ preventDefault() {} })

  it.each(['', '  '])('starts at pay frequency and saves an unnamed cycle (%j)', (name) => {
    const onClose = vi.fn()
    const tree = mount(() => PayCycleForm({ id: null, name, onClose }))()
    expect(label(tree)).not.toContain("Who's on it")
    expect(elements(tree).some((element) => element.type === 'input')).toBe(false)
    const fields = elements(tree).find((element) => element.type === CycleFields) as ReactElement<Parameters<typeof CycleFields>[0]>
    expect(label(CycleFields(fields.props))).toMatch(/^Pay frequency/)
    submit(tree)
    expect(getOnboarding().cohorts).toMatchObject([{ name: 'Cycle 2', frequency: DEFAULTS.frequency }])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('uses the latest saved cycles to name a form that was already open', () => {
    const render = mount(() => PayCycleForm({ id: null, onClose: vi.fn() }))
    render()
    updateOnboarding({ cohorts: [{ id: 'cohort-cycle-2', name: 'Cycle 2', frequency: DEFAULTS.frequency,
      periodEndDay: DEFAULTS.periodEndDay, payDay: DEFAULTS.payDay, payDatesOfMonth: [...DEFAULTS.payDatesOfMonth] }] })
    submit(render())
    expect(getOnboarding().cohorts.map((cycle) => cycle.name)).toEqual(['Cycle 2', 'Cycle 3'])
  })

  it('preserves supplied and edited cycle names', () => {
    submit(mount(() => PayCycleForm({ id: null, name: 'Clerical', onClose: vi.fn() }))())
    const saved = getOnboarding().cohorts[0]
    const render = mount(() => PayCycleForm({ id: saved.id, onClose: vi.fn() }))
    const fields = elements(render()).find((element) => element.type === CycleFields) as ReactElement<Parameters<typeof CycleFields>[0]>
    fields.props.onChange({ frequency: 'Monthly' })
    submit(render())
    expect(getOnboarding().cohorts).toEqual([{ ...saved, frequency: 'Monthly' }])
  })
})

describe('revisiting onboarding', () => {
  it('reopens setup from Settings without changing completion or saved answers', () => {
    updateOnboarding({ discovery: { ...DEFAULTS.discovery, payroll: 'ADP' }, payDay: 'Thursday' })
    const before = getOnboarding()
    const reopen = button(mount(Settings)(), 'Onboarding')
    expect(reopen).toBeDefined()
    reopen!.props.onClick!()
    expect(router.navigate).toHaveBeenCalledWith('/setup/agent')
    expect(store.update).not.toHaveBeenCalled()
    expect(getOnboarding()).toBe(before)
    expect(getOnboarding().forwarded).toBe(true)
  })

  it.each([true, false])('disables setup navigation only for an unfinished account (forwarded %s)', (forwarded) => {
    updateOnboarding({ forwarded })
    const tree = mount(TopNav)()
    for (const to of ['/payroll', '/rules']) {
      const tab = elements(tree).find(({ props }) => props.to === to)
      expect(tab).toBeDefined()
      expect(Boolean(tab!.props['aria-disabled'])).toBe(!forwarded)
      expect(tab!.props.tabIndex).toBe(forwarded ? undefined : -1)
    }
    for (const name of ['Settings', 'Agent', 'Account']) {
      expect(button(tree, name)).toBeDefined()
      expect(button(tree, name)!.props.disabled).toBe(!forwarded)
    }
  })

  it('keeps navigation available outside setup', () => {
    updateOnboarding({ forwarded: false })
    router.pathname = '/settings'
    const tree = mount(TopNav)()
    expect(elements(tree).filter(({ props }) => props.to).every(({ props }) => !props['aria-disabled'])).toBe(true)
    for (const name of ['Settings', 'Agent', 'Account']) expect(button(tree, name)!.props.disabled).toBe(false)
  })

  it('lets a returning user open Settings, toggle the agent, and open Account', () => {
    router.params = new URLSearchParams('step=2&agent=1')
    const render = mount(TopNav)
    const tree = render()
    button(tree, 'Settings')!.props.onClick!()
    expect(router.navigate).toHaveBeenCalledWith('/settings?agent=1')
    button(tree, 'Agent')!.props.onClick!()
    expect(router.params.get('agent')).toBeNull()
    expect(router.params.get('step')).toBe('2')
    button(tree, 'Account')!.props.onClick!()
    expect(button(render(), 'Account')!.props['aria-expanded']).toBe(true)
    expect(store.update).not.toHaveBeenCalled()
  })

  it('offers an Exit setup button with an X in the conversation header for a finished account', () => {
    const before = getOnboarding()
    const tree = mount(Agent)()
    const header = elements(tree).find(({ props }) => props.className === 'convo-head')
    const exit = button(header, 'Exit setup')
    expect(exit).toBeDefined()
    expect(exit!.props.className?.split(' ')).toContain('ghost')
    expect(elements(exit).some((element) => element.type === X)).toBe(true)
    exit!.props.onClick!()
    expect(router.navigate).toHaveBeenCalledWith('/settings')
    expect(store.update).not.toHaveBeenCalled()
    expect(getOnboarding()).toBe(before)
  })

  it('does not offer an exit during first-time onboarding', () => {
    updateOnboarding({ forwarded: false })
    expect(button(mount(Agent)(), 'Exit setup')).toBeUndefined()
  })

  it('saves an answer changed during a revisit and retains it after exiting', () => {
    updateOnboarding({ discovery: { ...DEFAULTS.discovery, payroll: 'ADP' }, payDay: 'Thursday' })
    router.params = new URLSearchParams('step=2')
    const render = mount(Agent)
    const tree = render()
    button(tree, 'Monthly')!.props.onClick!()
    expect(store.update).toHaveBeenCalledTimes(1)
    expect(getOnboarding()).toMatchObject({
      forwarded: true,
      frequency: 'Monthly',
      payDay: 'Thursday',
      discovery: { period: 'Monthly', payroll: 'ADP' },
    })
    button(render(), 'Exit setup')!.props.onClick!()
    expect(router.navigate).toHaveBeenCalledWith('/settings')
    const saved = JSON.parse(vi.mocked(localStorage.setItem).mock.calls.at(-1)![1]) as Onboarding
    expect(saved.forwarded).toBe(true)
    expect(saved.discovery.period).toBe('Monthly')
    expect(getOnboarding().discovery.period).toBe('Monthly')
  })

  it('does not navigate back into setup when an answer animation finishes after exiting', () => {
    router.params = new URLSearchParams('step=2')
    const tree = mount(Agent)()
    const cleanups = hooks.effects.map((effect) => effect())
    button(tree, 'Monthly')!.props.onClick!()
    expect(vi.getTimerCount()).toBe(1)
    button(tree, 'Exit setup')!.props.onClick!()
    cleanups.forEach((cleanup) => { if (cleanup) cleanup() })
    vi.runAllTimers()
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith('/settings')
    expect(router.setParams).not.toHaveBeenCalled()
    expect(getOnboarding().discovery.period).toBe('Monthly')
  })

  it('asks about other pay cycles right after the calendar readback, before the time questions', () => {
    const asked = (step: number) => {
      router.params = new URLSearchParams(`step=${step}`)
      return elements(mount(Agent)()).filter(({ props }) => props.text).at(-1)!.props.text
    }
    expect(asked(3)).toMatch(/^Here's how I understand your pay calendar/)
    expect(asked(4)).toBe('Any other pay cycles?')
    expect(asked(5)).toBe('About how many worker payments go out in a typical pay period?')
    expect(asked(6)).toBe('How do workers send you their time?')
  })

  it('opens the pay cycle form on Add another, and offers That\'s all once a cycle exists', () => {
    router.params = new URLSearchParams('step=4')
    const render = mount(Agent)
    const chips = (tree: ReactNode) => elements(tree).filter(({ props }) => props.className === 'convo-chips').flatMap(({ props }) => elements(props.children).map((chip) => label(chip.props.children)))
    expect(chips(render())).toEqual(['No, just this one', 'Add another'])
    button(render(), 'Add another')!.props.onClick!()
    const open = render()
    expect(elements(open).some((element) => element.type === PayCycleForm)).toBe(true)
    expect(chips(open)).toEqual([])
    updateOnboarding({ cohorts: [{ id: 'cohort-clerical', name: 'Clerical', frequency: 'Biweekly', periodEndDay: 'Sunday', payDay: 'Friday', payDatesOfMonth: [20, 5] }] })
    hooks.slots = []
    const saved = render()
    expect(chips(saved)).toEqual(['Add another', 'That\'s all'])
    router.params = new URLSearchParams('step=5')
    button(mount(Agent)(), 'Clerical · Biweekly · paid Friday')!.props.onClick!()
    expect(router.params.get('step')).toBe('4')
  })

  it('takes Varies by client without a typed note or a main frequency, then suggests adding a cycle', () => {
    updateOnboarding({ frequency: 'Semi-monthly' })
    router.params = new URLSearchParams('step=2')
    button(mount(Agent)(), 'Varies by client')!.props.onClick!()
    expect(getOnboarding()).toMatchObject({ frequency: 'Semi-monthly', discovery: { period: 'Varies by client' } })
    expect(vi.getTimerCount()).toBe(1)
    router.params = new URLSearchParams('step=3')
    expect(elements(mount(Agent)()).filter(({ props }) => props.text).at(-1)!.props.text).toBe('Which calendar are most of your workers on?')
    router.params = new URLSearchParams('step=4')
    const first = elements(mount(Agent)()).find(({ props }) => props.className === 'convo-chips')
    expect(label(elements(first!.props.children)[0].props.children)).toBe('Add another')
  })

  it('takes an answer typed in the composer instead of asking again', () => {
    const say = (render: () => ReactNode, text: string) => {
      const input = elements(render()).find(({ props }) => props['aria-label'] === 'Ask the agent') as ReactElement<{ onChange(event: unknown): void }>
      input.props.onChange({ target: { value: text } })
      const form = elements(render()).find(({ props }) => props.className === 'convo-composer') as ReactElement<{ onSubmit(event: unknown): void }>
      form.props.onSubmit({ preventDefault() {} })
    }
    router.params = new URLSearchParams('step=2')
    say(mount(Agent), 'biweekly')
    expect(getOnboarding()).toMatchObject({ frequency: 'Biweekly', discovery: { period: 'Bi-weekly (every 2 weeks)' } })
    expect(vi.getTimerCount()).toBe(1)
    updateOnboarding({ discovery: { ...getOnboarding().discovery, workerChannels: ['Our own mobile app'] } })
    router.params = new URLSearchParams('step=6')
    say(mount(Agent), 'Bullhorn T&A and text')
    expect(getOnboarding().discovery.workerChannels).toEqual(['Bullhorn T&A', 'Text / SMS', 'Our own mobile app'])
    expect(sourcesLine(getOnboarding().discovery)).toBe('You get time from Bullhorn T&A.')
    expect(vi.getTimerCount()).toBe(2)
    router.params = new URLSearchParams('step=4')
    const render = mount(Agent)
    say(render, 'Mercy General')
    const form = elements(render()).find((element) => element.type === PayCycleForm) as ReactElement<{ name: string }>
    expect(form.props.name).toBe('Mercy General')
  })

  it('uses Show Me the Magic for the demo button and recorded reply', () => {
    router.params = new URLSearchParams(`step=${STAGES.indexOf('See it work') + 1}`)
    const render = mount(Agent)
    button(render(), 'Show Me the Magic')!.props.onClick!()
    const reply = elements(render()).find(({ props }) => props.className === 'convo-user' && label(props.children) === 'Show Me the Magic')
    expect(reply).toBeDefined()
    vi.runAllTimers()
    expect(router.params.get('step')).toBe(String(STAGES.indexOf('See it work') + 2))
  })

  it('cancels the final Payroll redirect when a returning user exits before it fires', () => {
    router.params = new URLSearchParams('step=15')
    const render = mount(Agent)
    const tree = render()
    const cleanups = hooks.effects.map((effect) => effect())
    button(tree, 'Start with the sample')!.props.onClick!()
    vi.runOnlyPendingTimers()
    const finishing = render()
    const finalMessage = elements(finishing).find(({ props }) => props.text === HANDOFF_LINE)
    expect(finalMessage?.props.onDone).toBeDefined()
    finalMessage!.props.onDone!()
    expect(vi.getTimerCount()).toBe(1)
    button(finishing, 'Exit setup')!.props.onClick!()
    cleanups.forEach((cleanup) => { if (cleanup) cleanup() })
    vi.runAllTimers()
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith('/settings')
  })

  it('hands off to Intake on the week awaiting review after one short line', () => {
    router.params = new URLSearchParams('step=15')
    const render = mount(Agent)
    button(render(), 'Start with the sample')!.props.onClick!()
    vi.runOnlyPendingTimers()
    const line = elements(render()).find(({ props }) => props.text === HANDOFF_LINE)
    line!.props.onDone!()
    vi.runAllTimers()
    const pending = buildCycles(getOnboarding()).find((cycle) => cycle.status === 'needs-review')!
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith(intakeHref(pending.id))
    expect(intakeHref(pending.id)).toBe(`/payroll?cycle=${pending.id}&step=intake`)
  })
})
