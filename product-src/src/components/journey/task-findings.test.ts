import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '@/lib/fixtures/server-cycle.json'
import { DEFAULTS } from '@/lib/onboarding'
import { getDataSnapshot, hydrate, refreshCycleList, serverCycles, type CyclePayload, type CycleSummary, type FileRecord } from '@/lib/data'
import { resolutionGroups } from '@/lib/resolution'
import type { JourneyThread } from '@/lib/journey'
import { FirstCloseoutChoice } from '@/components/chat/FirstCloseoutChoice'
import { FindingsCard, carouselFindings, findingEvidence, findingsLayout, hasAskableGaps, payChange } from './FindingsCard'
import { PayDelta } from '@/components/ui'
import { TaskCard, taskProgress } from './TaskCard'
import { NextStepRow } from './NextStepRow'
import { findingCounts } from '@/lib/findingCounts'

const source = vi.hoisted(() => ({ cycle: undefined as CyclePayload | undefined, row: undefined as CycleSummary | undefined, error: null as string | null, threads: [] as JourneyThread[], reduced: false, pipelineRunning: false }))
const actions = vi.hoisted(() => ({ navigate: vi.fn(), openDrawer: vi.fn() }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T>(value: T | (() => T)) => [typeof value === 'function' ? (value as () => T)() : value, vi.fn()],
  useEffect: vi.fn(), useRef: <T>(current: T) => ({ current }),
}))
vi.mock('@/lib/useReducedMotion', () => ({ useReducedMotion: () => source.reduced }))
vi.mock('@/lib/useTweened', () => ({ useTweened: (value: number) => value }))
vi.mock('react-router-dom', () => ({ useNavigate: () => actions.navigate }))
vi.mock('@/components/shell/Overlay', () => ({ useOverlay: () => actions }))
vi.mock('@/lib/onboarding', async original => {
  const actual = await original<typeof import('@/lib/onboarding')>()
  return { ...actual, useOnboarding: () => [actual.DEFAULTS, vi.fn()], flushOnboarding: vi.fn().mockResolvedValue(undefined) }
})
vi.mock('@/lib/data', async original => ({ ...await original<typeof import('@/lib/data')>(), invalidate: vi.fn().mockResolvedValue(undefined), refreshCycleList: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/journey', async original => ({
  ...await original<typeof import('@/lib/journey')>(),
  useJourneyCycle: () => ({ cycle: source.cycle, row: source.row, running: !source.cycle?.runAt, loading: false, error: source.error, pipelineRunning: source.pipelineRunning }),
  useJourneyThreads: () => ({ threads: source.threads, loading: false, error: null }),
}))
type ElementProps = { children?: ReactNode; footer?: ReactNode; className?: string; onClick?(): void; 'data-state'?: string }
const elements = (tree: ReactNode): ReactElement<ElementProps>[] => Children.toArray(tree).flatMap(child => isValidElement<ElementProps>(child) ? [child, ...elements(child.props.children), ...elements(child.props.footer)] : [])
const textOf = (tree: ReactNode): string => Children.toArray(tree).map(child => isValidElement<ElementProps>(child) ? textOf(child.props.children) : String(child)).join('')
const button = (tree: ReactNode, text: string) => elements(tree).find(item => typeof item.props.onClick === 'function' && textOf(item.props.children) === text)!
function cycleFixture() {
  const payload = structuredClone(fixture.payload) as CyclePayload
  const rules = ['CON-MARGIN-01', 'SRC-VMS-01', 'CS-01']
  payload.week = payload.week.slice(0, 3)
  payload.results = payload.results.slice(0, 3).map((row, i) => ({ ...row, rows: [{ ruleId: rules[i], status: 'flag', note: `Evidence for ${rules[i]}` }] }))
  payload.groups = rules.map((ruleId, i) => ({ ...payload.groups[0], ruleId, id: i + 1, cases: 1, title: `Finding ${ruleId}` }))
  payload.extraGroups = []
  payload.decisions = []
  return payload
}
beforeEach(() => {
  vi.clearAllMocks()
  source.cycle = cycleFixture()
  source.row = undefined
  source.error = null
  source.threads = []
  source.reduced = false
  source.pipelineRunning = false
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
})
afterEach(() => vi.unstubAllGlobals())

describe('server-driven task card', () => {
  it('keeps a running scan still and removes the beam under reduced motion', () => {
    source.cycle = { ...source.cycle!, runAt: '' }
    source.reduced = true
    const still = renderToStaticMarkup(createElement(TaskCard, { cycleId: source.cycle.cycle.id }))
    expect(still).toContain('<canvas')
    expect(still).not.toContain('data-testid="running-beam"')
    source.reduced = false
    expect(renderToStaticMarkup(createElement(TaskCard, { cycleId: source.cycle.cycle.id }))).toContain('data-testid="running-beam"')
  })
  it('shows actual request progress before runAt and does not offer another sample load during it', () => {
    source.pipelineRunning = true
    const cycle = source.cycle!
    expect(taskProgress(cycle, undefined, false, true).status).toBe('Running')
    const html = renderToStaticMarkup(createElement(TaskCard, { cycleId: cycle.cycle.id }))
    expect(html).toContain('Running')
    expect(html).toContain('<canvas')
    expect(html).not.toContain('data-timesheet-set=')
  })
  it('shows Interrupted after a refresh failure even when an earlier runAt exists', () => {
    source.error = 'The latest cycle could not be loaded. Try again.'
    expect(taskProgress(source.cycle, undefined, false, false, source.error).status).toBe('Interrupted')
    const html = renderToStaticMarkup(createElement(TaskCard, { cycleId: source.cycle!.cycle.id }))
    expect(html).toContain('Interrupted')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('>Done<')
    expect(html).not.toContain('data-testid="running-beam"')
    expect(html).not.toContain('<canvas')
  })

  it('uses only runAt for Running versus Done, including before any entries arrive', () => {
    const cycle = source.cycle!
    const running = { ...cycle, runAt: '' }
    expect(taskProgress(running).status).toBe('Running')
    expect(taskProgress({ ...running, counts: { set1: 900, set2: 900, set3: 900 } }).status).toBe('Running')
    expect(taskProgress(cycle).status).toBe('Done')
    source.cycle = running
    const html = renderToStaticMarkup(createElement(TaskCard, { cycleId: cycle.cycle.id }))
    expect(html).toContain('Running')
    expect(html).toContain('<canvas')
    source.cycle = cycle
    const done = renderToStaticMarkup(createElement(TaskCard, { cycleId: cycle.cycle.id }))
    expect(done).toContain('Done')
    expect(done).not.toContain('<canvas')
    expect(done).toContain('Closeout · Sep 14 to 20')
  })
  it('renders payload counts, all steps, Sample and an equal-weight inline choice for every missing set', () => {
    const cycle = source.cycle!
    const html = renderToStaticMarkup(createElement(TaskCard, { cycleId: cycle.cycle.id, onAnswer: vi.fn() }))
    expect(taskProgress(cycle)).toMatchObject({ sets: [12, 4, 0], workers: 11, rules: 3, missingSets: [3] })
    for (const label of ['Time entry sets 1', 'Matching workers', 'Applying', 'Pricing differences', 'Sample', 'tabular-nums']) expect(html).toContain(label)
    expect(html).toContain('data-timesheet-set="3"')
    expect(html).not.toContain('primary')
    const onAnswer = vi.fn()
    const tree = TaskCard({ cycleId: cycle.cycle.id, onAnswer })
    const choice = elements(tree).find(item => item.type === FirstCloseoutChoice)!
    const choiceTree = FirstCloseoutChoice(choice.props as Parameters<typeof FirstCloseoutChoice>[0])
    button(choiceTree, 'Use sample').props.onClick!()
    expect(onAnswer).toHaveBeenCalledWith('Set 3: Use sample')
  })
  it('renders a real no-run list row with its counts, missing choices and live Running status', () => {
    const cycle = source.cycle!
    source.row = { ...cycle.cycle, runAt: null, sample: false, totals: null, counts: { set1: 4, set2: 0, set3: 0 }, findings: 0 }
    source.cycle = undefined
    expect(taskProgress(undefined, source.row)).toMatchObject({ status: 'Running', sets: [4, 0, 0], workers: 0, rules: 0, missingSets: [2, 3] })
    const html = renderToStaticMarkup(createElement(TaskCard, { cycleId: cycle.cycle.id }))
    expect(html).toContain('<canvas')
    expect(html).toMatch(/role="status"[^>]*><span[^>]*>[\s\S]*?Running/)
    expect(html).toContain('Closeout · Sep 14 to 20')
    expect(html).toContain('data-timesheet-set="2"')
    expect(html).toContain('data-timesheet-set="3"')
    expect(html).not.toContain('data-timesheet-set="1"')
    source.cycle = cycle
    const completed = renderToStaticMarkup(createElement(TaskCard, { cycleId: cycle.cycle.id }))
    expect(completed).toMatch(/role="status"[^>]*><span[^>]*>[\s\S]*?Done/)
  })
  it('keeps first-closeout choices usable without a payload or list row, including after a card-local error', () => {
    source.cycle = undefined
    source.error = 'Connection unavailable. Try again.'
    const onAnswer = vi.fn(), tree = TaskCard({ cycleId: 'new-cycle', onAnswer })
    const choices = elements(tree).filter(item => item.type === FirstCloseoutChoice)
    expect(choices).toHaveLength(3)
    const choiceTree = FirstCloseoutChoice(choices[0].props as Parameters<typeof FirstCloseoutChoice>[0])
    button(choiceTree, 'Use sample').props.onClick!()
    expect(onAnswer).toHaveBeenCalledWith('Set 1: Use sample')
    const html = renderToStaticMarkup(tree)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Interrupted')
    expect(html).not.toContain('<canvas')
  })
  it('keeps Running after a missing detail even when the cycle list still advertises a run', () => {
    const cycle = source.cycle!
    source.row = { ...cycle.cycle, runAt: cycle.runAt, sample: false, totals: cycle.totals, counts: cycle.counts, findings: 0 }
    source.cycle = undefined
    expect(taskProgress(undefined, source.row).status).toBe('Running')
    const html = renderToStaticMarkup(createElement(TaskCard, { cycleId: cycle.cycle.id }))
    expect(html).toContain('Running')
    expect(html).not.toContain('Done')
    expect(html).toContain('<canvas')
    expect(html).toContain('data-timesheet-set="3"')
  })
})

describe('findings carousel', () => {
  it('reconciles the row and carousel before and after a decision, while the footer includes every issue', () => {
    const cycle = source.cycle!
    const renderBoth = () => {
      const counts = findingCounts(carouselFindings(source.cycle!, DEFAULTS).map(item => item.resolution))
      const row = renderToStaticMarkup(createElement(NextStepRow, { cycle: { id: cycle.cycle.id, label: 'Sep 14–20' }, nextStep: { kind: 'review', label: 'Review issues', detail: '3 open groups', counts: { missingSets: 0, gaps: 0, openGroups: counts.toDecide } }, findingCounts: counts }))
      const carousel = renderToStaticMarkup(createElement(FindingsCard, { cycleId: cycle.cycle.id }))
      return { row, carousel }
    }
    const before = renderBoth()
    expect(before.row).toContain('2 to decide · 1 waiting on evidence')
    expect(before.carousel).toContain('2 to decide · 1 waiting on evidence')
    expect(before.row).not.toContain('3 open groups')
    const item = carouselFindings(cycle, DEFAULTS)[0]
    source.cycle = { ...cycle, decisions: [{ id: 'approved', cycleId: cycle.cycle.id, groupId: item.group.ruleId, shiftIds: item.resolution.cases.map(entry => entry.shiftId), decision: 'approved', reason: null, by: 'user', at: '' }] }
    const after = renderBoth()
    expect(after.row).toContain('1 to decide · 1 waiting on evidence')
    expect(after.carousel).toContain('1 to decide · 1 waiting on evidence')
    expect(after.carousel).toContain('View all issues')
  })

  it('uses the work-pane triage in proposed, waiting, judgment order', () => {
    expect(carouselFindings(source.cycle!, DEFAULTS).map(item => item.resolution.state)).toEqual(['proposed', 'waiting', 'judgment'])
    const html = renderToStaticMarkup(createElement(FindingsCard, { cycleId: source.cycle!.cycle.id }))
    expect(html).toContain('1 of 3')
    const cards = html.split('<article').slice(1)
    expect(cards).toHaveLength(3)
    expect(cards[0].match(/class="btn primary"/g)).toHaveLength(1)
    expect(cards[1]).not.toContain('class="btn primary"')
    expect(cards[2]).not.toContain('class="btn primary"')
    expect(cards[2]).toContain('Escalate')
  })
  it('gives only the proposed item in view a black Approve, and only while review is the next step (H3)', () => {
    const cycle = source.cycle!
    cycle.results[1].rows = [{ ...cycle.results[1].rows[0], ruleId: 'CA-MB-01' }]
    cycle.groups[1] = { ...cycle.groups[1], ruleId: 'CA-MB-01' }
    expect(carouselFindings(cycle, DEFAULTS).filter(item => item.resolution.state === 'proposed')).toHaveLength(2)
    const primaries = () => (renderToStaticMarkup(createElement(FindingsCard, { cycleId: cycle.cycle.id })).match(/class="btn primary"/g) ?? []).length
    expect(primaries()).toBe(1)
    cycle.nextStep = { kind: 'review', label: 'Review 3 issues', detail: '', counts: { missingSets: 0, gaps: 0, openGroups: 3 } }
    expect(primaries()).toBe(1)
    cycle.nextStep = { kind: 'get_timesheets', label: 'Get timesheets', detail: 'No location yet', counts: { missingSets: 1, gaps: 0, openGroups: 3 } }
    expect(primaries()).toBe(0)
    cycle.nextStep = undefined
    expect((renderToStaticMarkup(createElement(FindingsCard, { cycleId: cycle.cycle.id, live: false })).match(/class="btn primary"/g) ?? [])).toHaveLength(0)
  })
  it('N5: shows each group\'s money from the same function as the pane, never the server exposure label', () => {
    const cycle = source.cycle!
    cycle.groups = cycle.groups.map(group => ({ ...group, amountLabel: '$270 owed' }))
    const html = renderToStaticMarkup(createElement(FindingsCard, { cycleId: cycle.cycle.id }))
    expect(html).not.toContain('$270 owed')
    const items = carouselFindings(cycle, DEFAULTS)
    const pane = resolutionGroups(hydrate(cycle, DEFAULTS), {})
    for (const item of items) {
      const same = pane.find(group => group.ruleId === item.resolution.ruleId && group.state === item.resolution.state)!
      expect([item.resolution.current, item.resolution.resolved]).toEqual([same.current, same.resolved])
      expect(html).toContain(renderToStaticMarkup(createElement(PayDelta, { current: same.current, resolved: same.resolved, size: 'sm' })))
      expect(findingEvidence(cycle, item).amountLabel).toBe(payChange(same))
    }
  })
  it('R4-3: a waiting group with no missing time opens the labelled time-entry view without promising an ask', () => {
    const cycle = source.cycle!
    const waiting = carouselFindings(cycle, DEFAULTS).find(item => item.resolution.state === 'waiting')!
    const shift = cycle.week.find(entry => entry.id === waiting.resolution.cases[0].shiftId)!
    cycle.intake = { ...cycle.intake, expected: [], received: [] }
    let tree = FindingsCard({ cycleId: cycle.cycle.id })
    expect(elements(tree).some(item => textOf(item.props.children) === 'Review gaps')).toBe(false)
    expect(textOf(tree)).not.toContain('Ask from an entry')
    button(tree, 'View time entry').props.onClick!()
    expect(actions.navigate).toHaveBeenCalledWith(expect.stringContaining(`/payroll/${encodeURIComponent(shift.id)}?`))
    cycle.intake = { ...cycle.intake, expected: [{ worker: shift.worker, client: cycle.sites[shift.fac].name, day: shift.day, source: cycle.intake.sources[0]?.id ?? '' }], received: [] }
    expect(hasAskableGaps(cycle, waiting.resolution, DEFAULTS)).toBe(true)
    tree = FindingsCard({ cycleId: cycle.cycle.id })
    expect(textOf(tree)).toContain('Not asked yet')
    expect(button(tree, 'Review gaps')).toBeDefined()
  })
  it('names rule-only groups in the evidence drawer instead of showing the rule id (D14)', () => {
    const cycle = source.cycle!, item = carouselFindings(cycle, DEFAULTS)[0]
    expect(findingEvidence(cycle, { ...item, group: { ...item.group, ruleId: 'CA-OT-8', tag: 'CA-OT-8' } }).tag).toBe('Daily overtime')
    expect(findingEvidence(cycle, item).tag).toBe(item.group.tag)
  })
  it('posts the exact group and decision then publishes the returned cycle to the shared store', async () => {
    const cycle = source.cycle!, item = carouselFindings(cycle, DEFAULTS)[0]
    const decision = { id: 'decision-1', cycleId: cycle.cycle.id, groupId: 'CS-01', shiftIds: [item.resolution.cases[0].shiftId], decision: 'approved' as const, reason: '', by: 'user' as const, at: '2026-09-25T12:00:00Z' }
    const updated = { ...cycle, decisions: [decision] }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ decision, cycle: updated }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    button(FindingsCard({ cycleId: cycle.cycle.id }), 'Approve 1').props.onClick!()
    await vi.waitFor(() => expect(refreshCycleList).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/data/cycles/2026-09-20/decisions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ groupId: 'CS-01', decision: 'approved', shiftIds: decision.shiftIds })
    expect(getDataSnapshot().payloads.find(payload => payload.cycle.id === cycle.cycle.id)?.decisions).toEqual([decision])
    expect(carouselFindings(updated, DEFAULTS).map(item => item.resolution.state)).toEqual(['waiting', 'judgment'])
    const workPaneCycle = serverCycles(DEFAULTS).find(item => item.id === cycle.cycle.id)!
    const workPaneGroups = resolutionGroups(workPaneCycle, DEFAULTS.resolutions)
    expect(workPaneGroups.find(item => item.ruleId === 'CS-01')).toMatchObject({ state: 'fixed', approved: true })
    expect(workPaneGroups.filter(item => item.state !== 'fixed').map(item => item.state)).toEqual(carouselFindings(updated, DEFAULTS).map(item => item.resolution.state))
  })
  it('shows the recorded thread counterparty and keeps the evidence from the server payload', () => {
    const cycle = source.cycle!, waiting = carouselFindings(cycle, DEFAULTS)[1]
    source.threads = [{ id: 'thread-1', cycleId: cycle.cycle.id, shiftId: waiting.resolution.cases[0].shiftId, counterparty: { kind: 'site', name: 'Maria Castillo' }, status: 'waiting', createdAt: '', messages: [{ id: 'message-1', threadId: 'thread-1', dir: 'out', text: 'Please confirm.', status: 'not_sent_demo', at: '' }] }]
    expect(renderToStaticMarkup(createElement(FindingsCard, { cycleId: cycle.cycle.id }))).toContain('Asked Maria Castillo')
    const evidence = findingEvidence(cycle, waiting, fixture.files as FileRecord[])
    expect(evidence.cases[0].worker).toBe(cycle.week[1].worker)
    expect(evidence.cases[0].rows[0].source).toBe('Bullhorn')
    expect(evidence.cases[0].rows[0].note).toContain('bullhorn_2026-09-20.csv · row 3 · Sep 14, 2026')
    expect(evidence.cases[0].rows[0].note).not.toContain(cycle.week[1].prov.file)
    expect(evidence.cases[0].rows[0].start).toBe(cycle.week[1].punches[0].in)
    expect(evidence.cases[0].rows[0].end).toBe(cycle.week[1].punches[0].out)
    button(FindingsCard({ cycleId: cycle.cycle.id }), 'Evidence').props.onClick!()
    expect(actions.openDrawer).toHaveBeenCalledWith(expect.anything(), 'Evidence', 'Sample')
  })
  it('does not expose an internal file id when the file catalogue is unavailable', () => {
    const cycle = source.cycle!, item = carouselFindings(cycle, DEFAULTS)[1]
    cycle.week[1].prov.file = 'F_33mzm6i2e4ll'
    const note = findingEvidence(cycle, item).cases[0].rows[0].note
    expect(note).toContain('Source file unavailable · row 3')
    expect(note).not.toContain('F_33mzm6i2e4ll')
  })
  it('matches the server ask thread by gapIds when it has no shiftId and does not invent a contact', () => {
    const cycle = source.cycle!, waiting = carouselFindings(cycle, DEFAULTS)[1]
    const shift = cycle.week.find(shift => shift.id === waiting.resolution.cases[0].shiftId)!
    cycle.sites.forEach(site => { delete site.supervisor })
    expect(carouselFindings(cycle, DEFAULTS)[1].asked).toBeUndefined()
    const thread: JourneyThread = { id: 'thread-gap', cycleId: cycle.cycle.id, shiftId: null, counterparty: { kind: 'site', name: 'Taylor Chen', gapIds: [`${waiting.resolution.cases[0].site}|${shift.worker}|${shift.day}`] }, status: 'waiting', createdAt: '', messages: [{ id: 'message-gap', threadId: 'thread-gap', dir: 'out', text: 'Please confirm.', status: 'not_sent_demo', at: '' }] }
    expect(carouselFindings(cycle, DEFAULTS, [thread])[1].asked).toBe('Taylor Chen')
  })
  it('focuses the review list and contains a swipeable carousel at 390px', () => {
    button(FindingsCard({ cycleId: source.cycle!.cycle.id }), 'View all issues').props.onClick!()
    expect(actions.navigate).toHaveBeenCalledWith('/payroll?cycle=2026-09-20&step=review&filter=needs-review')
    const layout = findingsLayout(390, 16, 3)
    expect(layout).toMatchObject({ width: 358, pageWidth: 390, pageOverflow: false, scrollSnap: 'x mandatory' })
    expect(layout.cardWidth).toBeCloseTo((358 - 24) * 8 / 9)
    expect(layout.scrollWidth).toBeGreaterThan(layout.width)
    for (const width of [300, 390, 768]) {
      const narrow = findingsLayout(width, 16, 10)
      expect(narrow.cardWidth).toBeLessThanOrEqual(narrow.width)
      expect(narrow.contentWidth).toBeGreaterThan(narrow.pageWidth)
      expect(narrow.pageWidth).toBe(width)
      expect(narrow.pageOverflow).toBe(false)
    }
    const css = readFileSync(new URL('./task-findings.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.journey-findings \{ overflow: hidden;/)
    expect(css).toContain('flex: 0 0 min(320px, 80%)')
    expect(css).toContain('overflow-x: auto')
    expect(css).toContain('scroll-snap-type: x mandatory')
    expect(css).toContain('overscroll-behavior-x: contain')
  })
})
