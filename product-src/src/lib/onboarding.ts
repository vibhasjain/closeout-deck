import { useCallback, useSyncExternalStore } from 'react'
import type { CustomRule, Proposal } from '@/lib/rules'
import type { CallTranscriptTurn, Card, QuestionCard } from '@/lib/chat'
import { withPeriodEnd, type Cohort } from '@/lib/cohorts'
import { authedFetch, cachedFetch, cacheResponse, subscribeCached } from '@/lib/api'
import { viewerSession } from '@/lib/viewerSession'
import { createOnboardingSync, type SyncPatch, type SyncStatus } from '@/lib/onboardingSync'
import { createChatHistory, isChatMessage } from '@/lib/chatHistory'

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
export interface SetupHistoryEntry {
  question: string; card: QuestionCard; answer?: string
  /** Small reversible source/rule deltas, attached to the answer that produced them. */
  effects?: { addedSources: OnboardingSource[]; removedSources: OnboardingSource[]; addedRuleIds: string[]; removedRules: CustomDeskRule[] }
}

/** One line of the left-pane transcript. `scope` (e.g. 'shift:4821') makes per-case threads a filter, not a second store. */
export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  text: string
  at: number
  /** What the agent changed, rendered under the message as a quiet Applied line. */
  actions?: unknown[]
  /** Saved locally before execution; never rendered as applied or replayed after reload. */
  pendingActions?: unknown[]
  cards?: Card[]
  /** Kept on this device; the canonical call transcript is saved separately by /live-session/:id/end. */
  callTranscript?: CallTranscriptTurn[]
  callSaveError?: string
  callServerSaved?: boolean
  /** Keep the provisional row local until consolidation and its action audit finish. */
  callSaving?: boolean
  /** This journal row is still a live call; final saving clears it in place. */
  callLive?: boolean
  callPurpose?: 'onboard' | 'desk'
  scope?: string
  contextChip?: string
  traces?: string[]
  ingestFileIds?: string[]
  /** Parts of the agent's reply that failed validation and were not applied, named in one quiet line. */
  skipped?: string[]
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
  /** The agent's own closing line from onboard_complete. */
  setupClosing: string | null
  setupNotice: string | null
  /** Local only: the first-closeout kickoff turn is still owed to the conversation. */
  kickoffPending: boolean
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
  /** The left pane transcript; persisted separately in closeout_chat. */
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
  /** Declined automatic-approval offers stay dismissed even if the associated memory is forgotten. */
  declinedAutoApproveRules?: string[]
  /** What the agent may do without asking, set like a new hire's limits in agent setup. */
  /** Discovery intake answers from agent setup, in the sales team's intake sheet terms. */
  discovery: { period: string; payouts: string; payroll: string; billing: string; vms: string[]
    workerChannels: string[]; clientTime: string[]; approved: string[] }
  /** False until the user answers the authority goal or accepts settings in the Rulebook; until then nothing is authorized. */
  authorityConfigured: boolean
  /** weeklyCap null: no weekly cap. It is never $0, which would block every fix. */
  authority: { autoFix: boolean; limit: number; weeklyCap: number | null; textSupervisors: boolean; textWorkers: boolean; briefing: 'Email' | 'Slack' }
  /** Wider settings the agent proposed from chat; they apply only when the user accepts them in the Rulebook. */
  authoritySuggestion: Partial<Onboarding['authority']> | null
}

/** What the agent may do before anyone has configured authority: nothing on its own. */
export const ASK_FIRST: Onboarding['authority'] = { autoFix: false, limit: 0, weeklyCap: null, textSupervisors: false, textWorkers: false, briefing: 'Email' }
export const effectiveAuthority = (state: Pick<Onboarding, 'authority' | 'authorityConfigured'>) => state.authorityConfigured ? state.authority : ASK_FIRST

const KEY = 'closeout-onboarding-v2'
export const DEFAULTS: Onboarding = { dataSource: 'server', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, firm: null, profile: {}, covered: [], sources: [], neverContact: null, setupStep: 'welcome', setupHistory: [], setupRequest: null, setupClosing: null, setupNotice: null, kickoffPending: false, frequency: 'Weekly', periodEndDay: 'Sunday', payDay: 'Friday', payDatesOfMonth: [20, 5], cutoffDays: 1, deadlineDays: 2, cohorts: [], intake: [], approver: null, fileName: null, entries: 212, baseRate: null, system: null, forwarded: false, sidebar: 'full', checklistDismissed: false, rules: [], proposals: [], resolutions: {}, payrollConnected: false, sentCycles: [], uploads: {}, threads: {}, chat: [], chatSessionId: null, connections: {}, approvedCycles: [], batches: {}, customRules: [], reasons: {}, decisionTimes: {}, mediation: {}, acceptedGaps: {}, undone: {}, declinedAutoApproveRules: [], discovery: { period: '', payouts: '', payroll: '', billing: '', vms: [], workerChannels: [], clientTime: [], approved: [] }, authorityConfigured: false, authority: { autoFix: true, limit: 100, weeklyCap: 1000, textSupervisors: true, textWorkers: false, briefing: 'Email' }, authoritySuggestion: null }
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
  const previous = read().chat
  cache = { ...read(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(cache))
  listeners.forEach((l) => l())
  canonical.changed(patch)
  if (patch.chat) history.appended(previous, patch.chat)
}

/** Replace local fields from the server without echoing them back as edits. */
function applyLocal(patch: Partial<Onboarding>) {
  cache = { ...read(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(cache))
  listeners.forEach((listener) => listener())
}

const syncListeners = new Set<() => void>()
let syncStatus: SyncStatus = { ready: false, loading: false, saving: false, error: null }
const syncOwner = () => viewerSession()?.email ?? 'development'
const pendingKey = () => `closeout-onboarding-pending-v1:${syncOwner()}`
const baseKey = () => `closeout-onboarding-base-v1:${syncOwner()}`
const chatPendingKey = () => `closeout-chat-pending-v1:${syncOwner()}`
const stored = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
let legacyChat: unknown[] = []
const canonical = createOnboardingSync({
  defaults: DEFAULTS,
  read,
  apply: applyLocal,
  loadBase() {
    const base = stored<unknown>(baseKey(), null)
    return base && typeof base === 'object' && !Array.isArray(base) ? base as SyncPatch : null
  },
  saveBase(base) { localStorage.setItem(baseKey(), JSON.stringify(base)) },
  adopt(doc) {
    if (!Array.isArray(doc.chat)) return
    legacyChat = doc.chat.filter(isChatMessage)
    // Persist migration rows locally and in the append queue before a state write
    // can remove the legacy transcript, even when GET /chat/history is offline.
    const previous = read().chat
    const known = new Set(previous.map((message) => message.id))
    const chat = [...previous, ...legacyChat.filter(isChatMessage).filter((message) => !known.has(message.id))].sort((a, b) => a.at - b.at)
    history.appended([], legacyChat.filter(isChatMessage))
    applyLocal({ chat })
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
  async request(method, body, fresh) {
    if (method === 'GET') return cachedFetch('/state', { mode: fresh ? 'network-first' : 'cache-first' })
    const owner = syncOwner()
    const response = await authedFetch('/state', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (response.ok) cacheResponse('/state', await response.clone().json(), owner)
    if (owner !== syncOwner()) throw new Error('The account changed. Reopen Payroll and try again.')
    return response
  },
  status(next) { syncStatus = next; syncListeners.forEach((listener) => listener()) },
})
const history = createChatHistory({
  read: () => read().chat,
  apply: (chat) => applyLocal({ chat }),
  loadPending: () => { const saved = stored<unknown>(chatPendingKey(), []); return Array.isArray(saved) ? saved : [] },
  savePending(messages) { localStorage.setItem(chatPendingKey(), JSON.stringify(messages)) },
  async request(method, body) {
    if (method === 'GET') return cachedFetch('/chat/history')
    const owner = syncOwner()
    const response = await authedFetch('/chat/history', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (owner !== syncOwner()) throw new Error('The account changed. Reopen the conversation and try again.')
    if (response.ok) cacheResponse('/chat/history', { messages: read().chat.filter(message => !message.pendingActions?.length && !message.callSaving) })
    return response
  },
})

subscribeCached('/state', value => canonical.acceptRemote(value))
subscribeCached('/chat/history', value => history.acceptRemote(value))

/** Load the canonical profile before enabling setup edits. The transcript follows in the background. */
export async function hydrateOnboarding() {
  await canonical.hydrate()
  void history.load(legacyChat).then(() => { legacyChat = [] }, () => { /* the local transcript stays usable offline */ })
}
/** Another device may have changed the profile; pull when this tab comes back. */
function pullOnReturn() {
  void canonical.pull().catch(() => { /* status reports sync errors */ })
  void history.load().catch(() => {})
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && typeof document !== 'undefined') {
  window.addEventListener('focus', pullOnReturn)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullOnReturn() })
}
/** Await this before chat/ingestion or leaving setup so the agent reads the latest profile. */
export const flushOnboarding = canonical.flush
/** Start over: forget this account's local profile, sync base, unsent edits and unsent chat. The sign-in stays. */
export function clearLocalAccount() {
  cache = structuredClone(DEFAULTS)
  for (const key of [KEY, 'closeout-onboarding-owner', pendingKey(), baseKey(), chatPendingKey()]) {
    try { localStorage.removeItem(key) } catch { /* Storage may be disabled. */ }
  }
}
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

export { inboxAddress } from './inbox'
