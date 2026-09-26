import type { RunShift } from '@/bench/engine.js'
import type { DeskCycle } from '@/lib/desk'
import { journeyAdjustmentLine, journeyPayroll } from '@/lib/journeyPay'

export interface PayWorker {
  name: string
  approved: RunShift[]
  held: RunShift[]
  reg: number
  ot: number
  premiums: number
  gross: number
}

export interface PayTotals {
  workers: PayWorker[]
  workerCount: number
  approved: RunShift[]
  held: RunShift[]
  reg: number
  ot: number
  premiums: number
  gross: number
  naive: number
}

const sum = <T,>(items: T[], value: (item: T) => number): number =>
  items.reduce((total, item) => total + value(item), 0)
const overtimeMinutes = (row: RunShift) => sum(row.rows, rule => rule.effect?.dailyOtMin ?? (rule.effect?.otPremiumMin ?? 0) * 2)
const totalsCache = new WeakMap<DeskCycle, PayTotals>()

/** Bench pay-run semantics: held shifts remain visible but never enter outgoing sums. */
export function payTotals(cycle: DeskCycle): PayTotals {
  const cached = totalsCache.get(cycle)
  if (cached) return cached
  // Server cycles are hydrated with the shared effective engine before display.
  const payout = journeyPayroll(cycle.week, cycle.run.shifts, [], new Map(), cycle.adjustments)
  const payoutByWorker = new Map(payout.lines.map(line => [line.worker, line]))
  const groups = new Map<string, RunShift[]>()
  for (const row of cycle.run.shifts) {
    const rows = groups.get(row.shift.worker) ?? []
    rows.push(row)
    groups.set(row.shift.worker, rows)
  }
  for (const adjustment of cycle.adjustments ?? []) if (!groups.has(adjustment.worker)) groups.set(adjustment.worker, [])
  const workers = [...groups].map(([name, rows]): PayWorker => {
    // Keep workers in first-seen order and their shifts in punch order, as in the bench.
    rows.sort((a, b) => a.shift.day - b.shift.day || a.shift.punches[0].in - b.shift.punches[0].in)
    const approved = rows.filter((row) => !row.held)
    const held = rows.filter((row) => row.held)
    const adjustments = (cycle.adjustments ?? []).filter(adjustment => adjustment.worker === name).map(journeyAdjustmentLine)
    const payable = sum(approved, row => row.payableMin)
    // The final entry carries weekly overtime that may cover several earlier days.
    const overtime = Math.min(payable, sum(approved, overtimeMinutes))
    return {
      name,
      approved,
      held,
      reg: Math.max(0, payable - overtime) + sum(adjustments, line => line.regular_hours * 60),
      ot: overtime,
      premiums: sum(approved, (row) => sum(row.rows, (rule) => (rule.effect?.premiumAmt || 0) + (rule.effect?.premiumHours || 0) * row.rate)),
      gross: cycle.server ? (payoutByWorker.get(name)?.gross ?? 0) + sum(adjustments, line => line.gross) : sum(approved, row => row.pay),
    }
  })
  const approved = cycle.run.shifts.filter((row) => !row.held)
  const held = cycle.run.shifts.filter((row) => row.held)
  const totals = {
    workers,
    workerCount: cycle.batch?.workers ?? payout.workers,
    approved,
    held,
    reg: sum(workers, (worker) => worker.reg),
    ot: sum(workers, (worker) => worker.ot),
    premiums: sum(workers, (worker) => worker.premiums),
    gross: cycle.batch?.gross ?? (cycle.server ? payout.gross : sum(approved, row => row.pay)),
    naive: sum(approved, (row) => row.naive),
  }
  totalsCache.set(cycle, totals)
  return totals
}
