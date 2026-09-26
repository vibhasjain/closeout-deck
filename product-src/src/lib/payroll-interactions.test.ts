import { renderToStaticMarkup } from 'react-dom/server'
import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { cycleIntake } from '@/lib/intake'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { Banknote } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { money } from '@/bench/engine.js'
import { ClusterList } from '@/components/ClusterList'
import { CycleKpis } from '@/components/CycleKpis'
import { Intake } from '@/components/Intake'
import { PayrollSummary } from '@/components/PayrollSummary'
import { ShiftDetail } from '@/components/ShiftDetail'
import { ShiftTable } from '@/components/ShiftTable'
import { StatRow } from '@/components/StatRow'
import { PayRuns } from '@/components/shell/PayRuns'
import { Btn } from '@/components/ui'
import { buildCycles, cycleStats, kinds } from '@/lib/desk'
import { DEFAULTS, getOnboarding, updateOnboarding } from '@/lib/onboarding'
import { payTotals } from '@/lib/payroll'
import { resolutionGroups } from '@/lib/resolution'
import { Payroll } from '@/pages/Payroll'
import { ShiftPage } from '@/pages/ShiftPage'
import { decide, groupId } from '@/lib/journey'
import type { FindingGroup } from '@/lib/data'
import * as desk from '@/lib/desk'
import * as data from '@/lib/data'
import type { JourneyDecision } from '@/lib/journey'

// The suite runs in Node. Keep each directly invoked component's hook state and
// exercise its real event handlers and store writes; layout is covered by SSR.
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const router = vi.hoisted(() => ({ pathname: '/payroll', params: new URLSearchParams(), navigate: vi.fn(), setParams: vi.fn() }))
const overlay = vi.hoisted(() => ({ openModal: vi.fn(), close: vi.fn(), toast: vi.fn() }))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: <T,>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
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
// These event-handler tests inspect target values; rAF interpolation has its own tests.
vi.mock('@/lib/useTweened', () => ({ useTweened: (value: number) => value }))
vi.mock('@/components/chat/ChatPane', () => ({ useSetChatContext: vi.fn(), useSetChatSuggestions: vi.fn(), focusChatComposer: vi.fn() }))
vi.mock('@/lib/journey', async (original) => ({ ...await original<typeof import('@/lib/journey')>(), decide: vi.fn(), useJourneyThreads: () => ({ threads: [] }) }))

type ElementProps = { children?: ReactNode; [key: string]: unknown }
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<ElementProps>(child) ? [child, ...elements(child.props.children)] : [])
}
function content(node: ReactNode): string {
  return Children.toArray(node).map((child) => isValidElement<ElementProps>(child) ? child.type === ActionFeedback ? content(ActionFeedback(child.props as Parameters<typeof ActionFeedback>[0])) : content(child.props.children) : String(child)).join('')
}
function component<P>(node: ReactNode, type: (props: P) => ReactNode): ReactElement<P> {
  const found = elements(node).find((element) => element.type === type)
  expect(found).toBeDefined()
  return found as ReactElement<P>
}
function button(node: ReactNode, label: string) {
  const found = elements(node).find((element) => (element.type === 'button' || element.type === Btn || element.type === ActionButton) && content(element.props.children) === label)
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
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Payroll review actions', () => {
  it('keeps a stat selected when it is picked again and clears list filters on every pick', () => {
    const cycle = buildCycles(getOnboarding())[0]
    const stale = { view: 'list', q: 'Maria', page: '2', flag: 'CS-16H', review: 'done', cases: 'one,two' }
    router.params = new URLSearchParams({ cycle: cycle.id, step: 'review', agent: '1', filter: 'needs-review', ...stale })
    let kpi = component(Payroll(), CycleKpis)
    click(kpiRow(kpi.props), `Review${kpi.props.stats.needsReview.toLocaleString()}`)
    expect(Object.fromEntries(router.params)).toEqual({ cycle: cycle.id, step: 'review', agent: '1', filter: 'needs-review' })
    expect(component(Payroll(), PayrollSummary).props.review).toBe(true)
    // Leaving Review for Discrepancies returns to the plain summary.
    for (const [key, value] of Object.entries(stale)) router.params.set(key, value)
    kpi = component(Payroll(), CycleKpis)
    click(kpiRow(kpi.props), `Discrepancies${kpi.props.stats.total.toLocaleString()}`)
    expect(Object.fromEntries(router.params)).toEqual({ cycle: cycle.id, step: 'review', agent: '1', filter: 'total' })
    expect(component(Payroll(), PayrollSummary).props.review).not.toBe(true)
  })

  it('moves the selected stat between the summary rows, the rows that need a person, and the payments table', () => {
    router.params.set('page', '2')
    router.params.set('agent', '1')
    // A search term opens Review but no longer opens a list: the landing view is the Discrepancies summary.
    router.params.set('q', 'Maria')
    let payroll = Payroll()
    expect(component(payroll, PayrollSummary).props.review).not.toBe(true)
    expect(elements(payroll).some((element) => element.type === ShiftTable)).toBe(false)
    let kpi = component(payroll, CycleKpis)
    expect(button(kpiRow(kpi.props), `Discrepancies${kpi.props.stats.total.toLocaleString()}`).props['aria-pressed']).toBe(true)
    click(kpiRow(kpi.props), `Review${kpi.props.stats.needsReview.toLocaleString()}`)
    expect(Object.fromEntries(router.params)).toEqual({ cycle: kpi.props.cycle.id, agent: '1', filter: 'needs-review' })
    payroll = Payroll()
    expect(elements(payroll).some((element) => element.type === ShiftTable)).toBe(false)
    const summary = component(payroll, PayrollSummary)
    expect(summary.props.review).toBe(true)
    expect(rowRules(mount(PayrollSummary, summary.props)())).toEqual(pendingGroups(kpi.props.cycle).map((group) => group.ruleId))
    expect([...new Set(pendingGroups(kpi.props.cycle).map((group) => group.ruleId))].sort()).toEqual(kinds(kpi.props.cycle, {}).map((kind) => kind.ruleId).sort())
    kpi = component(payroll, CycleKpis)
    expect(button(kpiRow(kpi.props), `Review${kpi.props.stats.needsReview.toLocaleString()}`).props['aria-pressed']).toBe(true)
    // The selection moves; Payments leaves Review for the all-entries table.
    click(kpiRow(kpi.props), `Payments${kpi.props.stats.payments.toLocaleString()}`)
    expect(Object.fromEntries(router.params)).toEqual({ cycle: kpi.props.cycle.id, agent: '1', filter: 'all' })
    payroll = Payroll()
    expect(component(payroll, ShiftTable).props.shifts).toBeUndefined()
    expect(component(payroll, ShiftTable).props.defaultFilter).toBe('all')
    expect(elements(payroll).some((element) => element.type === PayrollSummary)).toBe(false)
    // Resolved is the same table limited to agent-resolved entries.
    click(kpiRow(component(payroll, CycleKpis).props), `Resolved${kpi.props.stats.agentResolved.toLocaleString()}`)
    expect(component(Payroll(), ShiftTable).props.defaultFilter).toBe('agent-resolved')
  })

  it('approves the whole Approve category and retains its confirmation in the header', async () => {
    const { cycle, groups, render } = atReview()
    const proposed = groups.filter((group) => group.state === 'proposed')
    const total = proposed.reduce((sum, group) => sum + group.cases.length, 0)
    const tree = render()
    for (const card of elements(tree).filter((element) => element.props.className === 'decision')) expect(content(card)).not.toMatch(/Approve \d/)
    const head = elements(tree).find((element) => element.props.className === 'payroll-summary-head' && content(element).startsWith('Approve'))!
    click(head, `Approve ${total.toLocaleString()}`)
    for (const item of proposed.flatMap((group) => group.cases)) {
      expect(getOnboarding().resolutions[cycle.id][item.shiftId]).toBe('applied')
      expect(getOnboarding().decisionTimes[`${cycle.id}:${item.shiftId}`]).toBe(now.toISOString())
    }
    expect(pendingGroups(cycle).some((group) => group.state === 'proposed')).toBe(false)
    expect(component(Payroll(), CycleKpis).props.stats).toEqual(cycleStats(cycle, getOnboarding().resolutions))
    await Promise.resolve()
    // The saved count updates while the same control becomes a quiet confirmation.
    expect(content(render())).toContain('Approve · 0')
    expect(component(render(), ActionButton).props.action.status).toBe('success')
    expect(router.params.get('filter')).toBe('needs-review')
  })

  it('has no Tell the Agent button, collapsed or expanded', () => {
    const { groups, render } = atReview()
    const group = groups.find((item) => item.state === 'proposed')!
    const row = () => elements(render()).find((element) => element.props.className === 'decision' && element.props['data-rule'] === group.ruleId)!
    expect(content(row())).not.toContain('Tell the Agent')
    const toggle = elements(row()).find((element) => element.props['aria-label'] === 'Show cases')!
    ;(toggle.props.onClick as () => void)()
    expect(content(row())).not.toContain('Tell the Agent')
  })

  it('keeps bulk review on the summary rows without an individual review action', () => {
    const { render } = atReview()
    const tree = render()
    const actions = elements(tree).filter((element) => element.type === 'button' || element.type === Btn || element.type === ActionButton)
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

  it('approves every proposed case from the Approve header with the shortened label', () => {
    const cycle = buildCycles(getOnboarding())[0]
    const proposed = resolutionGroups(cycle, {}).filter((item) => item.state === 'proposed')
    const total = proposed.reduce((sum, group) => sum + group.cases.length, 0)
    const render = mount(PayrollSummary, { cycle })
    const head = elements(render()).find((element) => element.props.className === 'payroll-summary-head' && content(element).startsWith('Approve'))!
    expect(content(head)).not.toContain('Approve all')
    click(head, `Approve ${total.toLocaleString()}`)
    for (const item of proposed.flatMap((group) => group.cases)) {
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
  it('keeps the title and status, plain step buttons, and dates together in the header', () => {
    const payroll = Payroll()
    const head = elements(payroll).find((element) => element.props.className === 'payroll-head')!
    const children = Children.toArray(head.props.children).filter(isValidElement<ElementProps>)
    expect(children.map((element) => element.props.className)).toEqual(['payroll-head-title', 'cycle-steps', 'r-note payroll-dates'])
    expect(elements(children[0]).some((element) => element.props.className === 'payroll-date')).toBe(false)
    const steps = children[1]
    expect(steps.type).toBe('nav')
    expect(elements(payroll).filter((element) => element.props.className === 'cycle-steps')).toEqual([steps])
    const buttons = Children.toArray(steps.props.children).filter(isValidElement<ElementProps>)
    expect(buttons.map((element) => element.type)).toEqual(['button', 'button'])
    expect(buttons.map((element) => element.props.children)).toEqual(['Collect', 'Review'])
  })

  it('opens a cycle on Collect while anything is pending and on Review once everything is in, follows the step in the URL, and clears it when the cycle changes', () => {
    const cycles = buildCycles(getOnboarding())
    const pending = cycles.find((cycle) => cycle.status === 'needs-review')!
    router.params = new URLSearchParams({ cycle: pending.id, step: 'intake' })
    let payroll = Payroll()
    expect(component(payroll, Intake).props.cycle.id).toBe(pending.id)
    expect(elements(payroll).some((element) => element.type === CycleKpis)).toBe(false)
    expect(button(payroll, 'Collect').props['aria-current']).toBe('step')
    expect(button(payroll, 'Review').props['aria-current']).toBeUndefined()
    click(payroll, 'Review')
    expect(router.params.get('step')).toBe('review')
    payroll = Payroll()
    expect(component(payroll, CycleKpis).props.cycle.id).toBe(pending.id)
    expect(button(payroll, 'Collect').props['aria-current']).toBeUndefined()
    expect(button(payroll, 'Review').props['aria-current']).toBe('step')
    click(payroll, 'Collect')
    expect(router.params.get('step')).toBe('intake')
    payroll = Payroll()
    expect(component(payroll, Intake).props.cycle.id).toBe(pending.id)
    expect(button(payroll, 'Collect').props['aria-current']).toBe('step')
    expect(button(payroll, 'Review').props['aria-current']).toBeUndefined()
    const totals = payTotals(pending)
    const sidebar = PayRuns()
    expect(elements(payroll).some((element) => element.type === ClusterList)).toBe(false)
    const sentence = component(sidebar, ClusterList).props.items.find((item) => item.id === pending.id)!.sentence
    expect(content(sentence)).toBe(`${totals.workers.length.toLocaleString()} · ${money(totals.gross)}`)
    expect(elements(sentence)[0].props).toMatchObject({ role: 'img', 'aria-label': `${totals.workers.length.toLocaleString()} payouts, ${money(totals.gross)}` })
    expect(elements(sentence)[1].type).toBe(Banknote)
    component(sidebar, ClusterList).props.onSelect(cycles[0].id)
    expect(router.params.has('step')).toBe(false)
    expect(router.pathname).toBe('/payroll')
    // One list, no period filters above it.
    expect(component(PayRuns(), ClusterList).props.header).toBeUndefined()
    expect(component(PayRuns(), ClusterList).props.items.map((item) => item.id)).toEqual(cycles.map((cycle) => cycle.id))
    // Without a step a cycle opens on Collect while anything is pending, otherwise on Review; a view param opens Review.
    for (const cycle of cycles) {
      router.params = new URLSearchParams({ cycle: cycle.id })
      const open = cycleIntake(cycle, getOnboarding()).open > 0
      expect(elements(Payroll()).some((element) => element.type === Intake), cycle.id).toBe(open)
    }
    expect(cycles.some((cycle) => cycleIntake(cycle, getOnboarding()).open > 0)).toBe(true)
    for (const key of ['filter', 'view', 'q']) {
      router.params = new URLSearchParams({ cycle: pending.id, [key]: 'x' })
      expect(elements(Payroll()).some((element) => element.type === Intake), key).toBe(false)
    }
  })
})

function serverCycle(state: 'proposed' | 'judgment' = 'proposed') {
  const base = buildCycles(DEFAULTS, now)[0]
  const group = resolutionGroups(base, {}).find((item) => item.state === 'proposed')!
  const ruleId = state === 'judgment' ? 'CON-MARGIN-01' : group.ruleId
  const ids = new Set(group.cases.slice(0, 2).map((item) => item.shiftId))
  const shifts = base.run.shifts.filter((item) => ids.has(item.shift.id)).map((item) => ({ ...item, rows: item.rows.filter((row) => row.ruleId === group.ruleId).map((row) => ({ ...row, ruleId })) }))
  const finding: FindingGroup = { id: 75, ruleId, tag: 'Review', title: 'Review time entries', summary: '', why: '', hoursLabel: '', amount: 0, amountLabel: '', action: '', deadline: 'payroll', sources: [], dispute: 'Worker dispute', cases: shifts.length }
  return { ...base, server: true, decisions: [], groups: [finding], week: shifts.map((item) => item.shift), run: { ...base.run, shifts } }
}

describe('persisted Payroll decisions', () => {
  it('an escalated time entry does not offer a no-op Approve zero action', () => {
    const base = serverCycle('judgment')
    const saved: JourneyDecision = { id: 'escalated', cycleId: base.id, groupId: 'CON-MARGIN-01', shiftIds: [], decision: 'escalated', reason: null, by: 'user', at: now.toISOString() }
    const cycle = { ...base, decisions: [saved] }
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    router.pathname = `/payroll/${cycle.run.shifts[0].shift.id}`
    router.params = new URLSearchParams({ cycle: cycle.id })
    const detail = component(mount(() => ShiftPage(), undefined)(), ShiftDetail)
    expect(detail.props.onApply).toBeUndefined()
  })

  it('bulk approval re-reads each group and preserves a dismissal that arrives during an earlier save', async () => {
    vi.useRealTimers()
    const cycle = serverCycle()
    const otherRule = 'FED-RR-01'
    cycle.groups.push({ ...cycle.groups[0], id: 76, ruleId: otherRule })
    cycle.run.shifts.forEach(shift => { shift.rows.push({ ...shift.rows[0], ruleId: otherRule }) })
    let decisions: JourneyDecision[] = []
    const snapshot = data.getDataSnapshot()
    vi.spyOn(data, 'getDataSnapshot').mockImplementation(() => ({ ...snapshot,
      payloads: [{ cycle: { id: cycle.id }, groups: cycle.groups, decisions } as data.CyclePayload],
    }))
    let finish!: () => void
    vi.mocked(decide).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({} as Awaited<ReturnType<typeof decide>>) }))
    const render = mount(PayrollSummary, { cycle })
    click(render(), `Approve ${cycle.run.shifts.length * 2}`)
    await vi.waitFor(() => expect(decide).toHaveBeenCalledTimes(1))
    const firstRule = vi.mocked(decide).mock.calls[0][1].groupId
    const secondRule = cycle.groups.find(group => group.ruleId !== firstRule)!.ruleId
    decisions = [{ id: 'new-dismissal', cycleId: cycle.id, groupId: secondRule, shiftIds: [], decision: 'dismissed', reason: 'Verified by the user', by: 'agent', at: now.toISOString() }]
    finish()
    await vi.waitFor(() => expect(overlay.toast).toHaveBeenCalledWith(`Approved ${cycle.run.shifts.length}`))
    expect(decide).toHaveBeenCalledTimes(1)
    expect(decisions[0].decision).toBe('dismissed')
  })

  it('follows the server next step after asks even if the intake still contains missing entries', () => {
    const base = serverCycle()
    const cycle = { ...base, nextStep: { kind: 'send' as const, label: 'Send to Payroll', detail: 'Ready', counts: { missingSets: 0, gaps: 0, openGroups: 0 } } }
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    router.params = new URLSearchParams({ cycle: cycle.id })
    expect(button(Payroll(), 'Review').props['aria-current']).toBe('step')
    expect(elements(Payroll()).some((element) => element.type === Intake)).toBe(false)
    router.params.set('step', 'intake')
    expect(button(Payroll(), 'Collect').props['aria-current']).toBe('step')
  })

  it('posts group approvals through journey and leaves local resolutions untouched', async () => {
    vi.useRealTimers()
    const cycle = serverCycle()
    vi.mocked(decide).mockResolvedValue({} as Awaited<ReturnType<typeof decide>>)
    const render = mount(PayrollSummary, { cycle })
    const count = cycle.run.shifts.length
    const tree = render()
    expect(elements(tree).filter((element) => element.props.className === 'primary')).toHaveLength(1)
    click(tree, `Approve ${count}`)
    await vi.waitFor(() => expect(decide).toHaveBeenCalledWith(cycle.id, { groupId: groupId(cycle.groups[0]), decision: 'approved', shiftIds: cycle.run.shifts.map((item) => item.shift.id) }))
    expect(getOnboarding().resolutions).toEqual({})
  })

  it('persists escalation for a judgment group', async () => {
    vi.useRealTimers()
    const cycle = serverCycle('judgment')
    vi.mocked(decide).mockResolvedValue({} as Awaited<ReturnType<typeof decide>>)
    click(mount(PayrollSummary, { cycle })(), 'Escalate')
    await vi.waitFor(() => expect(decide).toHaveBeenCalledWith(cycle.id, { groupId: 'CON-MARGIN-01', decision: 'escalated', shiftIds: cycle.run.shifts.map((item) => item.shift.id) }))
    expect(getOnboarding().resolutions).toEqual({})
  })

  it('shows failed saves and leaves the group available to retry', async () => {
    vi.useRealTimers()
    const cycle = serverCycle()
    vi.mocked(decide).mockRejectedValue(new Error('The decision could not be saved'))
    const render = mount(PayrollSummary, { cycle })
    const label = `Approve ${cycle.run.shifts.length}`
    click(render(), label)
    await vi.waitFor(() => expect(content(render())).toContain('The decision could not be saved'))
    expect(button(render(), label).props.disabled).not.toBe(true)
    expect(getOnboarding().resolutions).toEqual({})
  })

  it('states group scope in time-entry approval and posts all related cases', async () => {
    vi.useRealTimers()
    const cycle = serverCycle()
    vi.mocked(decide).mockResolvedValue({} as Awaited<ReturnType<typeof decide>>)
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    router.pathname = `/payroll/${cycle.run.shifts[0].shift.id}`
    router.params = new URLSearchParams({ cycle: cycle.id })
    const render = mount(() => ShiftPage(), undefined)
    const detail = component(render(), ShiftDetail)
    expect(detail.props.applyLabel).toBe(`Approve ${cycle.run.shifts.length} issues`)
    detail.props.onApply!()
    await vi.waitFor(() => expect(decide).toHaveBeenCalledWith(cycle.id, { groupId: cycle.groups[0].ruleId, decision: 'approved', shiftIds: cycle.run.shifts.map((item) => item.shift.id) }))
    expect(getOnboarding().resolutions).toEqual({})
  })
  it('keeps the sheet control in place and reserves Decision and Trail immediately during approval', async () => {
    vi.useRealTimers()
    const cycle = serverCycle()
    let finish!: () => void
    vi.mocked(decide).mockImplementation(() => new Promise(resolve => { finish = () => resolve({} as Awaited<ReturnType<typeof decide>>) }))
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    router.pathname = `/payroll/${cycle.run.shifts[0].shift.id}`
    router.params = new URLSearchParams({ cycle: cycle.id })
    const render = mount(() => ShiftPage(), undefined)
    const initial = component(render(), ShiftDetail)
    initial.props.onApply!()
    const pending = render(), detail = component(pending, ShiftDetail)
    expect(detail.props.onApply).toBeTypeOf('function')
    expect(detail.props.applyLabel).toBe(initial.props.applyLabel)
    expect(detail.props.applyAction?.status).toBe('pending')
    const trail = elements(pending).find(element => element.props.pending === true)!
    const Trail = trail.type as (props: typeof trail.props) => ReactNode
    const html = renderToStaticMarkup(Trail(trail.props))
    expect(html).toContain('aria-label="Pending decision"')
    expect(html).toContain('shift-pending-trail')
    expect(html.match(/data-skeleton=/g)).toHaveLength(2)
    expect(content(pending)).not.toContain('Saving decisions')
    finish()
    await vi.waitFor(() => expect(component(render(), ShiftDetail).props.applyAction?.status).toBe('success'))
    expect(component(render(), ShiftDetail).props.applyLabel).toBe(initial.props.applyLabel)
  })

})
