import { readFileSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Intake } from '@/components/Intake'
import { OverlayProvider } from '@/components/shell/Overlay'
import { AuxProvider } from '@/components/shell/Aux'
import { Payroll } from '@/pages/Payroll'
import { ShiftPage } from '@/pages/ShiftPage'
import * as desk from '@/lib/desk'
import { hydrate, type CyclePayload, type FileRecord } from '@/lib/data'
import { cycleIntake } from '@/lib/intake'
import { journeyRead, type JourneyThread, type NextStep } from '@/lib/journey'
import { PayRuns } from '@/components/shell/PayRuns'
import { DEFAULTS } from '@/lib/onboarding'
import recorded from '@/lib/fixtures/server-cycle.json'

const payload = recorded.payload as unknown as CyclePayload
const step = (kind: NextStep['kind']): NextStep => ({ kind, label: kind === 'review' ? 'Review 1 issue' : kind === 'get_timesheets' ? 'Get timesheets' : 'Chase missing time', detail: 'Detail', counts: { missingSets: 0, gaps: 0, openGroups: 1 } })
const server = (kind: NextStep['kind']) => ({ ...hydrate(payload, DEFAULTS, recorded.files as FileRecord[]), nextStep: step(kind) })
function render(url: string, kind: NextStep['kind']) {
  const cycle = server(kind)
  vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] }, h(OverlayProvider, null, h(AuxProvider, null,
    h(Routes, null, h(Route, { path: '/payroll', element: h(Payroll) }))))))
}
const primaries = (html: string) => [...html.matchAll(/<button\b[^>]*class="[^"]*\bprimary\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map((match) => {
  // Action buttons reserve all three label widths; only the visible label is the action.
  const visible = match[1].match(/class="action-button-label" style="visibility:visible"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? match[1]
  return visible.replace(/<[^>]+>/g, '')
})
afterEach(() => { vi.restoreAllMocks() })

describe('H3: one black button per work pane, and it is the next step', () => {
  it('keeps Approve outlined in Review while the next step is Get timesheets or Chase missing time', () => {
    for (const kind of ['get_timesheets', 'chase_missing'] as const) {
      const html = render(`/payroll?cycle=${payload.cycle.id}&step=review`, kind)
      expect(html).toContain('>Approve 1<')
      expect(primaries(html)).toEqual([step(kind).label])
    }
  })
  it('gives the Collect pane the black next-step button', () => {
    expect(primaries(render(`/payroll?cycle=${payload.cycle.id}&step=intake`, 'get_timesheets'))).toEqual(['Get timesheets'])
  })
  it('makes Approve the black button once review is the next step, and outlines the row that points at it', () => {
    expect(primaries(render(`/payroll?cycle=${payload.cycle.id}&step=review`, 'review'))).toEqual(['Approve 1'])
    expect(primaries(render(`/payroll?cycle=${payload.cycle.id}&step=intake`, 'review'))).toEqual(['Review 1 issue'])
  })
})

describe('D15: the Collect pane shows who was asked', () => {
  it('counts asked gaps per client and names who was asked on each missing row, from persisted threads', () => {
    const cycle = { ...server('chase_missing'), start: new Date(2026, 8, 14) }
    // Every source last sent before the week, so each open entry reads as a missing row.
    cycle.intake = { ...cycle.intake!, sources: cycle.intake!.sources.map((source) => ({ ...source, lastReceived: '2026-10-01T00:00:00Z' })) }
    const open = cycle.intake!.expected.filter((entry) => !cycle.intake!.received.includes(`${entry.client}|${entry.worker}|${entry.day}`))
    const asked = open.slice(0, 2).map((entry) => `${entry.client}|${entry.worker}|${entry.day}`)
    const thread = (name: string, gapIds: string[], status: 'not_sent_demo' | 'draft'): JourneyThread => ({ id: `t_${name}`, cycleId: cycle.id, counterparty: { kind: 'worker', name, gapIds }, status: 'waiting', createdAt: '2026-09-25T12:00:00Z',
      messages: [{ id: `m_${name}`, threadId: `t_${name}`, dir: 'out', text: 'Did you work that day?', status, at: '2026-09-25T12:00:00Z' }] })
    const threads = [thread(open[0].worker, [asked[0]], 'not_sent_demo'), thread(open[1].worker, [asked[1]], 'not_sent_demo'), thread('Draft Only', [`${open[2].client}|${open[2].worker}|${open[2].day}`], 'draft')]
    const html = renderToStaticMarkup(h(MemoryRouter, null, h(OverlayProvider, null, h(Intake, { cycle, intake: cycleIntake(cycle, DEFAULTS), threads }))))
    expect(html).toMatch(/2 asked <span class="tag">Not Sent · Demo<\/span>/)
    expect(html).toContain(`Asked ${open[0].worker}`)
    expect(html).toContain(`Asked ${open[1].worker}`)
    expect(html).not.toContain('Asked Draft Only')
  })
})

describe('D17 / D19 layout rules', () => {
  const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  it('keeps the close button clear of the title actions, wraps values, and keeps group pills on one line at phone width', () => {
    const phone = css('../pages/shift-page.css').match(/@media \(max-width: 800px\) \{[^@]*first-child \.page-title-row[^@]*\}/)![0]
    expect(phone).toMatch(/\.page-title-row \{ padding-right: 3\.5rem; \}/)
    expect(phone).toMatch(/\.kv td:last-child, \.kv-via, \.kv-via > span:last-child \{ white-space: normal; overflow-wrap: anywhere; \}/)
    const narrow = css('../pages/reconcile.css').match(/@container payroll \(max-width: 640px\) \{[\s\S]*?\n\}/)![0]
    // Owner: a pill wrapped onto two lines reads as broken; it stays one line (ellipsis + title for rare overflow).
    expect(narrow).not.toMatch(/\.bucket-tag \{[^}]*white-space: normal/)
  })
  it('never paints a hovered nav item the same as the current page', () => {
    const shell = css('../components/shell/shell.css')
    const hover = shell.match(/\.sidebar \.sidebar-nav-item:hover \{([^}]*)\}/)![1]
    const active = shell.match(/\.sidebar \.sidebar-nav-item\.active \{([^}]*)\}/)![1]
    expect(hover.match(/background:[^;]+/)![0]).not.toBe(active.match(/background:[^;]+/)![0])
  })
})

describe('N8: an adjustment on a cycle with no time entries stays visible', () => {
  const skeleton: CyclePayload = { ...payload, cycle: { ...payload.cycle, id: '2026-09-27', start: '2026-09-21', end: '2026-09-27', status: 'in-progress' }, runId: null, runAt: null,
    sites: [], week: [], results: [], groups: [], extraGroups: [], gaps: [], counts: { set1: 0, set2: 0, set3: 0 }, intake: { sources: [], expected: [], received: [] },
    decisions: [], batch: null, nextStep: step('get_timesheets'), adjustments: [{ id: 'dp_1', cycleId: payload.cycle.id, worker: 'Ana Reid', hours: 0.1, amount: 2 }] }
  it('reads the detail for a list row with pending adjustments, then treats it as a cycle without time entries', () => {
    const row = { ...skeleton.cycle, sample: false, runAt: null, totals: null, counts: skeleton.counts, findings: 0, adjustments: { count: 1, amount: 2 } }
    expect(journeyRead({ loaded: true, list: [row], payloads: [] }, row.id)).toMatchObject({ running: true, empty: false })
    expect(journeyRead({ loaded: true, list: [row], payloads: [skeleton] }, row.id)).toMatchObject({ running: false, empty: true })
    expect(journeyRead({ loaded: true, list: [{ ...row, adjustments: undefined }], payloads: [] }, row.id)).toMatchObject({ running: false, empty: true })
  })
  it('shows "1 adjustment pending · +$2.00" in the Payroll pane and the pay-run rail', () => {
    const cycle = hydrate(skeleton, DEFAULTS)
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/payroll?cycle=${cycle.id}`] }, h(OverlayProvider, null, h(AuxProvider, null,
      h(PayRuns), h(Routes, null, h(Route, { path: '/payroll', element: h(Payroll) }))))))
    expect(html.match(/1 adjustment pending · \+\$2\.00/g)).toHaveLength(2)
    expect(html).not.toContain('No time entries yet</span>')
  })
})

describe('D20: pay-law corrections read as required by law, never as the agent acting on its own', () => {
  it('labels an applied California daily overtime or weekly overtime group from the engine bucket while autoFix is off', () => {
    const law = structuredClone(payload)
    law.results[0].rows.push({ ruleId: 'CA-OT-8', status: 'applied', kindDefault: 'det', note: 'Worked past 8 hours: 1h at time and a half', effect: { otPremiumMin: 30, dailyOtMin: 60 } })
    law.results[1].rows.push({ ruleId: 'FED-OT-40', status: 'applied', kindDefault: 'det', note: 'Worked past 40 hours this week', effect: { otPremiumMin: 30 } })
    law.results[2].rows.push({ ruleId: 'CS-16H', status: 'applied', kindDefault: 'det', note: 'Held the hours past 16', effect: { holdMin: 30 } })
    expect(DEFAULTS.authorityConfigured).toBe(false) // nothing is authorized: every discretionary fix waits for approval
    const cycle = { ...hydrate(law, DEFAULTS, recorded.files as FileRecord[]), nextStep: step('review') }
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/payroll?cycle=${cycle.id}&step=review`] }, h(OverlayProvider, null, h(AuxProvider, null,
      h(Routes, null, h(Route, { path: '/payroll', element: h(Payroll) }))))))
    const lines = [...html.matchAll(/<span class="decision-line"[^>]*>([^<]*)<\/span>/g)].map((match) => match[1])
    expect(lines).toContain('California daily overtime · Required by law · applied')
    expect(lines).toContain('Weekly overtime · Required by law · applied')
    expect(lines.filter((line) => /Required by law/.test(line) && /by the agent/.test(line))).toEqual([])
    // A discretionary (non-law) automatic correction keeps its own wording.
    expect(lines.some((line) => line.endsWith('· by the agent') && !/overtime/i.test(line))).toBe(true)
  })
  it('files the FLSA workweek rule (overnight entries belong to the week they started) as law', async () => {
    const { RULES } = await import('@/bench/engine')
    expect(RULES.find((rule: { id: string }) => rule.id === 'SRC-WEEK-01')?.bucket).toBe('Legal')
  })
})

describe('N10: a judgment call is escalated from the time-entry sheet, never approved', () => {
  it('offers Escalate for a negative-margin entry, the same decision the pane offers', () => {
    const margin = structuredClone(payload)
    const index = margin.results.findIndex((result) => !result.held && !result.rows.some((row) => row.status === 'flag' || row.status === 'held'))
    margin.results[index].rows.push({ ruleId: 'CON-MARGIN-01', status: 'flag', kindDefault: 'det', note: 'Bill rate is below pay plus 20% employer burden' })
    margin.results[index].flagged = true
    const cycle = { ...hydrate(margin, DEFAULTS, recorded.files as FileRecord[]), nextStep: step('review') }
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/payroll/${margin.week[index].id}?cycle=${cycle.id}`] }, h(OverlayProvider, null, h(AuxProvider, null,
      h(Routes, null, h(Route, { path: '/payroll', element: h(Payroll) }, h(Route, { path: ':shiftId', element: h(ShiftPage) })))))))
    expect(html).toContain('>Escalate 1 issues<')
    expect(html).not.toMatch(/>Approve \d+ issues</)
  })
})


describe('Payroll waits for the account data', () => {
  it.each(['loading', 'failed', 'detail-failed'] as const)('does not render an empty pane or missing-set CTA while %s', phase => {
    const cycle = server('get_timesheets')
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle, loaded: phase === 'detail-failed', loading: phase === 'loading', error: phase === 'failed' ? 'Unavailable' : null, cycleErrors: phase === 'detail-failed' ? { [cycle.id]: 'Unavailable' } : {} })
    const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: ['/payroll'] }, h(OverlayProvider, null, h(AuxProvider, null, h(Payroll)))))
    expect(html).not.toMatch(/Get timesheets|No time entries|missing sets|intake-upload-bar/)
    expect(html).toContain(phase === 'loading' ? 'data-skeleton="review"' : 'Retry')
  })
})
