import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '@/lib/fixtures/server-cycle.json'
import { DEFAULTS } from '@/lib/onboarding'
import { getDataSnapshot, invalidate, serverCycles, type CyclePayload } from '@/lib/data'
import { resolutionGroups } from '@/lib/resolution'
import type { JourneyThread } from '@/lib/journey'
import { FirstCloseoutChoice } from '@/components/chat/FirstCloseoutChoice'
import { FindingsCard, carouselFindings, findingEvidence, findingsLayout } from './FindingsCard'
import { TaskCard, taskProgress } from './TaskCard'

const source = vi.hoisted(() => ({ cycle: undefined as CyclePayload | undefined, threads: [] as JourneyThread[] }))
const actions = vi.hoisted(() => ({ navigate: vi.fn(), openDrawer: vi.fn() }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T>(value: T | (() => T)) => [typeof value === 'function' ? (value as () => T)() : value, vi.fn()],
  useEffect: vi.fn(), useRef: <T>(current: T) => ({ current }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => actions.navigate }))
vi.mock('@/components/shell/Overlay', () => ({ useOverlay: () => actions }))
vi.mock('@/lib/onboarding', async original => {
  const actual = await original<typeof import('@/lib/onboarding')>()
  return { ...actual, useOnboarding: () => [actual.DEFAULTS, vi.fn()], flushOnboarding: vi.fn().mockResolvedValue(undefined) }
})
vi.mock('@/lib/data', async original => ({ ...await original<typeof import('@/lib/data')>(), invalidate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/journey', async original => ({
  ...await original<typeof import('@/lib/journey')>(),
  useJourneyCycle: () => ({ cycle: source.cycle, loading: false, error: null }),
  useJourneyThreads: () => ({ threads: source.threads, loading: false, error: null }),
}))
type ElementProps = { children?: ReactNode; className?: string; onClick?(): void; 'data-state'?: string }
const elements = (tree: ReactNode): ReactElement<ElementProps>[] => Children.toArray(tree).flatMap(child => isValidElement<ElementProps>(child) ? [child, ...elements(child.props.children)] : [])
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
  source.threads = []
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
})
afterEach(() => vi.unstubAllGlobals())

describe('server-driven task card', () => {
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
    for (const label of ['Fetching set 1', 'Matching workers', 'Applying', 'Pricing differences', 'Sample', 'tabular-nums']) expect(html).toContain(label)
    expect(html).toContain('data-timesheet-set="3"')
    expect(html).not.toContain('primary')
    const onAnswer = vi.fn()
    const tree = TaskCard({ cycleId: cycle.cycle.id, onAnswer })
    const choice = elements(tree).find(item => item.type === FirstCloseoutChoice)!
    const choiceTree = FirstCloseoutChoice(choice.props as Parameters<typeof FirstCloseoutChoice>[0])
    button(choiceTree, 'Use sample').props.onClick!()
    expect(onAnswer).toHaveBeenCalledWith('Set 3: Use sample')
  })
  it('keeps the scan under 2KB, static for reduced motion, without layout reads', () => {
    const code = readFileSync(new URL('./DotMatrix.tsx', import.meta.url), 'utf8')
    expect(Buffer.byteLength(code)).toBeLessThanOrEqual(2048)
    expect(code).toContain('prefers-reduced-motion: reduce')
    expect(code).toContain('if (!motion.matches) frame = requestAnimationFrame(draw)')
    expect(code).not.toMatch(/getBoundingClientRect|offsetWidth|clientWidth|setInterval/)
  })
})

describe('findings carousel', () => {
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
  it('posts the exact group and decision then publishes the returned cycle to the shared store', async () => {
    const cycle = source.cycle!, item = carouselFindings(cycle, DEFAULTS)[0]
    const decision = { id: 'decision-1', cycleId: cycle.cycle.id, groupId: 'CS-01', shiftIds: [item.resolution.cases[0].shiftId], decision: 'approved' as const, reason: '', by: 'user' as const, at: '2026-09-25T12:00:00Z' }
    const updated = { ...cycle, decisions: [decision] }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ decision, cycle: updated }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    button(FindingsCard({ cycleId: cycle.cycle.id }), 'Approve 1').props.onClick!()
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledOnce())
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
    const evidence = findingEvidence(cycle, waiting)
    expect(evidence.cases[0].worker).toBe(cycle.week[1].worker)
    expect(evidence.cases[0].rows[0].note).toContain(cycle.week[1].prov.file)
    button(FindingsCard({ cycleId: cycle.cycle.id }), 'Evidence').props.onClick!()
    expect(actions.openDrawer).toHaveBeenCalledWith(expect.anything(), 'Evidence', 'Sample')
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
    button(FindingsCard({ cycleId: source.cycle!.cycle.id }), 'View 3 issues').props.onClick!()
    expect(actions.navigate).toHaveBeenCalledWith('/payroll?cycle=2026-09-20&step=review&filter=needs-review')
    const layout = findingsLayout(390, 16, 3)
    expect(layout).toEqual({ width: 358, cardWidth: 320, contentWidth: 984, scrollWidth: 984, pageWidth: 390, pageOverflow: false, scrollSnap: 'x mandatory' })
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
    expect(css).toContain('flex: 0 0 min(320px, 100%)')
    expect(css).toContain('overflow-x: auto')
    expect(css).toContain('scroll-snap-type: x mandatory')
    expect(css).toContain('overscroll-behavior-x: contain')
  })
})
