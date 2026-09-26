import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '@/lib/fixtures/server-cycle.json'
import { hydrate, type CyclePayload } from '@/lib/data'
import { cycleStats, effectiveResolutions, rowResolution, type DeskCycle } from '@/lib/desk'
import { DEFAULTS } from '@/lib/onboarding'
import { payTotals } from '@/lib/payroll'
import { resolutionGroups } from '@/lib/resolution'
import type { JourneyDecision, JourneyDispute, JourneyThread } from '@/lib/journey'
import { journeyShiftPay } from '@/lib/journeyPay'
import { Sheet } from '@/components/Sheet'
import { ShiftDetail } from '@/components/ShiftDetail'
import { ShiftTable } from '@/components/ShiftTable'
import { PayRuns } from '@/components/shell/PayRuns'
import { Payroll } from '@/pages/Payroll'
import { batchPreview } from '@/components/journey/FormCard'
import { FindingsCard, carouselFindings } from '@/components/journey/FindingsCard'
import { buildExport, summarize, toCsv } from '../server/src/journey'
import type { CyclePayload as ServerPayload } from '../server/src/pipeline'

const source = vi.hoisted(() => ({ cycle: undefined as DeskCycle | undefined, payload: undefined as CyclePayload | undefined,
  threads: [] as JourneyThread[], neverContact: [] as string[], context: vi.fn() }))
vi.mock('@/lib/onboarding', async original => {
  const actual = await original<typeof import('@/lib/onboarding')>()
  return { ...actual, useOnboarding: () => [{ ...actual.DEFAULTS, neverContact: source.neverContact }, vi.fn()] }
})
vi.mock('@/lib/desk', async original => ({ ...await original<typeof import('@/lib/desk')>(),
  useDesk: () => ({ current: source.cycle, cycles: [source.cycle], byId: () => source.cycle }) }))
vi.mock('@/lib/journey', async original => ({ ...await original<typeof import('@/lib/journey')>(),
  useJourneyCycle: () => ({ cycle: source.payload, loading: false, error: null }),
  useJourneyThreads: () => ({ threads: source.threads, loading: false, error: null }),
}))
vi.mock('@/components/shell/Overlay', () => ({ useOverlay: () => ({ openDrawer: vi.fn(), toast: vi.fn() }) }))
vi.mock('@/components/chat/ChatPane', () => ({ useSetChatContext: source.context, useSetChatSuggestions: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams('step=review'), vi.fn()],
  useLocation: () => ({ pathname: '/payroll' }), Outlet: () => null, Link: () => null }))

const decision = (ruleId: string, kind: JourneyDecision['decision']): JourneyDecision => ({ id: `d_${ruleId}`, cycleId: '2026-09-20',
  groupId: ruleId, shiftIds: [], decision: kind, reason: kind === 'dismissed' ? 'Confirmed by manager' : null, by: 'user', at: '2026-09-25T12:00:00Z' })

function payload() {
  const p = structuredClone(fixture.payload) as CyclePayload
  p.sites[0] = { ...p.sites[0], state: 'TX', supervisor: { name: 'Dana K.' } }
  const rules = ['CA-MB-01', 'TS-COMPLETE', 'CON-MARGIN-01', 'TW-1187']
  p.week = rules.map((_, i) => ({ ...p.week[0], id: `s_${i}`, worker: `Worker ${i}`, day: 0, rate: 20, fac: 0,
    meal: null, mealMin: 0, sched: [480, 960], punches: [{ in: 480, out: i === 1 ? null : 960 }], geo: null }))
  const base = { ...p.results[0], held: false, flagged: true, naive: 160, pay: 180, workedMin: 480, payableMin: 480, rate: 20 }
  p.results = [
    { ...base, rows: [{ ruleId: rules[0], status: 'flag', note: 'Meal premium', effect: { premiumHours: 1 } }] },
    { ...base, held: true, pay: 0, payableMin: 0, rows: [{ ruleId: rules[1], status: 'flag', note: 'Clock-out missing' }, { ruleId: rules[1], status: 'held', note: 'Wait for confirmation', effect: { holdAll: true } }] },
    { ...base, pay: 200, rows: [{ ruleId: rules[2], status: 'flag', note: 'Owner judgment', effect: { premiumAmt: 40 } }] },
    { ...base, held: true, pay: 60, payableMin: 180, rows: [{ ruleId: rules[3], status: 'flag', note: 'Weekly cap' }, { ruleId: rules[3], status: 'held', note: 'Partial hold', effect: { holdMin: 300 } }] },
  ]
  p.groups = rules.map((ruleId, i) => ({ ...p.groups[0], ruleId, id: i + 1, cases: 1, title: ruleId }))
  p.extraGroups = []
  p.decisions = []
  p.batch = null
  p.intake = { ...p.intake, expected: [], received: [] }
  return p
}
function mount(p: CyclePayload) { source.payload = p; source.cycle = hydrate(p, DEFAULTS); return source.cycle }
beforeEach(() => { vi.clearAllMocks(); source.threads = []; source.neverContact = []; mount(payload()) })

describe('held, escalated and decision-aware Payroll', () => {
  it.each(['approved', 'dismissed', 'escalated'] as const)('keeps flag-before-hold entries waiting after %s and never offers approval', kind => {
    const p = source.payload!
    p.decisions = [decision('TS-COMPLETE', kind), decision('TW-1187', kind)]
    const c = mount(p)
    const groups = resolutionGroups(c, {})
    for (const ruleId of ['TS-COMPLETE', 'TW-1187']) {
      expect(groups.find(group => group.ruleId === ruleId)).toMatchObject({ state: 'waiting', resolved: 0 })
      expect(summarize(p as unknown as ServerPayload).groups.find(group => group.id === ruleId)?.state).toBe('waiting')
    }
    for (const rs of c.run.shifts.filter(row => row.held)) {
      expect(rowResolution(c, rs.shift.id, rs.rows[0].ruleId, {})).toBeUndefined()
      expect(effectiveResolutions(c, {})[c.id]?.[rs.shift.id]).toBeUndefined()
      const html = renderToStaticMarkup(createElement(ShiftDetail, { cycle: c, rs, onApply: vi.fn() }))
      expect(html).toContain('Held')
      expect(html).toContain('excluded from Payroll')
      expect(html).not.toContain('class="btn primary"')
    }
    const sheet = renderToStaticMarkup(createElement(ShiftTable, { cycle: c, filterMode: 'discrepancies', defaultFilter: 'needs-review', onSelect: vi.fn() }))
    expect(sheet).toContain('data-shift="s_1"')
    expect(sheet).toContain('data-shift="s_3"')
    expect(sheet.match(/>Held</g)).toHaveLength(2)
    expect(carouselFindings(p, DEFAULTS).filter(item => ['TS-COMPLETE', 'TW-1187'].includes(item.group.ruleId)).every(item => item.resolution.state === 'waiting')).toBe(true)
  })

  it('matches ledger, sidebar, agent, Send preview and CSV gross after dismissal, escalation and partial/full holds', () => {
    const p = source.payload!
    p.decisions = [decision('CA-MB-01', 'dismissed'), decision('CON-MARGIN-01', 'escalated'), decision('TS-COMPLETE', 'approved'), decision('TW-1187', 'dismissed')]
    p.results[0].rows.push({ ruleId: 'CON-MARGIN-01', status: 'na', note: 'Margin rule does not apply to this entry' })
    const c = mount(p), exported = buildExport(p as unknown as ServerPayload, p.decisions, [])
    expect(exported.gross).toBe(360)
    expect(batchPreview(p).gross).toBe(exported.gross)
    expect(payTotals(c).gross).toBe(exported.gross)
    expect(cycleStats(c).gross).toBe(exported.gross)
    expect(c.run.shifts.reduce((sum, row) => sum + journeyShiftPay(row), 0)).toBe(exported.gross)
    expect(toCsv(exported.lines)).toContain('Worker 3,0.00,0.00,0.00,0.00,1')
    const ledger = renderToStaticMarkup(createElement(Sheet, { cycle: c, shifts: c.run.shifts, groupBy: 'worker', days: c.days, onSelect: vi.fn() }))
    const resolvedAmounts = [...ledger.matchAll(/pay-amounts-resolved"><span class="pay-amounts-value">\$([\d,.]+)<\/span>/g)].map(match => Number(match[1].replaceAll(',', '')))
    // Each worker has one group total followed by its only entry.
    expect(resolvedAmounts.filter((_, i) => i % 2 === 0).reduce((sum, value) => sum + value, 0)).toBe(exported.gross)
    expect(ledger.match(/>Escalated</g)).toHaveLength(1)
    expect(renderToStaticMarkup(createElement(PayRuns))).toContain('4 payouts, $360.00')
    renderToStaticMarkup(createElement(Payroll))
    expect(source.context).toHaveBeenLastCalledWith(expect.objectContaining({ selection: expect.objectContaining({ gross: exported.gross }) }), true)
    expect(resolutionGroups(c, {}).find(group => group.ruleId === 'CON-MARGIN-01')).toMatchObject({ state: 'escalated', owner: 'account manager', resolved: 200 })
    const findings = renderToStaticMarkup(createElement(FindingsCard, { cycleId: c.id }))
    expect(findings).toContain('>Escalated<')
    expect(findings).toContain('Escalated to account manager')
  })

  it('uses the immutable sent batch total and worker count including an adjustment-only worker', () => {
    const p = source.payload!
    p.batch = { id: 'b_sent', cycleId: p.cycle.id, destination: 'ADP', workers: 5, gross: 777.25, held: 2, createdAt: '2026-09-25T13:00:00Z' }
    const c = mount(p)
    expect(payTotals(c)).toMatchObject({ workerCount: 5, gross: 777.25 })
    expect(cycleStats(c)).toMatchObject({ payments: 5, gross: 777.25 })
    expect(renderToStaticMarkup(createElement(PayRuns))).toContain('5 payouts, $777.25')
    renderToStaticMarkup(createElement(Payroll))
    expect(source.context).toHaveBeenLastCalledWith(expect.objectContaining({ cycle: expect.objectContaining({ stats: expect.stringContaining('5 workers · $777.25 gross') }), selection: expect.objectContaining({ workers: 5, gross: 777.25 }) }), true)
  })

  it('keeps escalated automatic corrections in review instead of counting them as fixed', () => {
    const p = source.payload!
    p.results[2].rows[0].status = 'applied'
    p.decisions = [decision('CON-MARGIN-01', 'escalated')]
    const c = mount(p)
    expect(cycleStats(c)).toMatchObject({ agentResolved: 0, needsReview: 4 })
    const review = renderToStaticMarkup(createElement(ShiftTable, { cycle: c, filterMode: 'discrepancies', defaultFilter: 'needs-review', onSelect: vi.fn() }))
    expect(review).toContain('data-shift="s_2"')
    expect(review).toContain('>Escalated<')
    const fixed = renderToStaticMarkup(createElement(ShiftTable, { cycle: c, filterMode: 'discrepancies', defaultFilter: 'agent-resolved', onSelect: vi.fn() }))
    expect(fixed).not.toContain('data-shift="s_2"')
  })

  it('includes pending adjustments in every pay surface and ledger worker total before sending', () => {
    const p = source.payload!
    p.decisions = [decision('CA-MB-01', 'dismissed'), decision('CON-MARGIN-01', 'escalated')]
    p.adjustments = [{ id: 'dp_existing', cycleId: '2026-09-13', worker: 'Worker 0', hours: 1, amount: 20.005 },
      { id: 'dp_new', cycleId: '2026-09-13', worker: 'Worker 4', hours: 1.25, amount: 25.125 }]
    const disputes: JourneyDispute[] = p.adjustments.map(item => ({ id: item.id, cycleId: item.cycleId, worker: item.worker, status: 'adjusted', description: 'Verified hours', source: 'paste', createdAt: '',
      adjustment: { hours: item.hours, amount: item.amount, next_cycle_id: p.cycle.id } }))
    const c = mount(p), exported = buildExport(p as unknown as ServerPayload, p.decisions, disputes)
    expect(exported.gross).toBe(405.14)
    expect(batchPreview(p)).toMatchObject({ gross: exported.gross, workers: 5 })
    expect(batchPreview(p, disputes).gross).toBe(exported.gross)
    expect(payTotals(c)).toMatchObject({ gross: exported.gross, workerCount: 5 })
    expect(cycleStats(c)).toMatchObject({ gross: exported.gross, payments: 5 })
    const ledger = renderToStaticMarkup(createElement(Sheet, { cycle: c, shifts: c.run.shifts, groupBy: 'worker', days: c.days, onSelect: vi.fn() }))
    const headers = [...ledger.matchAll(/<tr class="grp">([\s\S]*?)<\/tr>/g)]
    const sum = headers.reduce((total, match) => total + Number(match[1].match(/pay-amounts-resolved"><span class="pay-amounts-value">\$([\d,.]+)<\/span>/)![1].replaceAll(',', '')), 0)
    expect(Number(sum.toFixed(2))).toBe(exported.gross)
    expect(ledger).toContain('data-adjustment="dp_existing"')
    expect(ledger).toContain('data-adjustment="dp_new"')
    expect(ledger).toContain('Adjustment for 2026-09-13')
    expect(renderToStaticMarkup(createElement(PayRuns))).toContain('5 payouts, $405.14')
    renderToStaticMarkup(createElement(Payroll))
    expect(source.context).toHaveBeenLastCalledWith(expect.objectContaining({ selection: expect.objectContaining({ workers: 5, gross: exported.gross }) }), true)
  })
})

describe('outbound evidence for Asked', () => {
  const thread = (): JourneyThread => ({ id: 'thread-1', cycleId: source.payload!.cycle.id, shiftId: 's_1', counterparty: { kind: 'site', name: 'Dana K.' }, status: 'waiting', createdAt: '',
    messages: [{ id: 'message-1', threadId: 'thread-1', dir: 'out', text: 'Confirm the clock-out.', status: 'not_sent_demo', at: '' }] })
  const waiting = (threads: JourneyThread[] = [], neverContact: string[] = []) => carouselFindings(source.payload!, { ...DEFAULTS, neverContact }, threads).find(item => item.group.ruleId === 'TS-COMPLETE')!

  it('does not invent outreach to a listed supervisor and honestly labels the entry destination', () => {
    expect(waiting().asked).toBeUndefined()
    const html = renderToStaticMarkup(createElement(FindingsCard, { cycleId: source.payload!.cycle.id }))
    expect(html).toContain('Not asked yet')
    // Missing clock-outs are not intake gaps; opening an entry does not promise an ask control.
    expect(html).toContain('View time entry')
    expect(html).not.toContain('Ask from an entry')
    expect(html).not.toContain('Review gaps')
    expect(html).not.toContain('Asked Dana')
  })
  it('requires non-draft outbound correspondence in this cycle and excludes never-contact people and sites', () => {
    const actual = thread()
    expect(waiting([actual]).asked).toBe('Dana K.')
    for (const messages of [[], [{ ...actual.messages[0], dir: 'in' as const }], [{ ...actual.messages[0], status: 'draft' as const }], [{ ...actual.messages[0], text: '  ' }]]) {
      expect(waiting([{ ...actual, messages }]).asked).toBeUndefined()
    }
    expect(waiting([{ ...actual, cycleId: '2026-09-13' }]).asked).toBeUndefined()
    expect(waiting([actual], ['DANA K']).asked).toBeUndefined()
    expect(waiting([actual], [source.payload!.sites[0].name]).asked).toBeUndefined()
  })
  it('does not borrow a supervisors different worker-day or dispute conversation', () => {
    const actual = thread()
    expect(waiting([{ ...actual, shiftId: 'another-shift' }]).asked).toBeUndefined()
    expect(waiting([{ ...actual, shiftId: null, counterparty: { ...actual.counterparty, gapIds: [`${source.payload!.sites[0].name}|Worker 1|6`] } }]).asked).toBeUndefined()
    expect(waiting([{ ...actual, disputeId: 'dp_paid-dispute' }]).asked).toBeUndefined()
    expect(waiting([{ ...actual, shiftId: null, counterparty: { ...actual.counterparty, gapIds: [`${source.payload!.sites[0].name}|Worker 1|0`] } }]).asked).toBe('Dana K.')
  })
  it('keeps a real allowed ask visible when the same rule also affects a blocked site', () => {
    const p = source.payload!
    p.sites.push({ ...p.sites[0], name: 'Blocked Site' })
    p.week[3].fac = 1
    p.results[3].rows = p.results[3].rows.map(row => ({ ...row, ruleId: 'TS-COMPLETE' }))
    mount(p)
    expect(waiting([thread()], ['Blocked Site']).asked).toBe('Dana K.')
  })
})
