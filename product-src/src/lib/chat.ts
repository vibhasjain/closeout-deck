import { authedFetch } from '@/lib/api'
import type { FirmFacts, Onboarding, OnboardingSource, OnboardTopic, PayrollProfile, ProfileField, ProfileValue } from '@/lib/onboarding'

export type Action =
  | { type: 'set_profile'; field: ProfileField; value: ProfileValue }
  | { type: 'set_firm'; patch: Partial<FirmFacts> }
  | ({ type: 'add_source' } & OnboardingSource)
  | { type: 'remove_source'; set: 1 | 2 | 3; label: string }
  | { type: 'remove_rule'; sentence: string }
  | { type: 'set_authority'; patch: Partial<Onboarding['authority']> }
  | { type: 'never_contact'; name: string }
  | { type: 'cover_topic'; topic: OnboardTopic }
  | { type: 'set_calendar'; patch: Partial<Pick<Onboarding, 'frequency' | 'periodEndDay' | 'payDay' | 'payDatesOfMonth' | 'cutoffDays' | 'deadlineDays'>> }
  | { type: 'add_cohort'; cohort: { name: string; frequency: string; periodEndDay?: string; payDay?: string } }
  | { type: 'add_rule'; sentence: string; bucket?: string; kind?: 'det' | 'llm' | 'both' }
  | { type: 'go'; to: string }                         // a route, e.g. '/payroll/4821?cycle=2026-08-24'
  | { type: 'decide'; cycleId: string; shiftId: string; decision: 'applied' | 'dismissed'; reason?: string }
  | { type: 'note'; text: string }                     // free text the UI shows as a quiet line
  | { type: 'set_fact'; kind: 'site' | 'rate' | 'differential' | 'alias' | 'account'; key: string; value: Record<string, unknown> }

/** Pulls ```action fenced JSON blocks out of a reply. Returns clean text + actions. */
export function parseActions(text: string): { text: string; actions: Action[]; skipped?: string[] } {
  const actions: Action[] = []
  const skipped: string[] = []
  const clean = text.replace(/```action\s+([\s\S]*?)```/g, (_, json) => {
    try { actions.push(JSON.parse(json)) } catch { skipped.push('malformed action') }
    return ''
  }).replace(/```mapping\b[\s\S]*?(?:```|$)/g, '').trim()
  return { text: clean, actions, ...(skipped.length ? { skipped } : {}) }
}

export interface QuestionCard {
  kind: 'question'
  input: 'text' | 'chips' | 'multi' | 'calendar' | 'files' | 'choice'
  chips?: string[]
  placeholder?: string
  topics: string[]
  /** A choice card that asks for one time set: 1 worker-reported, 2 client-approved, 3 location. */
  set?: 1 | 2 | 3
  choice?: { yours: string; sample: string }
}
export type Card = QuestionCard | { kind: 'onboard_complete' }

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const cardString = (value: unknown): value is string => typeof value === 'string' && value.length <= 200

/** Cards carry presentation, never a client-side question script. Validate before rendering. */
export function isCard(value: unknown): value is Card {
  if (!record(value)) return false
  if (value.kind === 'onboard_complete') return Object.keys(value).every((key) => key === 'kind')
  if (value.kind !== 'question' || !['text', 'chips', 'multi', 'calendar', 'files', 'choice'].includes(String(value.input))) return false
  if (!Object.keys(value).every((key) => ['kind', 'input', 'chips', 'placeholder', 'topics', 'choice', 'set'].includes(key))) return false
  if (value.set !== undefined && value.set !== 1 && value.set !== 2 && value.set !== 3) return false
  if (!Array.isArray(value.topics) || value.topics.length > 8 || !value.topics.every(cardString)) return false
  if (value.chips !== undefined && (!Array.isArray(value.chips) || value.chips.length > 8 || !value.chips.every(cardString))) return false
  if (value.placeholder !== undefined && !cardString(value.placeholder)) return false
  if (value.choice !== undefined && (!record(value.choice) || !cardString(value.choice.yours) || !cardString(value.choice.sample)
    || !Object.keys(value.choice).every((key) => key === 'yours' || key === 'sample'))) return false
  return value.input !== 'choice' || value.choice !== undefined
}

/** As with actions, callers validate parsed JSON before rendering any card. */
export function parseCards(text: string): { text: string; cards: Card[]; invalid: boolean } {
  const cards: Card[] = []
  let invalid = false
  const clean = text.replace(/```card\s+([\s\S]*?)```/g, (_, json) => {
    try {
      const card: unknown = JSON.parse(json)
      if (isCard(card)) cards.push(card)
      else invalid = true
    } catch { invalid = true }
    return ''
  }).trim()
  return { text: clean, cards, invalid: invalid || /```card\b/.test(clean) }
}

export interface OnboardContext { firm: FirmFacts | null; profile: PayrollProfile; covered: OnboardTopic[]; sources: OnboardingSource[]; inbox: string; authorityConfigured: boolean; authority: Onboarding['authority']; phase?: 'first_closeout'; missingSets?: (1 | 2 | 3)[] }
export interface IngestContext { fileIds: string[] }
export type ChatMode = 'chat' | 'onboard' | 'scribe' | 'delegate' | 'consolidate' | 'ingest'
export type TurnContext = ChatContext | OnboardContext | IngestContext
export interface IngestEvent { fileId: string; status: 'normalized' | 'needs_mapping'; rows?: number; entries?: number; unparsed?: number; cycles?: string[]; gaps?: { ask: string }[]; errors?: string[] }

export interface ChatContext { page: string; step?: string; calendar: object; cycle?: { id: string; label: string; stats: string }; selection?: object; discrepancies?: object[]; rules?: { id: string; sentence: string }[]; connections?: object; firm?: FirmFacts | null; profile?: PayrollProfile; sources?: OnboardingSource[]; inbox?: string; authorityConfigured?: boolean; authority?: Onboarding['authority'] }

export interface ChatEvent { text?: string; done?: boolean; sessionId?: string; error?: string; final?: string; ingest?: IngestEvent; facts?: { applied: number; cycles: string[] } }

export async function* stream(message: string, context: TurnContext, mode: ChatMode = 'chat', signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await authedFetch('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, message, context }), signal })
  if (res.status === 401) return
  if (!res.ok || !res.body) { yield { done: true, error: 'Chat is unavailable right now' }; return }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) return
      buf += dec.decode(value, { stream: true })
      const parts = buf.split('\n\n'); buf = parts.pop() ?? ''
      for (const p of parts) if (p.startsWith('data: ')) yield JSON.parse(p.slice(6))
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
