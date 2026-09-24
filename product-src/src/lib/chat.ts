import { viewerSession } from '@/lib/viewerSession'
import type { Onboarding } from '@/lib/onboarding'

export type Action =
  | { type: 'set_calendar'; patch: Partial<Pick<Onboarding, 'frequency' | 'periodEndDay' | 'payDay' | 'payDatesOfMonth' | 'cutoffDays' | 'deadlineDays'>> }
  | { type: 'add_cohort'; cohort: { name: string; frequency: string; periodEndDay?: string; payDay?: string } }
  | { type: 'add_rule'; sentence: string; bucket?: string; kind?: 'det' | 'llm' | 'both' }
  | { type: 'go'; to: string }                         // a route, e.g. '/timesheets/4821?cycle=2026-08-24'
  | { type: 'decide'; cycleId: string; shiftId: string; decision: 'applied' | 'dismissed'; reason?: string }
  | { type: 'note'; text: string }                     // free text the UI shows as a quiet line

/** Pulls ```action fenced JSON blocks out of a reply. Returns clean text + actions. */
export function parseActions(text: string): { text: string; actions: Action[] } {
  const actions: Action[] = []
  const clean = text.replace(/```action\s*\n([\s\S]*?)```/g, (_, json) => {
    try { actions.push(JSON.parse(json)) } catch { /* leave malformed blocks out */ }
    return ''
  }).trim()
  return { text: clean, actions }
}

export interface ChatContext { page: string; step?: string; calendar: object; cycle?: { id: string; label: string; stats: string }; selection?: object; discrepancies?: object[]; rules?: { id: string; sentence: string }[]; connections?: object }

export function systemPrompt(ctx: ChatContext): string {
  return [
    'You are the Closeout Copilot agent inside HyperTrack\'s Payroll closeout desk. You help a Payroll ops person set up their pay calendar, read a first timesheet check, review discrepancies, and write rules. Be concise: 1–3 short sentences, sentence case, no emoji, no markdown headers. Never invent numbers; use only what the context gives you. When a rate card or contract is not in context say so.',
    'Always write Payroll with a capital P, call yourself the Payroll Agent, and never use double quotation marks.',
    'Do not use the contraction I\'d; write I would.',
    'Capitalize the first letter of every sentence and label, preserving brand casing, units and identifiers. Omit the trailing full stop when a message, label or rule contains a single sentence. Keep punctuation for messages with multiple sentences, and preserve ellipses.',
    'When the user tells you something that should change the app, append a fenced block of the form ```action\\n{json}\\n``` after your sentence. Allowed actions: set_calendar {patch}, add_cohort {cohort}, add_rule {sentence,bucket?,kind?}, go {to}, decide {cycleId,shiftId,decision,reason?}, note {text}. One action per block, several blocks allowed. Field values must match the enums in the context.',
    'To open a timesheet, use go with /timesheets/<full shiftId>?cycle=<cycleId>. Preserve the full id from context. Call them time entries, never shifts or timesheets. The Agent opens from the top bar.',
    'Work tabs: /timesheets for flags and timesheet review, /payroll for cycles and pay runs, /rules for the rulebook. Settings and connections are at /settings?tab=sources or /settings?tab=destinations. Use /payroll?cycle=<cycleId> to open a Payroll run.',
    'CONTEXT (JSON): ' + JSON.stringify(ctx),
  ].join('\n\n')
}

export async function* stream(message: string, system: string, sessionId: string | null, history: { role: 'user' | 'assistant'; text: string }[] = []): AsyncGenerator<{ text?: string; done?: boolean; sessionId?: string; error?: string }> {
  const token = viewerSession()?.sessionToken
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ message, system, sessionId, history }) })
  if (!res.ok || !res.body) { yield { done: true, error: 'Chat is unavailable right now' }; return }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''
  for (;;) {
    const { value, done } = await reader.read(); if (done) return
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n\n'); buf = parts.pop() ?? ''
    for (const p of parts) if (p.startsWith('data: ')) yield JSON.parse(p.slice(6))
  }
}
