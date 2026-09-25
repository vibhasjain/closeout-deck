import { useCallback, useSyncExternalStore } from 'react'
import type { CustomRule, Proposal } from '@/lib/rules'
import { withPeriodEnd, type Cohort } from '@/lib/cohorts'

export const FREQUENCIES = ['Weekly', 'Biweekly', 'Semi-monthly', 'Monthly'] as const
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
/** Semi-monthly and monthly payroll runs on calendar dates, not weekdays. 0 means the last day of the month. */
export const DAYS_OF_MONTH = [0, 1, 5, 10, 15, 20, 25, 28] as const
export const byWeekday = (day: string) => WEEKDAYS.indexOf(day as (typeof WEEKDAYS)[number])
export const isMonthly = (f: string) => f === 'Semi-monthly' || f === 'Monthly'

/** One line of the left-pane transcript. `scope` (e.g. 'shift:4821') makes per-case threads a filter, not a second store. */
export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  text: string
  at: number
  /** What the agent changed, rendered under the message as a quiet Applied line. */
  actions?: unknown[]
  scope?: string
}

/** A timesheet source or payroll destination the user has wired up. */
export interface Connection {
  status: 'connected' | 'available'
  method?: 'api' | 'browser' | 'email'
  lastSync?: string
}

/** A rule the user wrote, or the agent compiled from something they said. */
export interface CustomDeskRule {
  id: string
  bucket: 'Custom'
  kind: 'det' | 'llm' | 'both'
  sentence: string
  source: { doc: string }
  draft: boolean
  at: number
  /** An accepted engine decision, remembered from this cycle forward. */
  sourceRuleId?: string
  autoApply?: boolean
  effectiveCycleStart?: string
}

/** One turn in the conversation held against a single flagged payment. */
export interface Note {
  id: string
  /** The sign-in email of whoever wrote it, or 'agent'. */
  author: string
  text: string
  at: number
}

export interface Onboarding {
  frequency: (typeof FREQUENCIES)[number]
  /** Weekly and biweekly only; semi-monthly and monthly boundaries are calendar dates. */
  periodEndDay: (typeof WEEKDAYS)[number]
  payDay: (typeof WEEKDAYS)[number]
  /** Semi-monthly and monthly only. */
  payDatesOfMonth: number[]
  /** Timesheet cutoff, in days after pay period end. */
  cutoffDays: number
  /** Payroll processing deadline, in days before pay date. */
  deadlineDays: number
  /** Additional pay cycles; the fields above are the main one. */
  cohorts: Cohort[]
  /** Who sends the time, and who signs it off. Captured by the conversational setup. */
  intake: string[]
  approver: string | null
  fileName: string | null
  entries: number
  baseRate: number | null
  system: string | null
  forwarded: boolean
  /** Desktop navigation width, restored between visits. */
  sidebar: 'full' | 'rail'
  checklistDismissed: boolean
  rules: CustomRule[]
  proposals: Proposal[]
  resolutions: Record<string, Record<string, 'applied' | 'dismissed'>>
  payrollConnected: boolean
  sentCycles: string[]
  uploads: Record<string, { files: string[]; entries: number }>
  /**
   * Conversations held while reviewing, keyed by issue. Kept so the thread reopens with its
   * context next time, and so the account can read back who decided what and why.
   */
  threads: Record<string, Note[]>
  /** The left pane transcript, capped at 200 lines. */
  chat: ChatMessage[]
  /** Last server-reported conversation id; continuity is managed by the server. */
  chatSessionId: string | null
  connections: Record<string, Connection>
  approvedCycles: string[]
  batches: Record<string, { status: 'sending' | 'sent'; id: string; workers: number; gross: number }>
  customRules: CustomDeskRule[]
  /** `${cycleId}:${shiftId}` -> why the reviewer said it was not an issue. */
  reasons: Record<string, string>
  /** `${cycleId}:${shiftId}` -> the actual time a reviewer or agent recorded a decision. */
  decisionTimes: Record<string, string>
  mediation: Record<string, { sent: string[]; dismissedDraft?: boolean; edited?: string; notes?: string[] }>
  /** `${cycleId}:${gapId}` -> a scheduled time entry closed as not worked, and why. */
  acceptedGaps: Record<string, { reason: string; at: string }>
  /** cycleId -> rules whose automatic fixes were undone, so they wait for approval instead. */
  undone: Record<string, string[]>
  /** What the agent may do without asking, set like a new hire's limits in agent setup. */
  /** Discovery intake answers from agent setup, in the sales team's intake sheet terms. */
  discovery: { period: string; payouts: string; payroll: string; billing: string; vms: string[]
    workerChannels: string[]; clientTime: string[]; approved: string[] }
  authority: { autoFix: boolean; limit: number; weeklyCap: number; textSupervisors: boolean; textWorkers: boolean; briefing: 'Email' | 'Slack' }
}

const KEY = 'closeout-onboarding-v2'
export const DEFAULTS: Onboarding = { frequency: 'Weekly', periodEndDay: 'Sunday', payDay: 'Friday', payDatesOfMonth: [20, 5], cutoffDays: 1, deadlineDays: 2, cohorts: [], intake: [], approver: null, fileName: null, entries: 212, baseRate: null, system: null, forwarded: false, sidebar: 'full', checklistDismissed: false, rules: [], proposals: [], resolutions: {}, payrollConnected: false, sentCycles: [], uploads: {}, threads: {}, chat: [], chatSessionId: null, connections: {}, approvedCycles: [], batches: {}, customRules: [], reasons: {}, decisionTimes: {}, mediation: {}, acceptedGaps: {}, undone: {}, discovery: { period: '', payouts: '', payroll: '', billing: '', vms: [], workerChannels: [], clientTime: [], approved: [] }, authority: { autoFix: true, limit: 100, weeklyCap: 1000, textSupervisors: true, textWorkers: false, briefing: 'Email' } }
const listeners = new Set<() => void>()
let cache: Onboarding | null = null

function read(): Onboarding {
  if (cache) return cache
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const stored: Onboarding = { ...DEFAULTS, ...raw }
    // the calendar used to be a cadence plus two weekdays, before pay period end was separate.
    if (raw.frequency === undefined && typeof raw.cadence === 'string') {
      stored.frequency =
        raw.cadence === 'Every two weeks' ? 'Biweekly' : raw.cadence === 'Twice a month' ? 'Semi-monthly' : raw.cadence
      stored.periodEndDay = raw.cutoff ?? DEFAULTS.periodEndDay
      stored.cutoffDays = 0
    }
    stored.cohorts = withPeriodEnd(stored.cohorts ?? [], stored.periodEndDay)
    // rules used to be plain strings, before they carried where they came from.
    stored.rules = (stored.rules ?? []).map((r, i) =>
      typeof r === 'string'
        ? { id: `typed-${i}`, text: r, scope: null, source: 'You told the agent', cite: null, effective: null }
        : r,
    )
    // earlier sessions counted timesheet rows as "payments" and held one file per cycle.
    if (raw.entries === undefined && typeof raw.payments === 'number') stored.entries = raw.payments
    for (const [id, up] of Object.entries(stored.uploads ?? {})) {
      const legacy = up as { name?: string; files?: string[]; entries?: number; payments?: number }
      stored.uploads[id] = {
        files: legacy.files ?? (legacy.name ? [legacy.name] : []),
        entries: legacy.entries ?? legacy.payments ?? 0,
      }
    }
    cache = stored
  } catch {
    cache = DEFAULTS
  }
  return cache!
}

function write(patch: Partial<Onboarding>) {
  cache = { ...read(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(cache))
  listeners.forEach((l) => l())
}

/** One atomic store update for decisions that affect several payments. */
export function updateOnboarding(patch: Partial<Onboarding>) {
  write(patch)
}

/** Read the latest store when an asynchronous job finishes after its page unmounts. */
export function getOnboarding(): Onboarding {
  return read()
}

export function useOnboarding() {
  const state = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    read,
    // Server-rendered snapshot, used when the app is prerendered rather than booted in a tab.
    () => DEFAULTS,
  )
  const update = useCallback((patch: Partial<Onboarding>) => write(patch), [])
  return [state, update] as const
}

export function addNote(key: string, author: string, text: string) {
  const threads = read().threads ?? {}
  const note: Note = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, author, text, at: Date.now() }
  write({ threads: { ...threads, [key]: [...(threads[key] ?? []), note] } })
  return note
}

export function removeNote(key: string, id: string) {
  const threads = read().threads ?? {}
  write({ threads: { ...threads, [key]: (threads[key] ?? []).filter((n) => n.id !== id) } })
}

/** Per-account inbox: company slug plus a short hash of the sign-in email so two accounts never collide. */
export function inboxAddress(email: string | null): string {
  const slug = (email?.split('@')[1]?.split('.')[0] ?? 'payroll').toLowerCase().replace(/[^a-z0-9]/g, '')
  let h = 5381
  for (const ch of email ?? '') h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  return `${slug}-${h.toString(36).slice(0, 4)}@closeout.hypertrack.com`
}
