import { fmtHM } from '../../src/bench/engine.js'
import { effectiveJourneyRun, journeyAdjustments, journeyPayroll, type PayrollLine } from '../../src/lib/journeyPay.ts'
import type { CyclePayload } from './pipeline.ts'
import { isPlainObject, ValidationError } from './validation.ts'

/** P7 journey records. Top-level fields are camelCase like the P5 API; jsonb contents follow the contract verbatim. */
export type DecisionKind = 'approved' | 'dismissed' | 'escalated'
export interface Decision { id: string; cycleId: string; groupId: string; shiftIds: string[]; decision: DecisionKind; reason: string | null; by: 'user' | 'agent'; at: string }
/** gapIds records outreach evidence, never closure. siteNames preserves never-contact matching after reconciliation. */
export interface Counterparty { kind: 'worker' | 'site'; name: string; contact?: string; gapIds?: string[]; siteNames?: string[] }
export interface Thread { id: string; cycleId: string; shiftId: string | null; disputeId: string | null; counterparty: Counterparty; status: 'open' | 'waiting' | 'resolved'; createdAt: string }
export interface Message { id: string; threadId: string; dir: 'out' | 'in' | 'note'; text: string; status: 'draft' | 'not_sent_demo' | 'recorded'; at: string }
export interface Batch { id: string; cycleId: string; destination: string; workers: number; gross: number; held: number; csvPath: string; createdAt: string }
export interface Adjustment { hours: number; amount: number; next_cycle_id: string }
export interface Dispute { id: string; cycleId: string; worker: string; description: string; source: 'upload' | 'paste' | 'simulated'; status: 'open' | 'adjusted' | 'rejected'; adjustment: Adjustment | null; createdAt: string }
export type StepKind = 'get_timesheets' | 'chase_missing' | 'review' | 'send' | 'done'
export interface NextStep { kind: StepKind; label: string; detail: string; counts: { missingSets: number; gaps: number; openGroups: number } }

/** A review group is one engine rule in one resolution state, the same grouping the desk uses (resolution.ts). */
export interface ReviewGroup { id: string; num: number | null; state: 'proposed' | 'waiting' | 'judgment'; shiftIds: string[] }
/** Gap ids use the client's intake gapId: `${client}|${worker}|${day}`. */
export interface IntakeGap { id: string; worker: string; client: string; day: number; onSite?: number }
export interface CycleSummary { id: string; start: string; cutoff: string; deadline: string; counts: CyclePayload['counts']; gaps: IntakeGap[]; groups: ReviewGroup[]; supervisors: Record<string, string> }
export interface JourneyCycle { id: string; counts: CyclePayload['counts']; gaps: string[]; groups: ReviewGroup[] }

const WAITING = new Set(['SRC-VMS-01'])
const JUDGMENT = new Set(['CON-MARGIN-01'])
const SET_NAMES = { 1: 'worker-reported time', 2: 'client-approved time', 3: 'location' } as const
export const gapId = (e: { client: string; worker: string; day: number }) => `${e.client}|${e.worker}|${e.day}`

export function summarize(p: CyclePayload): CycleSummary {
  const groups = new Map<string, ReviewGroup>()
  p.results.forEach((result, i) => {
    const seen = new Set<string>()
    for (const row of result.rows) {
      if (seen.has(row.ruleId) || (row.status !== 'flag' && row.status !== 'held'
        && !(result.held && row.status === 'applied' && (row.effect || [...p.groups, ...(p.extraGroups ?? [])].some(group => group.ruleId === row.ruleId))))) continue
      seen.add(row.ruleId)
      const held = result.held || result.rows.some(item => item.ruleId === row.ruleId && item.status === 'held')
      const state = held ? 'waiting' : JUDGMENT.has(row.ruleId) ? 'judgment' : WAITING.has(row.ruleId) ? 'waiting' : 'proposed'
      const key = `${state}:${row.ruleId}`
      const group = groups.get(key) ?? { id: row.ruleId, num: p.groups.find(g => g.ruleId === row.ruleId)?.id ?? null, state, shiftIds: [] }
      group.shiftIds.push(p.week[i].id)
      groups.set(key, group)
    }
  })
  const received = new Set(p.intake.received)
  const gaps = p.intake.expected.filter(e => !received.has(gapId(e)))
    .map(e => ({ id: gapId(e), worker: e.worker, client: e.client, day: e.day, ...(e.onSite ? { onSite: e.onSite } : {}) }))
  return { id: p.cycle.id, start: p.cycle.start, cutoff: p.cycle.cutoff, deadline: p.cycle.deadline, counts: p.counts, gaps, groups: [...groups.values()],
    supervisors: Object.fromEntries(p.sites.filter(s => s.supervisor).map(s => [s.name, s.supervisor!.name])) }
}

/** Only reconciled evidence (summary.gaps) or explicit closure with a reason resolves a gap. */
export function openGaps(summary: CycleSummary, doc: Record<string, unknown>, threads: Thread[]): IntakeGap[] {
  void threads // Thread state describes correspondence, not reconciliation evidence.
  const accepted = isPlainObject(doc.acceptedGaps) ? doc.acceptedGaps : {}
  return summary.gaps.filter(g => {
    const closure = accepted[`${summary.id}:${g.id}`]
    return !isPlainObject(closure) || typeof closure.reason !== 'string' || !closure.reason.trim()
  })
}

export function journeyCycle(summary: CycleSummary, doc: Record<string, unknown>, threads: Thread[]): JourneyCycle {
  return { id: summary.id, counts: summary.counts, gaps: openGaps(summary, doc, threads).map(g => g.id), groups: summary.groups }
}

/** What still stands between this cycle and Payroll. */
export function openItems(cycle: JourneyCycle, decisions: Decision[]) {
  const decided = new Set(decisions.filter(d => d.cycleId === cycle.id).map(d => d.groupId))
  const groups = [...new Set(cycle.groups.filter(g => g.state !== 'waiting' && !decided.has(g.id) && !(g.num != null && decided.has(String(g.num)))).map(g => g.id))]
  return { missingSets: ([1, 2, 3] as const).filter(n => !cycle.counts[`set${n}`]), gaps: cycle.gaps, groups }
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** Binding action ordering. Paid/send-once state is derived separately from the batch. */
export function nextStep(cycle: JourneyCycle, decisions: Decision[], batch: Batch | null): NextStep {
  const open = openItems(cycle, decisions)
  const counts = { missingSets: open.missingSets.length, gaps: open.gaps.length, openGroups: open.groups.length }
  if (open.missingSets.length) return { kind: 'get_timesheets', label: 'Get timesheets', detail: `No ${open.missingSets.map(n => SET_NAMES[n]).join(' or ')} yet`, counts }
  if (open.gaps.length) return { kind: 'chase_missing', label: 'Chase missing time', detail: `${plural(open.gaps.length, 'time entry', 'time entries')} ${open.gaps.length === 1 ? 'has' : 'have'} no client-approved hours`, counts }
  if (open.groups.length) return { kind: 'review', label: `Review ${plural(open.groups.length, 'issue')}`, detail: 'Approve, dismiss or escalate each group before Payroll', counts }
  if (batch) return { kind: 'done', label: 'Done', detail: `Sent to ${batch.destination} · Demo`, counts }
  return { kind: 'send', label: 'Send to Payroll', detail: 'Every issue is decided and the batch is ready', counts }
}

// ---- Payroll export ----------------------------------------------------------------------------

export type ExportLine = PayrollLine
export const CSV_COLUMNS = ['worker', 'regular_hours', 'ot_hours', 'premium_hours', 'gross', 'held_entries'] as const

/**
 * One line per worker from the engine run. Held time entries are excluded from pay and counted.
 * Decisions re-run effective hours, rates and dependent premiums through the shared engine.
 * Resolved disputes land as adjustment lines on the cycle named in their adjustment.
 */
export function buildExport(p: CyclePayload, decisions: Decision[], disputes: Dispute[]) {
  const aliases = new Map([...p.groups, ...(p.extraGroups ?? [])].filter(g => g.id != null).map(g => [String(g.id), g.ruleId]))
  return journeyPayroll(p.week.map(s => ({ ...s, fac: p.sites[s.fac] })), p.results,
    decisions.filter(d => d.cycleId === p.cycle.id), aliases, journeyAdjustments(p.cycle.id, disputes))
}

/** RFC 4180, and text cells that a spreadsheet would read as a formula are neutralized. */
export function toCsv(lines: ExportLine[]): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
    return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
  }
  return [CSV_COLUMNS.join(','), ...lines.map(l => [cell(l.worker), l.regular_hours.toFixed(2), l.ot_hours.toFixed(2), l.premium_hours.toFixed(2), l.gross.toFixed(2), String(l.held_entries)].join(','))].join('\r\n') + '\r\n'
}

const SYSTEMS = ['ADP', 'Paychex', 'UKG', 'Paylocity', 'Gusto', 'Rippling', 'Workday', 'QuickBooks', 'Dayforce', 'Ceridian', 'Paycom', 'Paycor', 'isolved', 'Justworks', 'TriNet']
/** The profile's Payroll system when the user named one, else Payroll. */
export function defaultDestination(doc: Record<string, unknown>): string {
  const profile = isPlainObject(doc.profile) ? doc.profile : {}
  const discovery = isPlainObject(doc.discovery) ? doc.discovery : {}
  for (const value of [profile.payrollRunBy, discovery.payroll, doc.system]) {
    const text = typeof value === 'string' ? value : isPlainObject(value) ? Object.values(value).filter(v => typeof v === 'string').join(' ') : ''
    const system = SYSTEMS.find(name => new RegExp(`\\b${name}\\b`, 'i').test(text))
    if (system) return system
  }
  return 'Payroll'
}

// ---- Mediation text (drafted by the server from the evidence; sending is simulated) --------------

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export function dayLabel(start: string, day: number, long = false): string {
  const d = new Date(Date.parse(`${start}T00:00:00Z`) + day * 86_400_000)
  const name = WEEKDAY[d.getUTCDay()]
  return `${long ? name : name.slice(0, 3)} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}
export function clock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440, h = Math.floor(m / 60)
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const first = (name: string) => name.trim().split(/\s+/)[0]
const norm = (name: string) => name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Handbook rule (chase-missing-time.md): location evidence → the site supervisor, otherwise the worker. */
export function counterpartyFor(gap: IntakeGap, summary: CycleSummary): Counterparty {
  if (gap.onSite) return { kind: 'site', name: summary.supervisors[gap.client] ?? gap.client }
  return { kind: 'worker', name: gap.worker }
}

/** Never-contact names match the person, and for a site ask, the site too. */
export function neverContacted(cp: Counterparty, gaps: IntakeGap[], list: unknown): boolean {
  const names = new Set((Array.isArray(list) ? list : []).filter((n): n is string => typeof n === 'string').map(norm).filter(Boolean))
  return names.has(norm(cp.name)) || (cp.kind === 'site' && [...gaps.map(g => g.client), ...(cp.siteNames ?? [])].some(name => names.has(norm(name))))
}

/** `due` is the reply-by date (YYYY-MM-DD, never past: see replyBy); it defaults to the cutoff for callers without a calendar. */
export function draftAsk(cp: Counterparty, gaps: IntakeGap[], summary: CycleSummary, dueDate = summary.cutoff): string {
  const due = dayLabel(dueDate, 0, true)
  // Keep whole evidence references and reserve room for the question; the thread keeps every gap id.
  const bounded = (rows: string[], separator: string) => {
    const selected: string[] = []
    let used = 0
    for (const row of rows) {
      if (used + row.length + separator.length > 3200) break
      selected.push(row); used += row.length + separator.length
    }
    return selected.join(separator) + (selected.length < rows.length ? `${separator}and ${rows.length - selected.length} more entries listed in this thread` : '')
  }
  if (cp.kind === 'worker') {
    const days = bounded(gaps.map(g => `${dayLabel(summary.start, g.day)} at ${g.client}`), ', ')
    return `Hi ${first(cp.name).slice(0, 200)}, the client-approved hours are missing for your time ${gaps.length === 1 ? 'entry' : 'entries'} on ${days}. Did you work ${gaps.length === 1 ? 'that day' : 'those days'}, and what were your in and out times? Payroll closes ${due}.`
  }
  const rows = bounded(gaps.map(g => `${g.worker} on ${dayLabel(summary.start, g.day)}${g.onSite ? ` (location shows ${fmtHM(g.onSite)} on site)` : ''}`), '; ')
  return `Hi ${first(cp.name).slice(0, 200)}, ${gaps[0].client.slice(0, 200)}'s approved hours are missing for ${plural(gaps.length, 'time entry', 'time entries')}: ${rows}. Can you confirm the hours before Payroll closes ${due}?`
}

export function sameWorker(a: string, b: string): boolean {
  const x = norm(a.includes(',') ? a.split(',').reverse().join(' ') : a), y = norm(b.includes(',') ? b.split(',').reverse().join(' ') : b)
  if (x === y) return true
  const [xf, ...xr] = x.split(' '), [yf, ...yr] = y.split(' ')
  // "N. Alvarez" matches "Nora Alvarez".
  return xr.join(' ') === yr.join(' ') && xr.length > 0 && (xf.length === 1 ? yf.startsWith(xf) : yf.length === 1 && xf.startsWith(yf))
}

/** Evidence refs for a dispute: each of the worker's time entries with its file row, paid times and location.
 * `fileNames` maps stored file ids to their names: a person reads the file name and row, never an internal id. */
export function disputeEvidence(p: CyclePayload, worker: string, decisions: Decision[] = [], fileNames: ReadonlyMap<string, string> = new Map()): { text: string; shiftId: string | null; afterClockOut: number; rate: number } {
  const lines: string[] = []
  let shiftId: string | null = null, after = 0, rate = 0
  const aliases = new Map([...p.groups, ...(p.extraGroups ?? [])].filter(g => g.id != null).map(g => [String(g.id), g.ruleId]))
  const effective = effectiveJourneyRun(p.week.map(s => ({ ...s, fac: p.sites[s.fac] })), p.results, decisions.filter(d => d.cycleId === p.cycle.id), aliases)
  p.week.forEach((s, i) => {
    if (!sameWorker(s.worker, worker)) return
    const r = effective[i], last = s.punches.at(-1), out = last?.out ?? null
    const onSiteAfter = s.geo && out != null ? Math.max(0, s.geo[1] - out) : 0
    if (onSiteAfter > after || !shiftId) { shiftId = s.id; after = Math.max(after, onSiteAfter) }
    rate ||= r.rate
    lines.push(`- ${dayLabel(p.cycle.start, s.day)} · ${p.sites[s.fac]?.name ?? 'Site'} · paid ${s.punches.length ? `${clock(s.punches[0].in)}–${out == null ? 'no clock-out' : clock(out)}` : 'no punches'} (${fmtHM(r.payableMin)}, $${r.pay.toFixed(2)}${r.held ? ', held' : ''})` +
      ` · location ${s.geo ? `${clock(s.geo[0])}–${clock(s.geo[1])}${onSiteAfter ? `, ${fmtHM(onSiteAfter)} on site after clock-out` : ''}` : 'none'}` +
      ` · ${fileNames.get(s.prov.file) ?? 'source file'} row ${s.prov.row}`)
  })
  const text = lines.length ? `Evidence for ${worker}, cycle ending ${p.cycle.id}:\n${lines.slice(0, 20).join('\n')}${lines.length > 20 ? `\n… ${lines.length - 20} more time entries` : ''}`
    : `No time entries for ${worker} in the cycle ending ${p.cycle.id}`
  return { text, shiftId, afterClockOut: after, rate }
}

/** Demo helper: the worker-day with the most location time after the paid clock-out, as a worker would raise it. */
export function simulatedDispute(p: CyclePayload): { worker: string; description: string } | null {
  let best: { i: number; after: number } | null = null
  p.week.forEach((s, i) => {
    const out = s.punches.at(-1)?.out
    if (!s.geo || out == null || p.results[i].held) return
    const after = s.geo[1] - out
    if (after > 0 && (!best || after > best.after)) best = { i, after }
  })
  if (!best) return null
  const { i, after } = best as { i: number; after: number }, s = p.week[i]
  const claim = Math.max(15, Math.ceil(after / 15) * 15)
  return { worker: s.worker, description: `${s.worker} says ${dayLabel(p.cycle.start, s.day, true)}'s time entry at ${p.sites[s.fac]?.name ?? 'the site'} is missing ${fmtHM(claim)} after clock-out; location shows them on site until ${clock(s.geo![1])}` }
}

// ---- Request validation (trust boundary: every field typed, bounded, and no unknown keys) --------

const CYCLE = /^\d{4}-\d{2}-\d{2}$/
function body(value: unknown, keys: string[]): Record<string, unknown> {
  if (!isPlainObject(value) || Object.keys(value).some(k => !keys.includes(k))) throw new ValidationError()
  return value
}
function text(value: unknown, max: number, optional = false): string | undefined {
  if (value === undefined && optional) return undefined
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(char => {
    const code = char.charCodeAt(0)
    return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)
  })) throw new ValidationError()
  return value.trim()
}
function number(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError()
  return value
}

export function validateDecision(value: unknown) {
  const b = body(value, ['groupId', 'decision', 'reason', 'shiftIds'])
  const groupId = text(b.groupId, 80)!
  if (!/^[A-Za-z0-9][\w.:|-]*$/.test(groupId) || !['approved', 'dismissed', 'escalated'].includes(b.decision as string)) throw new ValidationError()
  const reason = text(b.reason, 500, b.decision !== 'dismissed') ?? null
  if (b.shiftIds !== undefined && (!Array.isArray(b.shiftIds) || b.shiftIds.length > 10_000 || !b.shiftIds.every(id => typeof id === 'string' && /^s_[0-9a-f]{12}$/.test(id)))) throw new ValidationError()
  return { groupId, decision: b.decision as DecisionKind, reason, shiftIds: b.shiftIds as string[] | undefined }
}
export function validateAsks(value: unknown) {
  const b = body(value, ['gapIds', 'message'])
  if (!Array.isArray(b.gapIds) || b.gapIds.length < 1 || b.gapIds.length > 200) throw new ValidationError()
  return { gapIds: [...new Set(b.gapIds.map(id => text(id, 300)!))], message: text(b.message, 2000, true) }
}
export function validateMessage(value: unknown) {
  const b = body(value, ['dir', 'text'])
  if (!['out', 'in', 'note'].includes(b.dir as string)) throw new ValidationError()
  return { dir: b.dir as Message['dir'], text: text(b.text, 4000)! }
}
export function validateSend(value: unknown) {
  const b = body(value, ['destination', 'force'])
  if (b.force !== undefined && typeof b.force !== 'boolean') throw new ValidationError()
  return { destination: text(b.destination, 80, true), force: b.force === true }
}
export function validateDispute(value: unknown) {
  const b = body(value, ['cycleId', 'worker', 'description', 'source'])
  if (typeof b.cycleId !== 'string' || !CYCLE.test(b.cycleId) || !['upload', 'paste', 'simulated'].includes(b.source as string)) throw new ValidationError()
  return { cycleId: b.cycleId, worker: text(b.worker, 200)!, description: text(b.description, 2000)!, source: b.source as Dispute['source'] }
}
export function validateResolve(value: unknown) {
  const b = body(value, ['decision', 'hours', 'amount', 'note'])
  if (b.decision !== 'adjust' && b.decision !== 'reject') throw new ValidationError()
  const hours = number(b.hours, 0, 100), amount = number(b.amount, -10_000, 10_000)
  if (b.decision === 'adjust' && !hours && !amount) throw new ValidationError()
  return { decision: b.decision, hours, amount, note: text(b.note, 2000)! }
}
export function validateCycleRef(value: unknown) {
  const b = body(value, ['cycleId'])
  if (typeof b.cycleId !== 'string' || !CYCLE.test(b.cycleId)) throw new ValidationError()
  return { cycleId: b.cycleId }
}
