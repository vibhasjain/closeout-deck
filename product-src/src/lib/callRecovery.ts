import { authedFetch } from '@/lib/api'
import { callEndTranscript, responseError, type CallPurpose, type TranscriptTurn } from '@/lib/live'
import { parseActions, stream, type Action, type CallTranscriptTurn } from '@/lib/chat'
import { viewerSession } from '@/lib/viewerSession'
import { scheduleMemoryRefresh } from '@/lib/memory'

export interface StoredCall {
  sessionId: string
  purpose: CallPurpose
  startedAt: number
  seconds: number
  transcript: CallTranscriptTurn[]
}
export interface SavedCall {
  callId: string
  seconds: number
  transcript: CallTranscriptTurn[]
  final: string
  saveError?: string
  serverSaved?: boolean
  saving?: boolean
  live?: boolean
  purpose?: CallPurpose
}
export const liveCallKey = (email: string) => `closeout:live-call:v1:${email}`
export const callOwner = () => viewerSession()?.email ?? (import.meta.env.DEV ? 'dev@hypertrack.io' : null)
const writes = new Map<string, { last: number; pending?: StoredCall; timer?: ReturnType<typeof setTimeout> }>()

/** Throttle live updates; teardown flushes synchronously before the page can disappear. */
export function persistLiveCall(email: string, record: Omit<StoredCall, 'transcript'> & { transcript: readonly (CallTranscriptTurn | TranscriptTurn)[] }, flush = false) {
  const key = liveCallKey(email)
  const entry = writes.get(key) ?? { last: -Infinity }
  writes.set(key, entry)
  entry.pending = { ...record, seconds: Math.min(3600, Math.max(0, record.seconds)), transcript: callEndTranscript(record.transcript.map(turn => ({ ...turn, endMs: 'endMs' in turn ? turn.endMs : turn.startMs }))) }
  const write = () => {
    entry.timer = undefined
    if (!entry.pending) return
    try { localStorage.setItem(key, JSON.stringify(entry.pending)) } catch { /* Private mode or storage quota: the live /end path remains available. */ }
    entry.pending = undefined; entry.last = Date.now()
  }
  const delay = flush ? 0 : Math.max(0, 1000 - (Date.now() - entry.last))
  if (!delay) { if (entry.timer) clearTimeout(entry.timer); write() }
  else if (!entry.timer) entry.timer = setTimeout(write, delay)
}

export function readStoredCall(email: string): StoredCall | null {
  try {
    const value = JSON.parse(localStorage.getItem(liveCallKey(email)) ?? 'null') as StoredCall | null
    if (!value || typeof value.sessionId !== 'string' || !value.sessionId || !['onboard', 'desk'].includes(value.purpose)
      || !Number.isFinite(value.startedAt) || !Number.isFinite(value.seconds) || !Array.isArray(value.transcript)) return null
    const transcript = value.transcript.filter(turn => turn && ['agent', 'user'].includes(turn.role) && typeof turn.text === 'string' && Number.isFinite(turn.startMs) && turn.startMs >= 0)
    return { ...value, seconds: Math.min(3600, Math.max(0, value.seconds)), transcript: callEndTranscript(transcript.map(turn => ({ ...turn, endMs: turn.startMs }))) }
  } catch { return null }
}

export function clearStoredCall(email: string, sessionId: string) {
  const key = liveCallKey(email), entry = writes.get(key)
  if (entry?.pending?.sessionId === sessionId) { clearTimeout(entry.timer); writes.delete(key) }
  try { if (readStoredCall(email)?.sessionId === sessionId) localStorage.removeItem(key) } catch { /* Storage may be disabled. */ }
}

interface RecoveryCallbacks {
  onSkipped?(skipped: string[]): void
  onActions(actions: Action[], purpose: CallPurpose): Promise<void>
  onCompleted(call: SavedCall, record: StoredCall): void
}
const recovering = new Map<string, Promise<void>>()
const released = new Set<string>()
const retries = new Map<string, () => Promise<void>>()
let retryFallback: ((callId: string) => Promise<void>) | undefined
export function registerCallRetry(callId: string, retry: () => Promise<void>) { retries.set(callId, retry) }
export function setCallRetryFallback(fallback: ((callId: string) => Promise<void>) | undefined) { retryFallback = fallback }
export async function retryCallSave(callId: string) {
  const retry = retries.get(callId)
  if (retry) await retry()
  else if (retryFallback) await retryFallback(callId)
  else throw new Error('The call notes could not be retried. Reload and try again.')
}

/** Shared by boot and call start; both await the same recovery, before opening a microphone. */
export function recoverStoredCall(email: string, callbacks: RecoveryCallbacks, storedRecord?: StoredCall, alreadySaved = false): Promise<void> {
  const memoryOwner = viewerSession()?.email ?? 'development'
  const record = storedRecord ? { ...storedRecord, seconds: Math.min(3600, Math.max(0, storedRecord.seconds)), transcript: callEndTranscript(storedRecord.transcript.map(turn => ({ ...turn, endMs: turn.startMs }))) } : readStoredCall(email)
  if (!record) return Promise.resolve()
  const key = `${email}:${record.sessionId}`
  const pending = recovering.get(key)
  if (pending) return pending
  registerCallRetry(record.sessionId, () => recoverStoredCall(email, callbacks, record, alreadySaved))
  const task = (async () => {
    let serverSaved = alreadySaved || released.has(key)
    try {
      if (!serverSaved) {
        const response = await authedFetch(`/live-session/${encodeURIComponent(record.sessionId)}/end`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: record.seconds, transcript: record.transcript }) })
        if (response.status === 404) {
          callbacks.onCompleted({ callId: record.sessionId, seconds: record.seconds, transcript: record.transcript, purpose: record.purpose, final: 'This call’s notes were not saved on the server. Your transcript is kept here.', serverSaved: false }, record)
          clearStoredCall(email, record.sessionId); retries.delete(record.sessionId); return
        }
        if (!response.ok) throw await responseError(response, 'The call ended, but its notes could not be saved.')
        serverSaved = true; released.add(key)
        scheduleMemoryRefresh(memoryOwner)
      }
      let final: string | undefined, text = ''
      for await (const event of stream('call ended', { callId: record.sessionId }, 'consolidate')) {
        if (event.error) throw new Error(event.error)
        if (event.text) text += event.text
        if (event.done) final = event.final ?? text
      }
      if (final === undefined) throw new Error('The agent did not finish saving the call notes.')
      const parsed = parseActions(final)
      if (parsed.skipped?.length) callbacks.onSkipped?.(parsed.skipped)
      await callbacks.onActions(parsed.actions, record.purpose)
      callbacks.onCompleted({ callId: record.sessionId, seconds: record.seconds, transcript: record.transcript, purpose: record.purpose, final: parsed.text, serverSaved: true }, record)
      clearStoredCall(email, record.sessionId); released.delete(key); retries.delete(record.sessionId)
    } catch (error) {
      const saveError = error instanceof Error ? error.message : 'The call notes could not be saved.'
      callbacks.onCompleted({ callId: record.sessionId, seconds: record.seconds, transcript: record.transcript, purpose: record.purpose, final: '', saveError, serverSaved }, record)
      throw error
    }
  })().finally(() => { recovering.delete(key) })
  recovering.set(key, task)
  return task
}
