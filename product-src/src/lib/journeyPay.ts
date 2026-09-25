import { rerunEngine, type RunShift, type Shift } from '../bench/engine.js'

export interface PayDecision { id?: string; groupId: string; decision: string; shiftIds?: string[]; at?: string }
export interface PayrollLine { worker: string; regular_hours: number; ot_hours: number; premium_hours: number; gross: number; held_entries: number }
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Canonical identities and latest-write ordering also repair older numeric-alias decisions. */
export function effectiveJourneyRun(week: Shift[], results: Omit<RunShift, 'shift'>[], decisions: PayDecision[], aliases = new Map<string, string>()): RunShift[] {
  const latest = new Map<string, PayDecision>()
  for (const decision of [...decisions].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || (a.id ?? '').localeCompare(b.id ?? ''))) {
    latest.set(aliases.get(decision.groupId) ?? decision.groupId, decision)
  }
  const dismissed = (shiftId: string, ruleId: string) => {
    void shiftId // A decision covers the canonical group; shiftIds are evidence references.
    const decision = latest.get(ruleId)
    return decision?.decision === 'dismissed'
  }
  if (!results.some((result, i) => result.rows.some(row => row.effect && dismissed(week[i].id, row.ruleId)))) {
    return results.map((result, i) => ({ ...result, shift: week[i] }))
  }
  return rerunEngine(week, results, dismissed)
}

/** Identical rounding and effective-engine amounts for the browser preview and server export. */
export function journeyPayroll(week: Shift[], results: Omit<RunShift, 'shift'>[], decisions: PayDecision[], aliases = new Map<string, string>()) {
  const byWorker = new Map<string, { regular: number; ot: number; premium: number; gross: number; held: number }>()
  for (const result of effectiveJourneyRun(week, results, decisions, aliases)) {
    const worker = result.shift.worker
    const line = byWorker.get(worker) ?? { regular: 0, ot: 0, premium: 0, gross: 0, held: 0 }
    byWorker.set(worker, line)
    if (result.held) { line.held++; continue }
    let ot = 0, premium = 0
    for (const row of result.rows) if (row.effect) {
      ot += row.effect.dailyOtMin ?? (row.effect.otPremiumMin ?? 0) * 2
      premium += row.effect.premiumHours ?? 0
    }
    // Weekly overtime is assessed on the final entry but may cover hours on earlier days.
    line.regular += result.payableMin / 60
    line.ot += ot / 60; line.premium += premium; line.gross += result.pay
  }
  const lines: PayrollLine[] = [...byWorker].sort(([a], [b]) => a.localeCompare(b)).map(([worker, line]) => ({
    worker, regular_hours: cents(Math.max(0, line.regular - line.ot)), ot_hours: cents(Math.min(line.ot, line.regular)), premium_hours: cents(line.premium),
    gross: cents(line.gross), held_entries: line.held,
  }))
  return { lines, workers: byWorker.size, gross: cents(lines.reduce((n, line) => n + line.gross, 0)), held: lines.reduce((n, line) => n + line.held_entries, 0) }
}
