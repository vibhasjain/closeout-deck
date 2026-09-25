import { describe, expect, it } from 'vitest'
import type { RunShift } from '@/bench/engine.js'
import { buildCycles, type DeskCycle } from '@/lib/desk'
import { DEFAULTS } from '@/lib/onboarding'
import { payTotals } from '@/lib/payroll'

const scripted = buildCycles(DEFAULTS, new Date(2026, 8, 22))[0]
const shift = (id: string, worker: string, patch: Partial<RunShift> = {}): RunShift => ({
  ...scripted.run.shifts[0],
  shift: { ...scripted.week[0], id, worker },
  rows: [],
  held: false,
  payableMin: 480,
  rate: 20,
  pay: 160,
  naive: 160,
  ...patch,
})
const cycle = (shifts: RunShift[]): DeskCycle => ({
  ...scripted,
  week: shifts.map((row) => row.shift),
  run: { ...scripted.run, shifts },
})

describe('payroll totals', () => {
  it('excludes every held shift from outgoing amounts even when it has partial pay', () => {
    const approved = shift('approved', 'Worker A')
    const held = shift('partial-hold', 'Worker A', {
      held: true, pay: 90, naive: 180, payableMin: 270,
      rows: [{ ruleId: 'TW-1187', status: 'held', note: 'Partial hold', effect: { holdMin: 210, premiumAmt: 15 } }],
    })
    const result = payTotals(cycle([approved, held]))
    expect(result).toMatchObject({ approved: [approved], held: [held], reg: 480, ot: 0, premiums: 0, gross: 160, naive: 160 })
    expect(result.workers[0]).toMatchObject({ approved: [approved], held: [held], gross: 160 })
  })

  it('retains a worker whose entire run is held with zero outgoing totals', () => {
    const held = shift('held', 'Worker B', { held: true, pay: 100 })
    const result = payTotals(cycle([held]))
    expect(result.workers).toHaveLength(1)
    expect(result.workers[0]).toMatchObject({ name: 'Worker B', approved: [], held: [held], reg: 0, ot: 0, premiums: 0, gross: 0 })
    expect(result.gross).toBe(0)
    expect(result.naive).toBe(0)
  })

  it('preserves daily and weekly overtime semantics and uses the effective rate for premiums', () => {
    const row = shift('overtime', 'Worker A', {
      payableMin: 600, rate: 30, pay: 425, naive: 300,
      rows: [
        { ruleId: 'CA-OT-8', status: 'applied', note: 'Daily OT including double time', effect: { dailyOtMin: 120, otPremiumMin: 90 } },
        { ruleId: 'FED-OT-40', status: 'applied', note: 'Weekly OT', effect: { otPremiumMin: 30 } },
        { ruleId: 'premium', status: 'applied', note: 'Cash and hourly premiums', effect: { premiumAmt: 20, premiumHours: 1.5 } },
      ],
    })
    const result = payTotals(cycle([row]))
    // Daily OT minutes take precedence over the daily premium; weekly OT doubles its premium minutes.
    expect(result).toMatchObject({ reg: 420, ot: 180, premiums: 65, gross: 425, naive: 300 })
    expect(result.workers[0]).toMatchObject({ reg: 420, ot: 180, premiums: 65, gross: 425 })
    expect(result.reg + result.ot).toBe(row.payableMin)
  })

  it('keeps bench worker and punch ordering without sorting the source run', () => {
    const late = shift('late', 'Zoe')
    late.shift = { ...late.shift, day: 2, punches: [{ in: 600, out: 1080 }] }
    const early = shift('early', 'Zoe')
    early.shift = { ...early.shift, day: 2, punches: [{ in: 540, out: 1020 }] }
    const yesterday = shift('yesterday', 'Zoe')
    yesterday.shift = { ...yesterday.shift, day: 1 }
    const amy = shift('other-worker', 'Amy')
    const source = cycle([late, amy, early, yesterday])
    const result = payTotals(source)
    expect(result.workers.map((worker) => worker.name)).toEqual(['Zoe', 'Amy'])
    expect(result.workers[0].approved.map((row) => row.shift.id)).toEqual(['yesterday', 'early', 'late'])
    expect(source.run.shifts.map((row) => row.shift.id)).toEqual(['late', 'other-worker', 'early', 'yesterday'])
  })

  it('keeps all weekly overtime when the final entry carries more overtime than its own hours', () => {
    const rows = Array.from({ length: 7 }, (_, day) => shift(`day-${day}`, 'Worker A'))
    rows[6].rows = [{ ruleId: 'FED-OT-40', status: 'applied', note: '16 weekly overtime hours', effect: { otPremiumMin: 480 } }]
    const result = payTotals(cycle(rows))
    expect(result).toMatchObject({ reg: 2400, ot: 960 })
    expect(result.reg + result.ot).toBe(7 * 480)
  })

  it('rounds real server Payroll gross per worker exactly like the CSV', () => {
    const source = { ...cycle([shift('a', 'Worker A', { pay: 160.005 }), shift('b', 'Worker B', { pay: 160.005 })]), server: true }
    const result = payTotals(source)
    expect(result.workers.map(worker => worker.gross)).toEqual([160.01, 160.01])
    expect(result.gross).toBe(320.02)
  })

  it('reconciles the real scripted run to its approved shifts and worker totals', () => {
    const result = payTotals(scripted)
    const approved = scripted.run.shifts.filter((row) => !row.held)
    expect(result.workers).toHaveLength(new Set(scripted.week.map((row) => row.worker)).size)
    expect(result.held).toHaveLength(scripted.run.totals.held)
    expect(result.approved.length + result.held.length).toBe(scripted.week.length)
    expect(result.gross).toBeCloseTo(approved.reduce((total, row) => total + row.pay, 0), 6)
    expect(result.naive).toBeCloseTo(approved.reduce((total, row) => total + row.naive, 0), 6)
    expect(result.workers.reduce((total, worker) => total + worker.gross, 0)).toBeCloseTo(result.gross, 6)
    expect(result.gross - result.naive).toBeCloseTo(scripted.run.totals.under - scripted.run.totals.over, 6)
    expect(result.held.some((row) => row.pay > 0)).toBe(true)
  })
})
