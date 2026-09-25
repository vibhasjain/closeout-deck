import { signOut, viewerSession } from '@/lib/viewerSession'
import { API_BASE } from '@/lib/api'
import type { Onboarding } from '@/lib/onboarding'

export type Action =
  | { type: 'set_calendar'; patch: Partial<Pick<Onboarding, 'frequency' | 'periodEndDay' | 'payDay' | 'payDatesOfMonth' | 'cutoffDays' | 'deadlineDays'>> }
  | { type: 'add_cohort'; cohort: { name: string; frequency: string; periodEndDay?: string; payDay?: string } }
  | { type: 'add_rule'; sentence: string; bucket?: string; kind?: 'det' | 'llm' | 'both' }
  | { type: 'go'; to: string }                         // a route, e.g. '/payroll/4821?cycle=2026-08-24'
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

export interface ChatEvent { text?: string; done?: boolean; sessionId?: string; error?: string; final?: string }

export async function* stream(message: string, context: ChatContext, mode: 'chat' | 'scribe' | 'delegate' | 'consolidate' = 'chat', signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const token = viewerSession()?.sessionToken
  const res = await fetch(`${API_BASE}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ mode, message, context }), signal })
  if (res.status === 401) { signOut(); return }
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
