import { Children, isValidElement, type EffectCallback, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PayCycleForm } from '@/components/PayCycles'
import { CycleFields } from '@/components/PayrollCalendar'
import { TopNav } from '@/components/shell/TopNav'
import { GettingStarted } from '@/components/shell/GettingStarted'
import { PayRuns } from '@/components/shell/PayRuns'
import { PaintBoundary } from '@/components/shell/PaintBoundary'
import { Settings } from '@/pages/Settings'
import { recentCycles } from '@/lib/cycles'
import { intakeHref } from '@/lib/intake'
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
vi.mock('@/lib/chat', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/chat')>(), stream: vi.fn() }))

type ElementProps = {
  children?: ReactNode
  right?: ReactNode
  className?: string | ((state: { isActive: boolean }) => string)
  to?: string
  disabled?: boolean
  inert?: boolean
  tabIndex?: number
  onClick?: () => void
  onSubmit?: (event: { preventDefault(): void }) => void
  onDone?: () => void
  text?: string
  'aria-label'?: string
  'aria-disabled'?: boolean
  'aria-expanded'?: boolean
  'aria-hidden'?: boolean | 'true' | 'false'
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

function openAccount(render: () => ReactNode) {
  button(render(), 'Account menu')!.props.onClick!()
  return render()
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
    // Settings paints its frame first; exercise the real content after that boundary resolves.
    const renderSettings = mount(() => {
      const frame = Settings() as ReactElement<{ children: ReactElement }>
      expect(frame.type).toBe(PaintBoundary)
      const content = frame.props.children
      return (content.type as () => ReactNode)()
    })
    const reopen = button(renderSettings(), 'Onboarding')
    expect(reopen).toBeDefined()
    reopen!.props.onClick!()
    expect(router.navigate).toHaveBeenCalledWith('/setup/agent')
    expect(store.update).not.toHaveBeenCalled()
    expect(getOnboarding()).toBe(before)
    expect(getOnboarding().forwarded).toBe(true)
  })

  it.each([true, false])('disables setup navigation only for an unfinished account (forwarded %s)', (forwarded) => {
    updateOnboarding({ forwarded })
    const render = mount(TopNav)
    const tree = render()
    for (const to of ['/payroll', '/rules']) {
      const tab = elements(tree).find(({ props }) => props.to === to)
      expect(tab).toBeDefined()
      expect(Boolean(tab!.props['aria-disabled'])).toBe(!forwarded)
      expect(tab!.props.tabIndex).toBe(forwarded ? undefined : -1)
    }
    expect(button(tree, 'Settings')).toBeDefined()
    expect(button(tree, 'Settings')!.props.disabled).toBe(!forwarded)
    // Logging out is never locked, even mid-setup.
    expect(button(openAccount(render), 'Log out')!.props.disabled).toBe(false)
  })

  it.each([['step=intake', 'Timesheets'], ['cycle=2026-09-20&step=review', 'Payroll'], ['', 'Payroll']])('D19: /payroll?%s highlights exactly one nav item (%s)', (query, current) => {
    router.pathname = '/payroll'
    router.params = new URLSearchParams(query)
    const tree = mount(TopNav)()
    const className = (props: ElementProps) => (typeof props.className === 'function' ? (props.className as (state: { isActive: boolean }) => string)({ isActive: true }) : props.className ?? '')
    const active = elements(tree).filter(({ props }) => className(props).split(' ').includes('sidebar-nav-item') && className(props).split(' ').includes('active'))
    expect(active.map(({ props }) => props['aria-label'])).toEqual([current])
  })

  it('keeps navigation available outside setup', () => {
    updateOnboarding({ forwarded: false })
    router.pathname = '/settings'
    const render = mount(TopNav)
    const tree = render()
    expect(elements(tree).filter(({ props }) => props.to).every(({ props }) => !props['aria-disabled'])).toBe(true)
    expect(button(tree, 'Settings')!.props.disabled).toBe(false)
    expect(button(openAccount(render), 'Log out')!.props.disabled).toBe(false)
  })

  it('lets a returning user open Settings with the agent context and see Log out', () => {
    router.params = new URLSearchParams('step=2&agent=1')
    const render = mount(TopNav)
    const tree = render()
    button(tree, 'Settings')!.props.onClick!()
    expect(router.navigate).toHaveBeenCalledWith('/settings?agent=1')
    expect(button(tree, 'Agent')).toBeUndefined()
    expect(router.params.get('agent')).toBe('1')
    expect(router.params.get('step')).toBe('2')
    expect(button(openAccount(render), 'Log out')).toBeDefined()
    expect(store.update).not.toHaveBeenCalled()
  })

  it('reopens onboarding from the account menu without changing saved answers', () => {
    router.pathname = '/payroll'
    const before = getOnboarding()
    const tree = openAccount(mount(TopNav))
    button(tree, 'Onboarding')!.props.onClick!()
    expect(router.navigate).toHaveBeenCalledWith('/setup/agent')
    expect(store.update).not.toHaveBeenCalled()
    expect(getOnboarding()).toBe(before)
  })

  it('persists sidebar collapse and keeps the sidebar children out of the plain function harness', () => {
    router.pathname = '/payroll'
    const render = mount(TopNav)
    const tree = render()
    expect(elements(tree).some((element) => element.type === PayRuns)).toBe(true)
    expect(elements(tree).some((element) => element.type === GettingStarted)).toBe(true)
    button(tree, 'Collapse sidebar')!.props.onClick!()
    expect(getOnboarding().sidebar).toBe('rail')
    button(render(), 'Expand sidebar')!.props.onClick!()
    expect(getOnboarding().sidebar).toBe('full')
    expect(store.update.mock.calls).toEqual([[{ sidebar: 'rail' }], [{ sidebar: 'full' }]])
  })

  it('links Timesheets to the current pending cycle intake and preserves the agent drawer', () => {
    router.pathname = '/payroll'
    router.params = new URLSearchParams('agent=1')
    const pending = recentCycles(getOnboarding(), 2)[1]
    const tree = mount(TopNav)()
    const link = elements(tree).find(({ props }) => props['aria-label'] === 'Timesheets')!
    expect(link.props.to).toBe(`${intakeHref(pending.id)}&agent=1`)
    expect(link.props['aria-disabled']).toBeUndefined()
  })

  it('shows the signed-in name, initial, and email in the account row', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ sessionToken: 'test-token', exp: Date.now() / 1000 + 3600, email: 'morgan@example.com', name: 'Morgan Lee' }))
    const tree = mount(TopNav)()
    expect(label(button(tree, 'Account menu'))).toBe('MMorgan Leemorgan@example.com')
  })

  it('opens and closes the narrow sidebar while keeping its navigation mounted', () => {
    router.pathname = '/payroll'
    const render = mount(() => TopNav({ wide: false }))
    const before = render()
    expect(button(before, 'Open sidebar')!.props['aria-expanded']).toBe(false)
    button(before, 'Open sidebar')!.props.onClick!()
    expect(button(render(), 'Open sidebar')!.props['aria-expanded']).toBe(true)
    expect(elements(render()).some((element) => element.type === PayRuns)).toBe(true)
    button(render(), 'Close sidebar')!.props.onClick!()
    expect(button(render(), 'Open sidebar')!.props['aria-expanded']).toBe(false)
  })

  it('forgets an open mobile sidebar after docking and returning to mobile', () => {
    router.pathname = '/payroll'
    let wide = false
    const render = mount(() => TopNav({ wide }))
    button(render(), 'Open sidebar')!.props.onClick!()
    expect(button(render(), 'Open sidebar')!.props['aria-expanded']).toBe(true)
    wide = true
    expect(button(render(), 'Open sidebar')!.props['aria-expanded']).toBe(false)
    wide = false
    const returned = render()
    expect(button(returned, 'Open sidebar')!.props['aria-expanded']).toBe(false)
    // The scrim stays mounted so closing can fade. The closed drawer must remain inert.
    const scrim = elements(returned).find(({ props }) => props.className === 'sidebar-scrim')
    expect(scrim?.props['aria-hidden']).toBe('true')
    expect(elements(returned).some(({ props }) => typeof props.className === 'string' && props.className.split(' ').includes('sidebar-open'))).toBe(false)
    expect(elements(returned).find(({ props }) => props.className === 'sidebar-surface')?.props.inert).toBe(true)
    button(returned, 'Open sidebar')!.props.onClick!()
    expect(button(render(), 'Open sidebar')!.props['aria-expanded']).toBe(true)
  })

})
