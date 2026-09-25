import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayProvider } from '@/components/shell/Overlay'
import { AuxProvider } from '@/components/shell/Aux'
import { PayRuns } from '@/components/shell/PayRuns'
import { Payroll } from '@/pages/Payroll'
import { Settings } from '@/pages/Settings'
import { Sheet } from '@/components/Sheet'
import { ShiftPage } from '@/pages/ShiftPage'
import { fmtHM, money, RULES, type RunShift } from '@/bench/engine.js'
import { PROV } from '@/bench/prov'
import { SOURCES } from '@/bench/vendors'
import { buildCycles, kinds, cycleStats } from '@/lib/desk'
import { resolutionGroups } from '@/lib/resolution'
import * as desk from '@/lib/desk'
import * as onboarding from '@/lib/onboarding'
import { DEFAULTS } from '@/lib/onboarding'
import { defaultThreadParty, recordThreadAction } from '@/lib/threads'

const today = new Date(2026, 8, 22, 12)
function render(url: string) {
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] }, h(OverlayProvider, null, h(AuxProvider, null,
    h(Routes, null,
      h(Route, { path: '/payroll', element: h(Payroll) },
        h(Route, { path: ':shiftId', element: h(ShiftPage) })),
      h(Route, { path: '/settings', element: h(Settings) }),
    ),
  ))))
}
function renderSidebar(url: string) {
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] },
    h('aside', { 'aria-label': 'Primary sidebar' }, h(PayRuns)),
  ))
}
const rowIds = (html: string) => [...html.matchAll(/data-shift="([^"]+)"/g)].map((match) => match[1])
// Every cycle is listed together; there are no Upcoming/Completed filters.
const allCycles = () => buildCycles(DEFAULTS, today).map((item) => item.id)
// Sheet mounts worker groups 40 at a time, so server HTML holds only the first chunk.
const CHUNK = 40
const chunkWorkers = (shifts: RunShift[]) => [...new Set(shifts.map((rs) => rs.shift.worker))].slice(0, CHUNK)
const firstChunk = (shifts: RunShift[]) => {
  const workers = new Set(chunkWorkers(shifts))
  return shifts.filter((rs) => workers.has(rs.shift.worker)).map((rs) => rs.shift.id)
}
const sentinel = '<tr aria-hidden="true"><td colSpan="7"></td></tr>'
const cycleIds = (html: string) => [...html.matchAll(/data-cycle="([^"]+)"/g)].map((match) => match[1])
const selectedCycles = (html: string) => [...html.matchAll(/<button\b[^>]*>/g)]
  .filter((match) => match[0].includes('aria-pressed="true"'))
  .flatMap((match) => [...match[0].matchAll(/data-cycle="([^"]+)"/g)].map((cycle) => cycle[1]))
const shiftTable = (html: string) => html.match(/<table\b[^>]*aria-label="Time entries by worker"[\s\S]*?<\/table>/)?.[0]
const textHtml = (value: string) => renderToStaticMarkup(h('span', null, value)).slice(6, -7)
const payAmounts = (html: string) => [...html.matchAll(/<span class="pay-amounts-(current|resolved)"><span class="pay-amounts-value">([^<]*)<\/span><span class="pay-amounts-caption">([^<]*)<\/span><\/span>/g)]
  .map((match) => [match[1], match[2], match[3]])
// Review is the summary's own rows, limited to Approve, Waiting on a Reply and Needs Judgment.
const bucketCards = (html: string) => [...html.matchAll(/<div class="decision" data-rule="[^"]+">[\s\S]*?(?=<div class="decision" |<\/section>)/g)].map((match) => match[0])
const bucketRules = (html: string) => [...new Set(bucketCards(html).map((card) => card.match(/data-rule="([^"]+)"/)![1]))].sort()
const ruleIds = (items: { ruleId: string }[]) => [...new Set(items.map((item) => item.ruleId))].sort()
// The cycle summary is one StatRow: `.stat` cells, label over value; selectable cells are pressed buttons.
// Disputes is the final cell, a plain inert tile; earlier cells can contain accessory wrappers.
const summary = (html: string) => html.match(/<div class="result-summary" aria-label="Cycle summary">[\s\S]*?<div class="lbl">Disputes<\/div><div class="stat-value">[\s\S]*?<\/div>/)![0]
const metrics = (html: string) => [...summary(html).matchAll(/<(button|div)\b([^>]*class="stat(?: [^"]*)?"[^>]*)><div class="lbl">(.*?)<\/div><div class="stat-value">(.*?)<\/div>/g)].map((match) => ({
  element: match[1],
  label: match[3],
  value: match[4],
  tone: match[2].match(/class="stat ([^"]+)"/)?.[1],
  title: match[2].match(/title="([^"]+)"/)?.[1],
  pressed: match[2].match(/aria-pressed="([^"]+)"/)?.[1],
  selected: match[2].includes('aria-pressed="true"'),
  disabled: match[2].includes('disabled=""'),
}))
const selectedMetrics = (html: string) => metrics(html).filter((metric) => metric.selected).map((metric) => metric.label)
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('Payroll review composition', () => {
  it('keeps only one black approval action in the Payroll review pane', () => {
    vi.useFakeTimers().setSystemTime(today)
    const html = render('/payroll?step=review')
    expect([...html.matchAll(/<button\b[^>]*class="[^"]*\bprimary\b[^"]*"/g)]).toHaveLength(1)
  })

  it('renders server decision metadata without fabricated legacy mediation activity', () => {
    vi.useFakeTimers().setSystemTime(today)
    const original = buildCycles(DEFAULTS, today)[0]
    const rs = original.run.shifts.find((item) => item.rows.some((row) => row.status === 'flag'))!
    const ruleId = rs.rows.find((row) => row.status === 'flag')!.ruleId
    const at = '2026-09-22T14:35:00Z'
    const cycle = { ...original, server: true, decisions: [{ id: 'decision-server', cycleId: original.id, groupId: ruleId, shiftIds: [], decision: 'dismissed' as const, reason: 'Verified against the approved client file', by: 'user' as const, at }] }
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    const html = render(`/payroll/${rs.shift.id}?cycle=${cycle.id}&step=review`)
    const audit = html.slice(html.indexOf('aria-label="Time entry rules and trail"'))
    expect(audit).toContain('class="tag">Dismissed</span>')
    expect(audit).toContain(`dateTime="${at}"`)
    expect(audit).toContain('Verified against the approved client file')
    expect(audit).not.toContain('>Ingested</span>')
    expect(audit).not.toContain('>Sent</span>')
    expect(audit).not.toContain('Time not recorded')
  })
  it('replaces the payments table with the summary rows for every pending kind in Review and keeps cycle navigation', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycles = buildCycles(DEFAULTS, today)
    const cycle = cycles[0]
    const groups = kinds(cycle, {}, cycles)
    const html = render(`/payroll?cycle=${cycle.id}&filter=needs-review`)
    const sidebar = renderSidebar(`/payroll?cycle=${cycle.id}&filter=needs-review`)
    expect(groups.length).toBeGreaterThan(0)
    expect(bucketRules(html)).toEqual(ruleIds(groups))
    expect(rowIds(html)).toEqual([])
    expect(html).not.toContain('<table')
    expect(html).not.toContain('aria-label="Flags"')
    expect(html).not.toContain('class="grp"')
    expect(html).not.toContain('aria-label="Flagged shifts by rule"')
    expect(html).not.toContain('Decide once per kind')
    expect(html).not.toContain('class="aux"')
    expect(html).not.toContain('Approve cycle')
    expect(html).not.toContain('All shifts')
    expect(html).not.toContain('flags-head')
    expect(html).not.toContain('reconcile-info')
    expect(html).not.toContain('Cutoff')
    expect(html).not.toContain('class="chips"')
    expect(html).not.toContain('aria-label="Search flags"')
    expect(html).not.toContain('aria-label="Search"')
    expect(html).not.toContain('class="toolbar reconcile-toolbar"')
    expect(html).not.toContain('sheet-group-row')
    expect(html).not.toContain('aria-label="Pay cycles"')
    expect(sidebar).toContain('aria-label="Pay cycles"')
    expect(cycleIds(sidebar)).toEqual(allCycles())
    expect(selectedCycles(sidebar)).toEqual([cycle.id])
    expect(selectedMetrics(html)).toEqual(['Review'])
  })

  it('shows unsigned deltas with the approved direction colors', () => {
    vi.useFakeTimers().setSystemTime(today)
    // The pending cycle's first chunk of workers happens to be all overpay; pick one of each direction.
    const cycle = buildCycles(DEFAULTS, today)[1]
    const owed = cycle.run.shifts.find((rs) => rs.pay - rs.naive > 0.005)!
    const overpay = cycle.run.shifts.find((rs) => rs.naive - rs.pay > 0.005)!
    const html = renderToStaticMarkup(h(Sheet, { cycle, shifts: [owed, overpay], groupBy: 'worker', onSelect: vi.fn(), days: cycle.days }))
    const deltas = [...html.matchAll(/<td class="[^"]*pay-delta ([^"]*)"[^>]*>(.*?)<\/td>/g)]
    expect(deltas.some((match) => match[1] === 'owed')).toBe(true)
    expect(deltas.some((match) => match[1] === 'overpay')).toBe(true)
    for (const delta of deltas) expect(delta[2]).not.toMatch(/[+−-]/)
  })

  it('opens on the pending cycle with every cycle in one list and the server Send to Payroll next step', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycles = [...buildCycles(DEFAULTS, today)]
    cycles[1] = { ...cycles[1], nextStep: { kind: 'send', label: 'Send to Payroll', detail: 'Ready to send', counts: { missingSets: 0, gaps: 0, openGroups: 0 } } }
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles, current: cycles[0], byId: (id) => cycles.find((cycle) => cycle.id === id) })
    const html = render('/payroll?filter=all')
    const sidebar = renderSidebar('/payroll?filter=all')
    expect(html).not.toContain('aria-label="Flags"')
    expect(html).not.toContain('Approve cycle')
    expect(html).toContain('Send to Payroll')
    const nextStep = html.match(/<div class="journey-next-step"[\s\S]*?<\/button><\/div>/)![0]
    expect(nextStep.match(/<button\b/g)).toHaveLength(1)
    expect(nextStep).not.toContain('primary')
    expect(html).not.toMatch(/Review \d+ discrepancies/)
    expect(html).not.toContain('aria-label="Search"')
    expect(html).not.toContain('aria-label="Search time entries"')
    expect(html).not.toContain('aria-label="Payroll destination"')
    expect(html).not.toContain('Connection settings')
    expect(html).not.toContain('aria-label="Pay cycles"')
    expect(html).not.toContain('queue flags-pane pay-cycles-pane')
    expect(sidebar).toContain('aria-label="Pay cycles"')
    expect(sidebar).toContain('queue flags-pane pay-cycles-pane')
    expect(sidebar).not.toContain('aria-label="Search pay cycles"')
    expect(sidebar).not.toContain('aria-label="Show cycles"')
    expect(sidebar).not.toMatch(/>(Upcoming|Completed)<\/button>/)
    expect(cycleIds(sidebar)).toEqual(allCycles())
    expect(selectedCycles(sidebar)).toEqual([cycles[1].id])
    expect(rowIds(html).sort()).toEqual(firstChunk(cycles[1].run.shifts).sort())
    expect(html).toContain(sentinel)
    expect([...html.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((match) => match[1])).toEqual(['Day', 'Worker', 'Site', 'Hours', 'Pay', 'Delta', 'Status'])
    expect(html).toContain('class="grp"')
    expect(html).toContain('sheet-group-row')
    expect(html).not.toContain('sheet-group-meta')
    const workerGroups = chunkWorkers(cycles[1].run.shifts).map((worker) => cycles[1].run.shifts.filter((row) => row.shift.worker === worker))
    const workerHeaders = [...html.matchAll(/<tr class="grp">([\s\S]*?)<\/tr>/g)].map((match) => match[1])
    expect(workerHeaders).toHaveLength(workerGroups.length)
    workerGroups.forEach((rows, index) => {
      const header = workerHeaders[index]
      const label = textHtml(`${rows[0].shift.worker} · ${rows[0].shift.role}`)
      const hours = fmtHM(rows.reduce((sum, row) => sum + row.payableMin, 0))
      const cells = [...header.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)]
      expect(cells).toHaveLength(5)
      expect(cells[0][1]).toContain('scope="rowgroup" colSpan="3"')
      expect(cells[0][2]).toContain(`<span class="sheet-group-title fade-trunc" title="${label}">${label}</span>`)
      expect(cells[0][2]).not.toContain('class="count"')
      expect(cells[1][1]).toContain('class="num mono sheet-hours"')
      expect(cells[1][2]).toBe(hours)
      expect(cells[2][2]).toContain('pay-amounts')
      const delta = rows.reduce((sum, row) => sum + row.pay, 0) - rows.reduce((sum, row) => sum + row.naive, 0)
      const tone = Math.abs(delta) < 0.005 ? '' : delta > 0 ? 'owed' : 'overpay'
      expect(cells[3][1]).toContain(`class="num mono pay-delta ${tone}"`)
      expect(cells[3][2]).toBe(money(Math.abs(delta)))
      expect(cells[4][2]).toBe('')
      expect(payAmounts(header)).toEqual([
        ['current', money(rows.reduce((sum, row) => sum + row.naive, 0)), 'Current'],
        ['resolved', money(rows.reduce((sum, row) => sum + row.pay, 0)), 'Resolved'],
      ])
    })
    expect(html).not.toContain('class="bucket-card"')
    expect(html).not.toContain('aria-label="Worker pay run"')
    expect(html).not.toContain('class="aux"')
    expect(html).not.toContain('rail-layout')
    expect(html).toContain('<h2>Payroll</h2>')
    expect(html).toContain('aria-label="About Payroll"')
  })

  it('shows Review in the summary design: only what a person acts on, each row with its amounts and action', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycles = buildCycles(DEFAULTS, today)
    const cycle = cycles[0]
    const pendingRules = [...new Set(cycle.run.shifts.flatMap((shift) => shift.rows
      .filter((row) => row.status === 'flag' || row.status === 'held').map((row) => row.ruleId)))].sort()
    const html = render(`/payroll?cycle=${cycle.id}&filter=needs-review`)
    expect(bucketRules(html)).toEqual(pendingRules)
    const groups = resolutionGroups(cycle, {}).filter((group) => group.state !== 'fixed')
    const titles = { proposed: 'Approve', waiting: 'Waiting on a Reply', judgment: 'Needs Judgment' } as const
    // Only categories with something in them are shown.
    expect([...html.matchAll(/<h3 id="summary-[^"]+">([^<·]+) ·/g)].map((match) => match[1].trim()))
      .toEqual((['proposed', 'waiting', 'judgment'] as const).filter((state) => groups.some((group) => group.state === state)).map((state) => titles[state]))
    expect(html).not.toContain('By Client')
    const proposedTotal = groups.filter((group) => group.state === 'proposed').reduce((sum, group) => sum + group.cases.length, 0)
    // The category's action sits in its header, not in the rows.
    if (proposedTotal) expect(html).toContain(`>Approve ${proposedTotal.toLocaleString()}</button>`)
    const cards = bucketCards(html)
    expect(cards).toHaveLength(groups.length)
    groups.forEach((group, index) => {
      const card = cards[index]
      expect(card).toContain(`data-rule="${group.ruleId}"`)
      expect(card).toContain(`class="pay-amounts-value">${money(group.current)}</span><span class="pay-amounts-caption">Current</span>`)
      expect(card).toContain(`class="pay-amounts-value">${money(group.resolved)}</span><span class="pay-amounts-caption">Resolved</span>`)
      expect(card).not.toMatch(/>Approve \d/)
      // The correction sits with the cases, not in the row.
      expect(card).not.toContain('Tell the Agent')
    })
  })

  it.each([
    ['CS-16H', 'Over-Length Day'], ['CS-OVLP', 'Overlap'], ['CA-SS-01', 'Split Day'], ['CON-MIN-4H', 'Minimum Pay'],
  ])('names pending %s buckets %s', (ruleId, label) => {
    vi.useFakeTimers().setSystemTime(today)
    const original = buildCycles(DEFAULTS, today)[0]
    const rs = original.run.shifts.find((row) => row.rows.some((item) => item.ruleId === ruleId && item.status !== 'na'))!
    // Normally automatic rules also use the new names if a finding needs a decision.
    const pending = { ...rs, rows: [{ ...rs.rows.find((row) => row.ruleId === ruleId)!, status: 'flag' as const }] }
    const cycle = { ...original, week: [pending.shift], run: { ...original.run, shifts: [pending] } }
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    const html = render(`/payroll?cycle=${cycle.id}&filter=needs-review`)
    expect(bucketRules(html)).toEqual([ruleId])
    expect(bucketCards(html)[0]).toContain(`>1 ${label}</span>`)
  })

  it('shows the completed Review message without cards or empty tables after every case is resolved', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[0]
    const resolutions = { [cycle.id]: Object.fromEntries(cycle.run.shifts.map((shift) => [shift.shift.id, 'applied' as const])) }
    vi.spyOn(onboarding, 'useOnboarding').mockReturnValue([{ ...DEFAULTS, resolutions }, vi.fn()])
    const html = render(`/payroll?cycle=${cycle.id}&filter=needs-review`)
    expect(html).not.toContain('aria-label="Flags"')
    expect(bucketCards(html)).toEqual([])
    // Every category is empty, so none is shown.
    expect(html).not.toMatch(/<h3 id="summary-/)
    expect(html).not.toContain('summary-fixed')
    expect(metrics(html).find((metric) => metric.label === 'Review')).toMatchObject({ value: '0', selected: true })
    expect(rowIds(html)).toEqual([])
    expect(html).not.toContain('No shifts match.')
    expect(html).not.toContain('<table')
  })

  it('resolves prior-cycle shift routes and shows the complete audit column without a thread', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[2]
    const rs = cycle.run.shifts.find((row) => !row.flagged && !row.held)!
    const html = render(`/payroll/${rs.shift.id}?cycle=${cycle.id}`)
    expect(html).toContain('aria-label="Time entry evidence"')
    expect(html).toContain('aria-label="Time entry conversation"')
    expect(html).toContain('aria-label="Time entry rules and trail"')
    expect(html).not.toContain('Nothing has been sent on this shift yet.')
    expect(html).not.toContain('No decision has been recorded for this shift.')
    expect(html).not.toContain('aria-label="Recorded decision"')
    expect(html).toContain(rs.shift.worker)
    expect(html).not.toContain('Shift not found')
  })

  it('omits the audit pane when a shift has no trail, decision or fired rule sources', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[1]
    const original = cycle.run.shifts.find((row) => !row.flagged && !row.held)!
    const rs = { ...original, rows: [] }
    const withoutAudit = { ...cycle, week: [rs.shift], run: { ...cycle.run, shifts: [rs] } }
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [withoutAudit], current: withoutAudit, byId: () => withoutAudit })
    const html = render(`/payroll/${rs.shift.id}?cycle=${cycle.id}`)
    expect(html).toContain('aria-label="Time entry evidence"')
    expect(html).not.toContain('aria-label="Time entry rules and trail"')
    expect(html).not.toContain('aria-label="Rule source documents"')
    expect([...html.matchAll(/class="shift-page-column(?: shift-conversation)?"/g)]).toHaveLength(2)
  })

  it('lists each fired rule once, as the rule and its source, only in the Rules Applied column', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[0]
    const rs = cycle.run.shifts.find((row) => row.rows.some((rule) => rule.status === 'flag') && row.rows.some((rule) => rule.status === 'applied'))!
    const fired = rs.rows.filter((row, index, all) => ['flag', 'held', 'applied'].includes(row.status)
      && all.findIndex((other) => other.ruleId === row.ruleId) === index)
    const primaryRuleId = fired.at(-1)!.ruleId
    const html = render(`/payroll/${rs.shift.id}?cycle=${cycle.id}&filter=needs-review&flag=${primaryRuleId}`)
    const evidence = html.slice(html.indexOf('<section class="shift-page-column" aria-label="Time entry evidence"'), html.indexOf('<section class="shift-page-column shift-conversation"'))
    const rules = html.match(/<aside\b[^>]*aria-label="Time entry rules and trail"[\s\S]*?<\/aside>/)![0]
    expect(evidence).toContain(`<h2>${textHtml(rs.shift.worker)} · ${textHtml(cycle.days[rs.shift.day])}</h2>`)
    expect(evidence).not.toContain('class="rule-applied"')
    expect(evidence).not.toContain('class="fired"')
    expect(evidence).not.toMatch(/>Fired<|>Rules applied<|>Rules Applied</)
    expect(rules).toContain('<div class="aux-head">Rules Applied</div>')
    const entries = [...rules.matchAll(/<div class="rule-applied">[\s\S]*?<\/div>/g)].map((match) => match[0])
    expect(entries).toHaveLength(fired.length)
    const ordered = [...fired].sort((a, b) => Number(b.ruleId === primaryRuleId) - Number(a.ruleId === primaryRuleId))
    for (const [index, row] of ordered.entries()) {
      const entry = entries[index]
      const rule = RULES.find((item) => item.id === row.ruleId)!
      expect(entry).toContain(textHtml(rule.sentence))
      const source = entry.match(/<button\b[^>]*class="[^"]*rule-applied-source"[^>]*>([\s\S]*?)<\/button>/)![1]
      expect(source.replace(/<[^>]*>/g, '')).toBe(textHtml(PROV[row.ruleId]?.doc ?? rule.source.doc))
      // Only the rule and its source: the engine's finding note is not shown here.
      expect(entry).not.toContain(textHtml(row.note))
    }
  })

  it.each(['applied', 'dismissed'] as const)('removes Flagged from decided rule items while retaining the %s decision', (decision) => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[0]
    const rs = cycle.run.shifts.find((row) => row.held)!
    const resolutions = { [cycle.id]: { [rs.shift.id]: decision } }
    vi.spyOn(onboarding, 'useOnboarding').mockReturnValue([{ ...DEFAULTS, resolutions }, vi.fn()])
    const html = render(`/payroll/${rs.shift.id}?cycle=${cycle.id}`)
    const rules = html.match(/<aside\b[^>]*aria-label="Time entry rules and trail"[\s\S]*?<\/aside>/)![0]
    const recorded = rules.match(/<section\b[^>]*aria-label="Recorded decision"[\s\S]*?<\/section>/)![0]
    expect(recorded).toContain('>Decision</div>')
    expect(recorded).toContain(`<span class="tag">${decision === 'applied' ? 'Applied' : 'Not an Issue'}</span>`)
    expect(rules).toContain('class="rule-applied"')
    expect(rules).not.toContain('<span class="tag amber">Flagged</span>')
  })

  it('opens legacy review links as a standalone payment with conversation and an agent trace', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[0]
    const group = kinds(cycle, {}).find((item) => item.cases.length > 1 && item.cases.some((item) => item.status === 'flag'))!
    const cases = group.cases.map((item) => item.shiftId)
    const query = new URLSearchParams({ cycle: cycle.id, flag: group.ruleId, agent: '1', filter: 'needs-review', review: 'done', cases: cases.join(',') })
    const html = render(`/payroll/${cases[1]}?${query}`)
    expect(html).not.toMatch(/Case \d+ of \d+|All cases in this review|Review what was skipped/)
    expect(html).toContain('Pending outbound draft')
    expect(html).toContain('class="agent-trace"')
    expect(html).toContain('class="tag agent-trace-action">Ingested</span>')
    expect(html).toContain('class="tag agent-trace-action">Drafted</span>')
    expect(html).not.toContain('class="shift-trail-list"')
    expect(html).not.toContain('class="thread-trail')
    expect(bucketRules(html)).toEqual(ruleIds(kinds(cycle, {})))
    expect(shiftTable(html)).toBeUndefined()
    expect(html).toContain('aria-label="Close time entry"')
    expect(html).toContain('class="shift-modal open"')
    // Export file names and row numbers are not shown anywhere in the UI any more.
    expect(html).not.toContain('row 5')
    expect(html).not.toMatch(/\.csv/)
    expect(html).not.toContain('$0.00 payable')
    expect(html).toContain('class="shift-action-bar"')
    const actionBar = html.slice(html.indexOf('class="shift-action-bar"'))
    expect(actionBar.indexOf('pay-amounts')).toBeLessThan(actionBar.indexOf('class="actions"'))
    expect(actionBar).not.toMatch(/[+−]\$/)
  })

  it('restores both recipients actions once and retains the resolution in the audit timeline', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[0]
    const rs = cycle.run.shifts.find((row) => row.flagged || row.held)!
    const key = `${cycle.id}:${rs.shift.id}`
    const legacyParty = defaultThreadParty({ ...cycle, rememberedRuleIds: [] }, rs)
    const otherParty = legacyParty === 'worker' ? 'facility' : 'worker'
    const sentAt = '2026-09-22T11:00:00.000Z'
    const otherAt = '2026-09-22T11:05:00.000Z'
    const resolvedAt = '2026-09-22T11:10:00.000Z'
    const sent = recordThreadAction(undefined, { type: 'send', text: 'Please confirm the time', at: sentAt, draft: true })
    const otherSent = recordThreadAction(undefined, { type: 'send', text: 'Please confirm the record', at: otherAt })
    vi.spyOn(onboarding, 'useOnboarding').mockReturnValue([{ ...DEFAULTS,
      mediation: { [key]: sent, [`${key}:${otherParty}`]: otherSent },
      resolutions: { [cycle.id]: { [rs.shift.id]: 'applied' } },
      decisionTimes: { [key]: resolvedAt },
    }, vi.fn()])
    const html = render(`/payroll/${rs.shift.id}?cycle=${cycle.id}`)
    const trail = html.match(/<ol class="agent-trace"[\s\S]*?<\/ol>/)![0]
    expect([...trail.matchAll(/class="tag agent-trace-action">Sent<\/span>/g)]).toHaveLength(2)
    expect([...trail.matchAll(/class="tag agent-trace-action">Ingested<\/span>/g)]).toHaveLength(1)
    expect(trail).toContain(`dateTime="${sentAt}"`)
    expect(trail).toContain(`dateTime="${otherAt}"`)
    expect(trail).toContain('class="tag agent-trace-action">Resolved</span>')
    expect(trail).toContain('Payroll adjustment approved')
    expect(trail.indexOf(sentAt)).toBeLessThan(trail.indexOf(otherAt))
    expect(trail.indexOf(otherAt)).toBeLessThan(trail.indexOf(resolvedAt))
  })
})


describe('payroll and settings separation', () => {
  it('keeps all cycles visible when opening a historical cycle and uses its actual shifts', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycles = buildCycles(DEFAULTS, today)
    const cycle = cycles[2]
    const html = render(`/payroll?cycle=${cycle.id}&filter=all`)
    const sidebar = renderSidebar(`/payroll?cycle=${cycle.id}&filter=all`)
    expect(html).toContain('aria-label="Time entries by worker"')
    expect(html).toContain('class="grp"')
    expect(rowIds(html).sort()).toEqual(firstChunk(cycle.run.shifts).sort())
    expect(selectedCycles(sidebar)).toEqual([cycle.id])
    expect(cycleIds(sidebar)).toEqual(allCycles())
    expect(html).toContain(cycle.label)
    expect(html).not.toContain('aria-label="Worker pay run"')
    expect(html).not.toContain('<tfoot>')
    expect(bucketCards(html)).toEqual([])
    expect(metrics(html).find((metric) => metric.label === 'Disputes')).toMatchObject({
      element: 'div', value: '\u00a0', disabled: false, title: undefined, pressed: undefined,
    })
    expect(selectedMetrics(html)).toEqual(['Payments'])
  })

  it('shows engine-derived KPIs without Gross and with Review as the bucket entry point', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[0]
    const { payments, total, agentResolved, needsReview } = cycleStats(cycle)
    const html = render(`/payroll?cycle=${cycle.id}&agent=1&filter=all`)
    expect(metrics(html).map(({ element, label, value, tone, pressed, disabled }) => [element, label, value, tone, pressed, disabled])).toEqual([
      ['button', 'Payments', payments.toLocaleString(), undefined, 'true', false],
      ['button', 'Discrepancies', total.toLocaleString(), undefined, 'false', false],
      ['button', 'Resolved', agentResolved.toLocaleString(), undefined, 'false', false],
      ['button', 'Review', needsReview.toLocaleString(), 'flagged', 'false', false],
      ['div', 'Disputes', '\u00a0', undefined, undefined, false],
    ])
    expect(metrics(html).find((metric) => metric.label === 'Disputes')!.title).toBeUndefined()
    expect(html).not.toContain('cycle-kpi')
    expect(html).not.toMatch(/Review \d+ discrepancies/)
    expect(html.indexOf('class="result-summary"')).toBeLessThan(html.indexOf('aria-label="Time entries by worker"'))
    expect(html).not.toContain('class="chips"')
    expect(html).not.toContain('class="toolbar reconcile-toolbar"')
  })

  it('makes Payments the all-payments filter and omits Gross from every filtered summary', () => {
    vi.useFakeTimers().setSystemTime(today)
    for (const filter of ['all', 'total', 'agent-resolved', 'needs-review']) {
      const html = render(`/payroll?filter=${filter}`)
      expect.soft(metrics(html).slice(0, 1).map(({ label, element, pressed }) => [label, element, pressed]), filter).toEqual([
        ['Payments', 'button', String(filter === 'all')],
      ])
      expect(metrics(html).map(({ label }) => label)).not.toContain('Gross')
    }
    // Old list links open Payments.
    expect(selectedMetrics(render('/payroll?view=list'))).toEqual(['Payments'])
    // Review without a filter lands on Discrepancies: the grouped summary, not a table.
    const landing = render('/payroll?step=review')
    expect(selectedMetrics(landing)).toEqual(['Discrepancies'])
    expect(landing).toMatch(/Approve ·[\s\S]*Waiting on a Reply ·[\s\S]*Needs Judgment ·[\s\S]*Fixed ·[\s\S]*By Client/)
    expect(shiftTable(landing)).toBeUndefined()
    // A bare visit opens on Collect, so no stats row yet.
    expect(render('/payroll')).not.toContain('aria-label="Cycle summary"')
  })

  it('restores the selected KPI filter from the URL and ignores a stale search term', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[0]
    for (const filter of ['all', 'total', 'agent-resolved'] as const) {
      for (const query of ['', cycle.week[0].worker]) {
        const params = new URLSearchParams({ cycle: cycle.id, filter, ...(query ? { q: query } : {}) })
        const html = render(`/payroll?${params}`)
        const expected = cycle.run.shifts.filter((shift) => {
          const corrected = shift.rows.some((row) => row.status === 'applied' && row.effect)
          return filter === 'all' || filter === 'agent-resolved' && corrected
        })
        // Payments and Resolved are tables; Discrepancies is the grouped summary.
        expect(rowIds(html).sort(), `${filter}: ${query}`).toEqual(filter === 'total' ? [] : firstChunk(expected).sort())
        expect(selectedMetrics(html)).toEqual([{ all: 'Payments', total: 'Discrepancies', 'agent-resolved': 'Resolved' }[filter]])
        if (filter === 'total') expect(bucketCards(html).length).toBeGreaterThan(0)
        else expect(bucketCards(html)).toEqual([])
        expect(html).not.toContain('class="chips"')
      }
    }
  })

  it('moves resolved findings out of Review buckets and reflects the saved decision in every KPI', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[0]
    const group = kinds(cycle, {})[0]
    const decided = new Set(group.cases.map((item) => item.shiftId))
    const resolutions = { [cycle.id]: Object.fromEntries([...decided].map((id) => [id, 'applied' as const])) }
    vi.spyOn(onboarding, 'useOnboarding').mockReturnValue([{ ...DEFAULTS, resolutions }, vi.fn()])
    const { total, agentResolved: resolved, needsReview: unresolved } = cycleStats(cycle, resolutions)
    const html = render(`/payroll?cycle=${cycle.id}&filter=needs-review`)
    expect(metrics(html).slice(1, 4).map(({ label, value }) => [label, value])).toEqual([
      ['Discrepancies', total.toLocaleString()], ['Resolved', resolved.toLocaleString()], ['Review', unresolved.toLocaleString()],
    ])
    const remaining = kinds(cycle, resolutions)
    expect(remaining.length).toBeGreaterThan(0)
    expect(bucketRules(html)).toEqual(ruleIds(remaining))
    expect(bucketRules(html)).not.toContain(group.ruleId)
    expect(selectedMetrics(html)).toEqual(['Review'])
    expect(rowIds(html)).toEqual([])
    const resolvedHtml = render(`/payroll?cycle=${cycle.id}&filter=agent-resolved`)
    const corrected = (rs: RunShift) => rs.rows.some((row) => row.status === 'applied' && row.effect)
    const shown = firstChunk(cycle.run.shifts.filter((rs) => decided.has(rs.shift.id) || corrected(rs)))
    expect(shown.some((id) => decided.has(id))).toBe(true)
    expect(rowIds(resolvedHtml).sort()).toEqual(shown.sort())
  })

  it('falls back to the pending cycle for an unknown cycle id', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[1]
    const html = render('/payroll?cycle=unknown-cycle&view=list')
    expect(selectedCycles(renderSidebar('/payroll?cycle=unknown-cycle&view=list'))).toEqual([cycle.id])
    const expected = shiftTable(render(`/payroll?cycle=${cycle.id}&view=list`))
    expect(expected).toBeDefined()
    expect(shiftTable(html)).toEqual(expected)
  })

  it('uses Nothing matches for the shared sheet empty state', () => {
    const cycle = buildCycles(DEFAULTS, today)[0]
    const html = renderToStaticMarkup(h(Sheet, { cycle, shifts: [], groupBy: 'none', onSelect: vi.fn(), days: cycle.days }))
    expect(html).toContain('<td colSpan="7" class="empty">Nothing matches</td>')
    expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/\bshifts?\b/i)
  })

  it('shows only undecided flagged or held ledger rows with a Flagged tag', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[0]
    const open = cycle.run.shifts.filter((row) => row.flagged || row.held)
    expect(open.some((row) => row.held)).toBe(true)
    expect(open.some((row) => row.flagged && !row.held)).toBe(true)
    expect(cycle.run.shifts.some((row) => !row.flagged && !row.held)).toBe(true)
    const resolutions = { [cycle.id]: { [open[0].shift.id]: 'applied' as const, [open[1].shift.id]: 'dismissed' as const } }
    vi.spyOn(onboarding, 'useOnboarding').mockReturnValue([{ ...DEFAULTS, resolutions }, vi.fn()])
    const html = render(`/payroll?cycle=${cycle.id}&filter=all`)
    const shown = new Set(firstChunk(cycle.run.shifts))
    expect(rowIds(html)).toHaveLength(shown.size)
    expect(shown.has(open[0].shift.id) && shown.has(open[1].shift.id)).toBe(true)
    for (const rs of cycle.run.shifts.filter((row) => shown.has(row.shift.id))) {
      const row = html.match(new RegExp(`<tr\\b[^>]*data-shift="${rs.shift.id}"[\\s\\S]*?<\\/tr>`))![0]
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
      expect(cells).toHaveLength(7)
      const unresolved = !resolutions[cycle.id][rs.shift.id] && (rs.flagged || rs.held)
      expect(cells.at(-1)![1]).toBe(unresolved ? '<span class="tag amber">Flagged</span>' : '')
    }
  })

  it('opens the shared three-column shift modal over the selected Payroll cycle', () => {
    vi.useFakeTimers().setSystemTime(today)
    const cycle = buildCycles(DEFAULTS, today)[2]
    const shift = cycle.run.shifts.find((row) => !row.flagged && !row.held)!.shift
    const html = render(`/payroll/${encodeURIComponent(shift.id)}?cycle=${cycle.id}&filter=all`)
    const sidebar = renderSidebar(`/payroll/${encodeURIComponent(shift.id)}?cycle=${cycle.id}&filter=all`)
    expect(html).not.toContain('aria-label="Pay cycles"')
    expect(sidebar).toContain('aria-label="Pay cycles"')
    expect(html).toContain('aria-label="Time entries by worker"')
    expect(selectedCycles(sidebar)).toEqual([cycle.id])
    expect(rowIds(html).sort()).toEqual(firstChunk(cycle.run.shifts).sort())
    expect(html).toContain('class="shift-modal open"')
    expect(html).toContain('aria-label="Close time entry"')
    expect([...html.matchAll(/class="shift-page-column(?: shift-conversation)?"/g)]).toHaveLength(3)
    for (const label of ['Time entry evidence', 'Time entry conversation', 'Time entry rules and trail']) expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain('aria-label="About this time entry"')
    expect(html).toContain(shift.worker)
    expect(html).not.toContain('Shift not found')
  })

  it('omits remembered decision status tags in the ledger and keeps decisions in the modal audit column', () => {
    vi.useFakeTimers().setSystemTime(today)
    const original = buildCycles(DEFAULTS, today)[0]
    const rememberedShift = original.run.shifts.find((shift) => shift.rows.some((row) => row.status === 'flag' || row.status === 'held'))!
    const rememberedRuleIds = [...new Set(rememberedShift.rows.filter((row) => row.status === 'flag' || row.status === 'held').map((row) => row.ruleId))]
    const unrelatedShift = original.run.shifts.find((shift) => shift.rows.some((row) =>
      (row.status === 'flag' || row.status === 'held') && !rememberedRuleIds.includes(row.ruleId)))!
    expect(unrelatedShift).toBeDefined()
    const cycle = { ...original, rememberedRuleIds }
    vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
    const html = render(`/payroll?cycle=${cycle.id}&view=list`)
    const ledgerRow = (id: string) => html.match(new RegExp(`<tr\\b[^>]*data-shift="${id}"[\\s\\S]*?<\\/tr>`))![0]
    expect(ledgerRow(rememberedShift.shift.id)).not.toContain('class="tag')
    expect(ledgerRow(unrelatedShift.shift.id)).toContain('class="tag amber">Flagged</span>')

    const decided = render(`/payroll/${rememberedShift.shift.id}?cycle=${cycle.id}`)
    const modal = decided.slice(decided.indexOf('class="shift-modal open"'))
    const decision = modal.match(/<section\b[^>]*aria-label="Recorded decision"[\s\S]*?<\/section>/)![0]
    expect(decision).toContain('>Decision</div>')
    expect(decision).toContain('class="tag">Applied</span>')
    expect(modal.replace(decision, '')).not.toContain('class="tag">Applied</span>')
    expect(modal).not.toMatch(/<button\b[^>]*>Approve<\/button>/)
    const unrelated = render(`/payroll/${unrelatedShift.shift.id}?cycle=${cycle.id}`)
    expect(unrelated).toMatch(/<button\b[^>]*>Approve<\/button>/)
    const pending = kinds(cycle, {})
    const reviewHtml = render(`/payroll?cycle=${cycle.id}&filter=needs-review`)
    expect(bucketRules(reviewHtml)).toEqual(ruleIds(pending))
    for (const ruleId of rememberedRuleIds) expect(bucketRules(reviewHtml)).not.toContain(ruleId)
    expect(pending.flatMap((item) => item.cases.map((entry) => entry.shiftId))).toContain(unrelatedShift.shift.id)
  })

  it('shows Settings as connectors beside the payroll calendar under an Onboarding replay', () => {
    const html = render('/settings')
    expect(html).toContain('<h2>Settings</h2>')
    expect(html).toContain('aria-label="About Settings"')
    expect(html).toContain('title="Replays the setup steps. Your Payroll calendar and rulebook stay as they are."')
    expect(html.indexOf('>Onboarding<')).toBeLessThan(html.indexOf('settings-columns'))
    // Inbox address first, then one logo tile per timesheet source, grouped.
    const grid = html.slice(html.indexOf('source-grid-wrap'), html.indexOf('settings-side'))
    expect(grid).toContain('class="inbox-address"')
    expect(grid.indexOf('inbox-address')).toBeLessThan(grid.indexOf('source-grid-group'))
    const groups = [...new Set(SOURCES.map((item) => item.group))]
    const tiles = [...grid.matchAll(/<button type="button" class="source-tile[^"]*" title="([^"]+)"/g)].map((match) => match[1])
    expect(tiles).toEqual(groups.flatMap((group) => SOURCES.filter((item) => item.group === group).map((item) => textHtml(item.name))))
    expect([...grid.matchAll(/class="source-grid-group"><div class="lbl">(.*?)<\/div>/g)].map((match) => match[1])).toEqual(groups.map(textHtml))
    const side = html.match(/<aside\b[^>]*class="settings-side[\s\S]*?<\/aside>/)![0]
    expect(side).toContain('>Payroll Calendar</h3>')
    expect(html.indexOf('source-grid-wrap')).toBeLessThan(html.indexOf('settings-side'))
    for (const gone of ['aria-label="Time sources"', '>Sources</button>', '>Destinations</button>', 'aria-label="Payroll destinations"', 'What we know']) expect(html).not.toContain(gone)
  })
})
