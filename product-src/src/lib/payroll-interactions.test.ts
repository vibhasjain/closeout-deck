import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { money } from '@/bench/engine.js'
import { ClusterList } from '@/components/ClusterList'
import { CycleKpis } from '@/components/CycleKpis'
import { Intake } from '@/components/Intake'
import { PayrollSummary } from '@/components/PayrollSummary'
import { ShiftDetail } from '@/components/ShiftDetail'
import { ShiftTable } from '@/components/ShiftTable'
import { StatRow } from '@/components/StatRow'
import { Btn } from '@/components/ui'
import { shortDate } from '@/lib/cycles'
import { buildCycles, cycleStats, kinds } from '@/lib/desk'
import { cycleIntake } from '@/lib/intake'
import { DEFAULTS, getOnboarding, updateOnboarding } from '@/lib/onboarding'
import { payTotals } from '@/lib/payroll'
import { resolutionGroups } from '@/lib/resolution'
import { Payroll } from '@/pages/Payroll'
import { ShiftPage } from '@/pages/ShiftPage'

// The suite runs in Node. Keep each directly invoked component's hook state and
// exercise its real event handlers and store writes; layout is covered by SSR.
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const router = vi.hoisted(() => ({ pathname: '/payroll', params: new URLSearchParams(), navigate: vi.fn(), setParams: vi.fn() }))
const overlay = vi.hoisted(() => ({ openModal: vi.fn(), close: vi.fn(), toast: vi.fn() }))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T>(initial: T | (() => T)) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial
    const slots = hooks.slots
    return [slots[slot] as T, (next: T | ((previous: T) => T)) => {
      slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(slots[slot] as T) : next
    }]
  },
  // Routing initialization and asynchronous send completion are outside these
  // event-handler tests; every test starts with an explicit cycle URL.
  useEffect: vi.fn(),
  useId: () => 'payroll-test-destination',
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useSearchParams: () => [router.params, router.setParams],
  useNavigate: () => router.navigate,
  useLocation: () => ({ pathname: router.pathname }),
  useParams: () => ({ shiftId: decodeURIComponent(router.pathname.split('/')[2] ?? '') }),
}))
vi.mock('@/lib/onboarding', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/onboarding')>()
  return { ...original, useOnboarding: () => [original.getOnboarding(), original.updateOnboarding] }
})
vi.mock('@/lib/desk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/desk')>()
  const store = await import('@/lib/onboarding')
  return { ...original, useDesk: () => {
    const cycles = original.buildCycles(store.getOnboarding())
    return { cycles, current: cycles[0], byId: (id: string) => cycles.find((cycle) => cycle.id === id) }
  } }
})
vi.mock('@/components/shell/Overlay', () => ({ useOverlay: () => overlay }))
vi.mock('@/components/chat/ChatPane', () => ({ useSetChatContext: vi.fn(), useSetChatSuggestions: vi.fn(), focusChatComposer: vi.fn() }))

type ElementProps = { children?: ReactNode; [key: string]: unknown }
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<ElementProps>(child) ? [child, ...elements(child.props.children)] : [])
}
function content(node: ReactNode): string {
  return Children.toArray(node).map((child) => isValidElement<ElementProps>(child) ? content(child.props.children) : String(child)).join('')
}
function component<P>(node: ReactNode, type: (props: P) => ReactNode): ReactElement<P> {
  const found = elements(node).find((element) => element.type === type)
  expect(found).toBeDefined()
  return found as ReactElement<P>
}
function button(node: ReactNode, label: string) {
  const found = elements(node).find((element) => (element.type === 'button' || element.type === Btn) && content(element.props.children) === label)
  expect(found, `button ${label}`).toBeDefined()
  return found!
}
function click(node: ReactNode, label: string) {
  const target = button(node, label)
  expect(target.props.disabled).not.toBe(true)
  expect(target.props.onClick).toBeTypeOf('function')
  ;(target.props.onClick as () => void)()
}
function mount<P>(render: (props: P) => ReactNode, props: P) {
  const slots: unknown[] = []
  return () => { hooks.cursor = 0; hooks.slots = slots; return render(props) }
}
// CycleKpis delegates to StatRow; render one level further to reach the stat buttons.
function kpiRow(props: Parameters<typeof CycleKpis>[0]) {
  const row = CycleKpis(props) as ReactElement<Parameters<typeof StatRow>[0]>
  return StatRow(row.props)
}
const pendingGroups = (cycle: ReturnType<typeof buildCycles>[number]) => resolutionGroups(cycle, getOnboarding().resolutions).filter((group) => group.state !== 'fixed')
const rowRules = (node: ReactNode) => elements(node).filter((element) => element.props.className === 'decision').map((element) => element.props['data-rule'])
function atReview() {
  const cycles = buildCycles(getOnboarding())
  const cycle = cycles[0]
  router.params = new URLSearchParams({ cycle: cycle.id, filter: 'needs-review', agent: '1' })
  const summary = component(Payroll(), PayrollSummary)
  return { cycle, cycles, groups: pendingGroups(cycle), render: mount(PayrollSummary, summary.props) }
}

const now = new Date(2026, 8, 22, 12)
beforeEach(() => {
  vi.useFakeTimers().setSystemTime(now)
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  updateOnboarding({ ...DEFAULTS })
  hooks.cursor = 0
  hooks.slots = []
  router.pathname = '/payroll'
  router.params = new URLSearchParams({ cycle: buildCycles(getOnboarding())[0].id })
  router.setParams.mockImplementation((next: URLSearchParams | ((previous: URLSearchParams) => URLSearchParams)) => {
    router.params = typeof next === 'function' ? next(router.params) : new URLSearchParams(next)
  })
  router.navigate.mockImplementation((href: string) => {
    const url = new URL(href, 'https://closeout.test')
    router.pathname = url.pathname
    router.params = url.searchParams
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Payroll review actions', () => {
  it('moves the selected stat between the payments table and the summary rows that need a person', () => {
    router.params.set('page', '2')
    router.params.set('agent', '1')
    router.params.set('q', 'Maria')
    let payroll = Payroll()
    expect(component(payroll, ShiftTable).props.shifts).toBeUndefined()
    expect(elements(payroll).some((element) => element.type === PayrollSummary)).toBe(false)
    let kpi = component(payroll, CycleKpis)
    click(kpiRow(kpi.props), `Review${kpi.props.stats.needsReview.toLocaleString()}`)
    expect(Object.fromEntries(router.params)).toEqual({ cycle: kpi.props.cycle.id, agent: '1', q: 'Maria', filter: 'needs-review' })
    payroll = Payroll()
    expect(elements(payroll).some((element) => element.type === ShiftTable)).toBe(false)
    const summary = component(payroll, PayrollSummary)
    expect(summary.props.review).toBe(true)
    expect(rowRules(mount(PayrollSummary, summary.props)())).toEqual(pendingGroups(kpi.props.cycle).map((group) => group.ruleId))
    expect([...new Set(pendingGroups(kpi.props.cycle).map((group) => group.ruleId))].sort()).toEqual(kinds(kpi.props.cycle, {}).map((kind) => kind.ruleId).sort())
    kpi = component(payroll, CycleKpis)
    expect(button(kpiRow(kpi.props), `Review${kpi.props.stats.needsReview.toLocaleString()}`).props['aria-pressed']).toBe(true)
    // The selection moves; clicking another view leaves Review and restores the table.
    click(kpiRow(kpi.props), `Discrepancies${kpi.props.stats.total.toLocaleString()}`)
    expect(Object.fromEntries(router.params)).toEqual({ cycle: kpi.props.cycle.id, agent: '1', q: 'Maria', filter: 'total' })
    expect(component(Payroll(), ShiftTable).props.shifts).toBeUndefined()
    expect(elements(Payroll()).some((element) => element.type === PayrollSummary)).toBe(false)
  })

  it.each(['Yes', 'Not now'])('approves a whole group and answers its learning prompt with %s', (answer) => {
    const { cycle, groups, render } = atReview()
    const kind = groups.find((group) => group.state === 'proposed' && group.cases.length > 1)!
    const card = elements(render()).find((element) => element.props.className === 'decision' && element.props['data-rule'] === kind.ruleId)!
    click(card, `Approve ${kind.cases.length}`)
    for (const item of kind.cases) {
      expect(getOnboarding().resolutions[cycle.id][item.shiftId]).toBe('applied')
      expect(getOnboarding().decisionTimes[`${cycle.id}:${item.shiftId}`]).toBe(now.toISOString())
    }
    let tree = render()
    expect(content(tree)).toContain('Approve these automatically from now on?')
    expect(pendingGroups(cycle).some((group) => group.ruleId === kind.ruleId)).toBe(false)
    expect(component(Payroll(), CycleKpis).props.stats).toEqual(cycleStats(cycle, getOnboarding().resolutions))
    click(tree, answer)
    tree = render()
    expect(content(tree)).not.toContain('Approve these automatically from now on?')
    expect(rowRules(tree)).toEqual(pendingGroups(cycle).map((group) => group.ruleId))
    expect(getOnboarding().customRules.filter((rule) => rule.sourceRuleId === kind.ruleId && rule.autoApply)).toHaveLength(answer === 'Yes' ? 1 : 0)
    expect(router.params.get('filter')).toBe('needs-review')
  })

  it('offers a correction to the agent under an approval group\'s cases, not in its row', () => {
    const { groups, render } = atReview()
    const group = groups.find((item) => item.state === 'proposed')!
    const row = () => elements(render()).find((element) => element.props.className === 'decision' && element.props['data-rule'] === group.ruleId)!
    expect(content(row())).not.toContain('Tell the agent')
    const toggle = elements(row()).find((element) => element.props['aria-label'] === 'Show cases')!
    ;(toggle.props.onClick as () => void)()
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback())
    click(row(), "Tell the agent what's wrong")
    expect(router.params.get('agent')).toBe('1')
    expect(router.params.get('filter')).toBe('needs-review')
  })

  it('keeps bulk review on the summary rows without an individual review action', () => {
    const { render } = atReview()
    const tree = render()
    const actions = elements(tree).filter((element) => element.type === 'button' || element.type === Btn)
    expect(actions.some((action) => /^Review \d/.test(content(action.props.children)))).toBe(false)
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('applies a directly opened time entry without advancing to another finding', () => {
    const { cycle, groups } = atReview()
    const id = groups[0].cases[0].shiftId
    router.pathname = `/payroll/${id}`
    component(ShiftPage(), ShiftDetail).props.onApply!()
    expect(getOnboarding().resolutions[cycle.id][id]).toBe('applied')
    expect(getOnboarding().decisionTimes[`${cycle.id}:${id}`]).toBe(now.toISOString())
    expect(router.pathname).toBe(`/payroll/${id}`)
    expect(router.navigate).not.toHaveBeenCalled()
    expect(router.params.has('cases')).toBe(false)
    expect(router.params.has('review')).toBe(false)
    ShiftPage().props.onClose()
    expect(router.pathname).toBe('/payroll')
    expect(router.params.get('filter')).toBe('needs-review')
    expect(component(Payroll(), PayrollSummary).props.review).toBe(true)
  })

  it('approves a summary group in bulk with the shortened label', () => {
    const cycle = buildCycles(getOnboarding())[0]
    const group = resolutionGroups(cycle, {}).find((item) => item.state === 'proposed')!
    const render = mount(PayrollSummary, { cycle })
    const card = elements(render()).find((element) => element.props.className === 'decision'
      && content(element).includes(`Approve ${group.cases.length.toLocaleString()}`))!
    expect(content(card)).not.toContain('Approve all')
    click(card, `Approve ${group.cases.length.toLocaleString()}`)
    for (const item of group.cases) {
      expect(getOnboarding().resolutions[cycle.id][item.shiftId]).toBe('applied')
      expect(getOnboarding().decisionTimes[`${cycle.id}:${item.shiftId}`]).toBe(now.toISOString())
    }
    expect(router.navigate).not.toHaveBeenCalled()
    expect(content(render())).not.toContain('Review one by one')
  })

  it('opens a summary case as its time entry and returns to the summary', () => {
    const cycle = buildCycles(getOnboarding())[0]
    const render = mount(PayrollSummary, { cycle })
    const toggle = elements(render()).find((element) => element.props['aria-label'] === 'Show cases')!
    ;(toggle.props.onClick as () => void)()
    const row = elements(render()).find((element) => element.type === 'li' && element.props.className === 'decision-case')!
    ;(row.props.onClick as (event: { target: { closest(): unknown } }) => void)({ target: { closest: () => null } })
    expect(router.pathname).toMatch(/^\/payroll\/./)
    expect(elements(ShiftPage()).some((element) => element.props.title === 'Not found')).toBe(false)
    ShiftPage().props.onClose()
    expect(router.pathname).toBe('/payroll')
    expect(router.params.get('cycle')).toBe(cycle.id)
  })
})

describe('Payroll cycle steps', () => {
  it('opens the week awaiting review on the step in the URL and clears it when the cycle or period changes', () => {
    const cycles = buildCycles(getOnboarding())
    const pending = cycles.find((cycle) => cycle.status === 'needs-review')!
    router.params = new URLSearchParams({ cycle: pending.id, step: 'intake' })
    const payroll = Payroll()
    expect(component(payroll, Intake).props.cycle.id).toBe(pending.id)
    expect(elements(payroll).some((element) => element.type === CycleKpis)).toBe(false)
    const next = button(payroll, 'Next')
    expect(next.props.title).toBe(`Go to Review · ${cycleStats(pending, {}).needsReview} flags ready. You can review before everything is in.`)
    const intake = cycleIntake(pending, getOnboarding())
    expect(component(payroll, ClusterList).props.items.find((item) => item.id === pending.id)!.sentence)
      .toBe(`${money(payTotals(pending).gross)} · pays ${shortDate(pending.payDate)} · ${intake.expected - intake.received} missing`)
    component(payroll, ClusterList).props.onSelect(cycles[0].id)
    expect(router.params.has('step')).toBe(false)
    router.params = new URLSearchParams({ cycle: pending.id, step: 'intake' })
    const completed = elements(component(Payroll(), ClusterList).props.header).find((element) => content(element.props.children) === 'Completed')
    ;(completed!.props.onClick as () => void)()
    expect(router.params.has('step')).toBe(false)
    // Hours are due Mon noon; by Tue the week awaiting review opens on Review.
    router.params = new URLSearchParams({ cycle: pending.id })
    expect(elements(Payroll()).some((element) => element.type === Intake)).toBe(false)
  })
})

