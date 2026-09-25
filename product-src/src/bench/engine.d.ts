export interface Facility {
  name: string
  city: string
  state: string
  vertical: string
  lat?: number
  lng?: number
  geofence: boolean
  badge: boolean
  autoDeduct: boolean
  minWage: number
}

export interface Punch {
  in: number
  out: number | null
}

export interface Shift {
  id: string
  worker: string
  fac: Facility
  role: string
  rate: number
  day: number
  sched: [number, number] | null
  punches: Punch[]
  meal: [number, number] | null
  mealMin?: number
  capture?: 'clock' | 'web' | 'manual' | 'import'
  geo: [number, number] | null
  badgeIn?: number | null
  badgeOut?: number | null
  waiverOnFile?: boolean
  consentClopen?: boolean
  editedAfterApproval?: string | null
  schedChangedHoursBefore?: number | null
  orientation?: boolean
  contractMin?: boolean
  mealEvidence?: boolean
  resolution?: { out?: number; by: string; quote: string } | null
  /** Hours the client approved in their VMS, against the ATS entry. */
  vms?: { min: number }
  /** Shift differential, $/h, part of the regular rate. */
  diff?: number
  _dailyOtMin?: number
  /** Built to pass every rule; the engine skips it. */
  _clean?: boolean
}

export type RuleKind = 'det' | 'llm' | 'both'
export type ParameterLookup = (ruleId: string, key: string) => number

export interface Effect {
  premiumMin?: number
  premiumHours?: number
  premiumAmt?: number
  otPremiumMin?: number
  dailyOtMin?: number
  holdMin?: number
  holdAll?: boolean
  rateOverride?: number
  topUpMin?: number
  extendToMin?: number
}

export interface Row {
  ruleId: string
  status: 'pass' | 'flag' | 'applied' | 'na' | 'held' | 'error'
  note: string
  kind?: RuleKind | 'human'
  kindDefault?: RuleKind
  effect?: Effect
  overNaive?: boolean
  chips?: string[]
}

/** Rule evaluation produces these rows; runEngine adds ruleId and kindDefault. */
export type EvaluationRow = Omit<Row, 'ruleId' | 'kindDefault'>

export interface ResolvedPunch {
  in: number
  out: number | null | undefined
  rawOut: number | null
  merged?: boolean
  resolved?: boolean
}

export interface EngineContext {
  week: Shift[]
  byWorker: Map<string, Shift[]>
  params: ParameterLookup
  dupGap(s: Shift): number | null
  mergedPairs(s: Shift): ResolvedPunch[]
  resolvedPairs(s: Shift): ResolvedPunch[]
  workedMin(s: Shift): number
  weeklyWorked(worker: string): number
  prevShift(s: Shift): Shift | null
  gapSincePrev(s: Shift): number | null
  overlap(s: Shift): Shift | null
  travelSpeed(s: Shift): number | null
  exactStreak(s: Shift): number
}

export interface Rule {
  id: string
  bucket: string
  kind: RuleKind
  sentence: string
  source: { doc: string; cite?: string }
  scope: (s: Shift, ctx?: EngineContext) => boolean
  params: Record<string, { v: number; min: number; max: number; step: number; unit: string; label: string }>
  evaluate: (s: Shift, ctx: EngineContext, P: ParameterLookup) => EvaluationRow[]
  expires?: string
}

export interface RunShift {
  shift: Shift
  rows: Row[]
  pay: number
  naive: number
  held: boolean
  flagged: boolean
  deltaUnder: number
  deltaOver: number
  payableMin: number
  rate: number
}

export interface Run {
  shifts: RunShift[]
  totals: { under: number; over: number; flags: number; held: number }
  ctx: EngineContext
}

/** FEATURES is an array of [id, description, evaluator] tuples in the engine. */
export type Feature = [id: string, desc: string, fn: (s: Shift, ctx: EngineContext) => unknown]

export const FACILITIES: Record<string, Facility>
export const FEATURES: Feature[]
export const RULES: Rule[]
export const DAYS: string[]
export function makeWeek(o?: { seed?: number; scripted?: boolean; start?: string }): Shift[]
export function runEngine(week: Shift[], overrides?: Record<string, number>): Run
export function backtest(week: Shift[], ruleId: string, overrides?: Record<string, number>): { fires: number; of: number }
export function fireCount(run: Run, ruleId: string): number
export function dayLabels(startISO: string): string[]
export function fmtT(min: number): string
export function fmtH(min: number): string
export function fmtHM(min: number): string
export function money(n: number): string
export function MIN(hours: number): number
export function H(min: number): number
export function selfCheck(): string[]
