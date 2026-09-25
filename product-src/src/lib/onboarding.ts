import { useCallback, useSyncExternalStore } from 'react'
import type { CustomRule, Proposal } from '@/lib/rules'
import type { Card, QuestionCard } from '@/lib/chat'
import { withPeriodEnd, type Cohort } from '@/lib/cohorts'
import { API_BASE } from '@/lib/api'
import { viewerSession, signOut } from '@/lib/viewerSession'
import { createOnboardingSync, type SyncPatch, type SyncStatus } from '@/lib/onboardingSync'

export const FREQUENCIES = ['Weekly', 'Biweekly', 'Semi-monthly', 'Monthly'] as const
import { WEEKDAYS } from './cycles'
export { WEEKDAYS, byWeekday, isMonthly } from './cycles'
/** Semi-monthly and monthly payroll runs on calendar dates, not weekdays. 0 means the last day of the month. */
export const DAYS_OF_MONTH = [0, 1, 5, 10, 15, 20, 25, 28] as const

export const ONBOARD_TOPICS = ['calendar', 'workerHours', 'clientHours', 'whoseHours', 'rates', 'complaints', 'authority'] as const
export type OnboardTopic = (typeof ONBOARD_TOPICS)[number]
export const PROFILE_FIELDS = ['whoseHours', 'complaints', 'ratesWhere', 'workerHours', 'clientHours', 'payrollRunBy', 'notes'] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]
export type ProfileValue = string | Record<string, string>
export type PayrollProfile = Partial<Record<ProfileField, ProfileValue>>
export interface FirmFacts {
  domain?: string
  name: string
  summary: string
  states: string[]
  verticals: string[]
  clientTypes: string[]
  size: string
  staffing: boolean
  icon?: string
}
export interface OnboardingSource {
  set: 1 | 2 | 3
  kind: 'email' | 'sheet' | 'system' | 'upload' | 'location' | 'sample'
  label: string
  how?: string
}
export type SetupStep = 'welcome' | 'basics' | 'trust' | 'intro' | 'conversation' | 'writing' | 'ready' | 'never-contact'
export interface SetupHistoryEntry { question: string; card: QuestionCard; answer?: string }

/** One line of the left-pane transcript. `scope` (e.g. 'shift:4821') makes per-case threads a filter, not a second store. */
export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  text: string
  at: number
  /** What the agent changed, rendered under the message as a quiet Applied line. */
  actions?: unknown[]
  cards?: Card[]
  scope?: string
  contextChip?: string
  ingestFileIds?: string[]
}

/** A timesheet source or payroll destination the user has wired up. */
export interface Connection {
  status: 'connected' | 'available'
  method?: 'api' | 'browser' | 'email' | 'sheet'
  lastSync?: string
  sample?: boolean
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
  dataSource: 'synthetic' | 'server'
  timezone: string
  firm: FirmFacts | null
  profile: PayrollProfile
  covered: OnboardTopic[]
  sources: OnboardingSource[]
  neverContact: string[] | null
  setupStep: SetupStep
  setupHistory: SetupHistoryEntry[]
  setupRequest: string | null
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
  authorityConfigured: boolean
  authority: { autoFix: boolean; limit: number; weeklyCap: number; textSupervisors: boolean; textWorkers: boolean; briefing: 'Email' | 'Slack' }
}

const KEY = 'closeout-onboarding-v2'
export const DEFAULTS: Onboarding = { dataSource: 'synthetic', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, firm: null, profile: {}, covered: [], sources: [], neverContact: null, setupStep: 'welcome', setupHistory: [], setupRequest: null, frequency: 'Weekly', periodEndDay: 'Sunday', payDay: 'Friday', payDatesOfMonth: [20, 5], cutoffDays: 1, deadlineDays: 2, cohorts: [], intake: [], approver: null, fileName: null, entries: 212, baseRate: null, system: null, forwarded: false, sidebar: 'full', checklistDismissed: false, rules: [], proposals: [], resolutions: {}, payrollConnected: false, sentCycles: [], uploads: {}, threads: {}, chat: [], chatSessionId: null, connections: {}, approvedCycles: [], batches: {}, customRules: [], reasons: {}, decisionTimes: {}, mediation: {}, acceptedGaps: {}, undone: {}, discovery: { period: '', payouts: '', payroll: '', billing: '', vms: [], workerChannels: [], clientTime: [], approved: [] }, authorityConfigured: false, authority: { autoFix: true, limit: 100, weeklyCap: 1000, textSupervisors: true, textWorkers: false, briefing: 'Email' } }
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
  canonical.changed(patch)
}

const syncListeners = new Set<() => void>()
let syncStatus: SyncStatus = { ready: false, loading: false, saving: false, error: null }
const syncOwner = () => viewerSession()?.email ?? 'development'
const pendingKey = () => `closeout-onboarding-pending-v1:${syncOwner()}`
const canonical = createOnboardingSync({
  read,
  apply(patch) {
    cache = { ...read(), ...patch }
    localStorage.setItem(KEY, JSON.stringify(cache))
    listeners.forEach((listener) => listener())
  },
  loadPending() {
    const owner = localStorage.getItem('closeout-onboarding-owner')
    if (owner && owner !== syncOwner()) cache = structuredClone(DEFAULTS)
    localStorage.setItem('closeout-onboarding-owner', syncOwner())
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(pendingKey()) ?? '{}')
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as SyncPatch : {}
    } catch { return {} }
  },
  savePending(patch) { localStorage.setItem(pendingKey(), JSON.stringify(patch)) },
  async request(method, body) {
    const token = viewerSession()?.sessionToken
    const response = await fetch(`${API_BASE}/state`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) })
    if (response.status === 401) signOut()
    return response
  },
  status(next) { syncStatus = next; syncListeners.forEach((listener) => listener()) },
})

/** Load the canonical profile before enabling setup edits. */
export const hydrateOnboarding = canonical.hydrate
/** Await this before chat/ingestion or leaving setup so the agent reads the latest profile. */
export const flushOnboarding = canonical.flush
export function useOnboardingSyncStatus() {
  return useSyncExternalStore((listener) => { syncListeners.add(listener); return () => syncListeners.delete(listener) }, () => syncStatus, () => syncStatus)
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
