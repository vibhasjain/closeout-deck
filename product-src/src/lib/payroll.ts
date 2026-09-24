import type { RunShift } from '@/bench/engine.js'
import type { DeskCycle } from '@/lib/desk'

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

/** Bench pay-run semantics: held shifts remain visible but never enter outgoing sums. */
export function payTotals(cycle: DeskCycle): PayTotals {
  const groups = new Map<string, RunShift[]>()
  for (const row of cycle.run.shifts) {
    const rows = groups.get(row.shift.worker) ?? []
    rows.push(row)
    groups.set(row.shift.worker, rows)
  }
  const workers = [...groups].map(([name, rows]): PayWorker => {
    // Keep workers in first-seen order and their shifts in punch order, as in the bench.
    rows.sort((a, b) => a.shift.day - b.shift.day || a.shift.punches[0].in - b.shift.punches[0].in)
    const approved = rows.filter((row) => !row.held)
    const held = rows.filter((row) => row.held)
    return {
      name,
      approved,
      held,
      reg: sum(approved, (row) => Math.max(0, row.payableMin - sum(row.rows, (rule) => rule.effect?.dailyOtMin || 0))),
      ot: sum(approved, (row) => sum(row.rows, (rule) => rule.effect?.dailyOtMin || (rule.effect?.otPremiumMin || 0) * 2)),
      premiums: sum(approved, (row) => sum(row.rows, (rule) => (rule.effect?.premiumAmt || 0) + (rule.effect?.premiumHours || 0) * row.rate)),
      gross: sum(approved, (row) => row.pay),
    }
  })
  const approved = cycle.run.shifts.filter((row) => !row.held)
  const held = cycle.run.shifts.filter((row) => row.held)
  return {
    workers,
    approved,
    held,
    reg: sum(workers, (worker) => worker.reg),
    ot: sum(workers, (worker) => worker.ot),
    premiums: sum(workers, (worker) => worker.premiums),
    gross: sum(approved, (row) => row.pay),
    naive: sum(approved, (row) => row.naive),
  }
}
