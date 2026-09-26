import { RULES, rerunEngine, type RunShift, type Shift } from '../bench/engine.js'

export interface PayDecision { id?: string; groupId: string; decision: string; shiftIds?: string[]; at?: string }
export interface PayrollLine { worker: string; regular_hours: number; ot_hours: number; premium_hours: number; gross: number; held_entries: number }
export interface JourneyPayAdjustment { id: string; cycleId: string; worker: string; hours: number; amount: number }
interface AdjustmentDispute { id: string; cycleId: string; worker: string; status: string; adjustment?: { hours: number; amount: number; next_cycle_id: string } | null }
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
/** Expose only the adjustments assigned to this Payroll cycle, not unrelated disputes. */
export function journeyAdjustments(cycleId: string, disputes: readonly AdjustmentDispute[]): JourneyPayAdjustment[] {
  return disputes.flatMap(dispute => dispute.status === 'adjusted' && dispute.adjustment?.next_cycle_id === cycleId
    ? [{ id: dispute.id, cycleId: dispute.cycleId, worker: dispute.worker, hours: dispute.adjustment.hours, amount: dispute.adjustment.amount }] : [])
}
export const journeyAdjustmentLine = (adjustment: JourneyPayAdjustment): PayrollLine => ({
  worker: `${adjustment.worker} · Adjustment for ${adjustment.cycleId}`, regular_hours: cents(adjustment.hours), ot_hours: 0,
  premium_hours: 0, gross: cents(adjustment.amount), held_entries: 0,
})
/** The export never pays a held entry, including an entry with partial engine pay. */
export const journeyShiftPay = (result: Pick<RunShift, 'held' | 'pay'>) => result.held ? 0 : result.pay
export const journeyShiftMinutes = (result: Pick<RunShift, 'held' | 'payableMin'>) => result.held ? 0 : result.payableMin

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
  return rerunEngine(week, results, dismissed).map((result, i) => ({ ...result, held: results[i].held || result.held }))
}

/** What the Closeout Agent sees of a time entry, as the stored run has it: the rows that fired and every rule it went through (any row but na).
 * The app's payload leaves out pass rows and kindDefault (server wireCycle): `passed` indexes the cycle's rulesChecked, RULES has the kind. */
export function shiftRules(result: Pick<RunShift, 'rows'> & { passed?: number[] }, rulesChecked: readonly string[] = []) {
  const checked = new Set(result.passed?.map(i => rulesChecked[i]))
  for (const row of result.rows) if (row.status !== 'na') checked.add(row.ruleId)
  return {
    fired: result.rows.filter(row => row.status === 'flag' || row.status === 'held' || row.status === 'applied')
      .map(({ ruleId, ...row }) => ({ ruleId, kindDefault: RULES.find(rule => rule.id === ruleId)?.kind, ...row })),
    rules: RULES.filter(rule => checked.has(rule.id)).map(({ id, sentence }) => ({ id, sentence })),
  }
}

/** Identical rounding and effective-engine amounts for the browser preview and server export. */
export function journeyPayroll(week: Shift[], results: Omit<RunShift, 'shift'>[], decisions: PayDecision[], aliases = new Map<string, string>(), adjustments: readonly JourneyPayAdjustment[] = []) {
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
    line.regular += journeyShiftMinutes(result) / 60
    line.ot += ot / 60; line.premium += premium; line.gross += journeyShiftPay(result)
  }
  const lines: PayrollLine[] = [...byWorker].sort(([a], [b]) => a.localeCompare(b)).map(([worker, line]) => ({
    worker, regular_hours: cents(Math.max(0, line.regular - line.ot)), ot_hours: cents(Math.min(line.ot, line.regular)), premium_hours: cents(line.premium),
    gross: cents(line.gross), held_entries: line.held,
  }))
  lines.push(...adjustments.map(journeyAdjustmentLine))
  const workers = new Set([...byWorker.keys(), ...adjustments.map(adjustment => adjustment.worker)]).size
  return { lines, workers, gross: cents(lines.reduce((n, line) => n + line.gross, 0)), held: lines.reduce((n, line) => n + line.held_entries, 0) }
}
