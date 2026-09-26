import { describe, expect, it } from 'vitest'
import { buildCycles, cycleStats } from '@/lib/desk'
import { DEFAULTS } from '@/lib/onboarding'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { OverlayProvider } from '@/components/shell/Overlay'
import { PayrollSummary } from '@/components/PayrollSummary'
import { lawLabel, requiredByLaw, resolutionGroups } from '@/lib/resolution'

describe('agent-first resolution', () => {
  const cycle = buildCycles(DEFAULTS, new Date(2026, 8, 22)).find((item) => item.status === 'needs-review')!
  const count = (groups: ReturnType<typeof resolutionGroups>, state: string) => Object.fromEntries(groups.filter((g) => g.state === state).map((g) => [g.ruleId, g.cases.length]))

  it('triages the sample week into approve, waiting, judgment and fixed', () => {
    const groups = resolutionGroups(cycle, {})
    expect(count(groups, 'proposed')).toEqual({ 'CS-01': 12, 'SRC-MISS-01': 8 })
    expect(count(groups, 'waiting')).toEqual({ 'SRC-VMS-01': 3 })
    expect(count(groups, 'judgment')).toEqual({ 'CON-MARGIN-01': 6 })
    expect(count(groups, 'fixed')).toEqual({ 'SRC-VMS-01': 137, 'CA-MB-01': 95, 'FED-RR-01': 60, 'SRC-WEEK-01': 5 })
  })

  it('names who it is waiting on with their role, so a supervisor never reads as a worker', () => {
    expect(resolutionGroups(cycle, {}).find((g) => g.state === 'waiting')!.asked).toBe("Maria Castillo, Pacific Cold Storage's site supervisor,")
  })

  it('moves approved cases to fixed, and undone fixes back to approve until approved again', () => {
    const duplicates = resolutionGroups(cycle, {}).find((g) => g.ruleId === 'CS-01')!
    const approved = { [cycle.id]: Object.fromEntries(duplicates.cases.map((c) => [c.shiftId, 'applied' as const])) }
    expect(count(resolutionGroups(cycle, approved), 'fixed')['CS-01']).toBe(12)
    expect(count(resolutionGroups(cycle, {}, ['CA-MB-01']), 'proposed')['CA-MB-01']).toBe(95)
    expect(cycleStats(cycle, {}, ['CA-MB-01']).needsReview).toBe(cycleStats(cycle, {}).needsReview + 95)
  })

  it('totals current and resolved pay once per shift even when a rule emits repeated rows', () => {
    const duplicate = cycle.run.shifts.find((shift) => shift.rows.some((row) => row.ruleId === 'CS-01' && row.status === 'flag'))!
    const rows = duplicate.rows.filter((row) => row.ruleId === 'CS-01')
    const oneShift = { ...cycle, run: { ...cycle.run, shifts: [{ ...duplicate, rows: [...rows, ...rows] }] } }
    const groups = resolutionGroups(oneShift, {})
    expect(groups).toHaveLength(1)
    expect(groups[0].cases).toHaveLength(1)
    expect(groups[0].current).toBe(duplicate.naive)
    expect(groups[0].resolved).toBe(duplicate.pay)

    for (const group of resolutionGroups(cycle, {})) {
      const shiftIds = new Set(group.cases.map((item) => item.shiftId))
      const shifts = cycle.run.shifts.filter((shift) => shiftIds.has(shift.shift.id))
      expect(group.current).toBeCloseTo(shifts.reduce((total, shift) => total + shift.naive, 0))
      expect(group.resolved).toBeCloseTo(shifts.reduce((total, shift) => total + shift.pay, 0))
    }
  })
})

describe('SRC-WEEK-01 is FLSA workweek law', () => {
  it('is classified as law by the engine bucket and its applied fix reads Required by law · applied, never by the agent', () => {
    expect(requiredByLaw('SRC-WEEK-01')).toBe(true)
    expect(requiredByLaw('CS-01')).toBe(false)
    const cycle = buildCycles(DEFAULTS, new Date(2026, 8, 22)).find((item) => item.status === 'needs-review')!
    expect(DEFAULTS.authorityConfigured).toBe(false) // autonomy off: nothing discretionary is authorized
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(OverlayProvider, null, createElement(PayrollSummary, { cycle }))))
    const row = html.slice(html.indexOf('data-rule="SRC-WEEK-01"'))
    const line = /<span class="decision-line"[^>]*>([^<]*)<\/span>/.exec(row)![1]
    expect(line).toBe(`${lawLabel('SRC-WEEK-01')} · Required by law · applied`)
    expect(line).not.toContain('by the agent')
  })
})
