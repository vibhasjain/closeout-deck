import { randomUUID } from 'node:crypto'
import type { LiveContext } from './prompts.ts'
import { QueueFullError, TurnRateLimit } from './queue.ts'
import { isPlainObject, ValidationError } from './validation.ts'

// Owner rule: GPT-Live-1 only, no fallback of any kind, no env override. Verified Sep 25 2026 against
// developers.openai.com/api/docs/guides/voice-webrtc?api=live and the GPT-Live event reference.
export const LIVE_URL = 'https://api.openai.com/v1/live/sessions'
export const LIVE_MODEL = 'gpt-live-1'
export const VOICE_ERROR = 'The Closeout Agent could not start the call. Try again in a moment.'
export const MAX_SDP_CHARS = 65_536
export const MAX_LIVE_CONTEXT_BYTES = 4_096
export const MAX_TRANSCRIPT_ITEMS = 200
export const MAX_TRANSCRIPT_CHARS = 400
export const MAX_CALL_SECONDS = 3_600

export type Purpose = 'onboard' | 'desk'
export interface TranscriptItem { role: 'user' | 'agent'; text: string; startMs: number }

const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
const strings = (value: unknown, count: number, max: number) => Array.isArray(value) && value.length <= count && value.every(item => text(item, max))

export function validateSdp(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_SDP_CHARS || !value.startsWith('v=0')) throw new ValidationError()
  return value
}

/** POST /live-session. Context keys are whitelisted; the whole context is capped at 4KB. */
export function validateLiveBody(body: unknown): { sdp: string; purpose: Purpose; context: LiveContext } {
  if (!isPlainObject(body) || (body.purpose !== 'onboard' && body.purpose !== 'desk')) throw new ValidationError()
  const sdp = validateSdp(body.sdp)
  const raw = body.context ?? {}
  if (!isPlainObject(raw) || Buffer.byteLength(JSON.stringify(raw)) > MAX_LIVE_CONTEXT_BYTES) throw new ValidationError()
  const context: LiveContext = {}
  const { firm, known, uncovered, cycleId } = raw
  if (typeof firm === 'string' && text(firm, 200) && firm.trim()) context.firm = { name: firm }
  else if (isPlainObject(firm) && text(firm.name, 200) && (firm.name as string).trim()) {
    if ((firm.summary !== undefined && !text(firm.summary, 1_000)) || (firm.states !== undefined && !strings(firm.states, 60, 2))) throw new ValidationError()
    context.firm = { name: firm.name as string, ...(firm.summary ? { summary: firm.summary as string } : {}), ...(firm.states ? { states: firm.states as string[] } : {}) }
  } else if (firm !== undefined && firm !== null && firm !== '') throw new ValidationError()
  if (typeof known === 'string' || isPlainObject(known)) context.known = known
  else if (known !== undefined && known !== null) throw new ValidationError()
  if (uncovered !== undefined) { if (!strings(uncovered, 12, 100)) throw new ValidationError(); context.uncovered = uncovered as string[] }
  if (cycleId !== undefined) { if (typeof cycleId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cycleId)) throw new ValidationError(); context.cycleId = cycleId }
  return { sdp, purpose: body.purpose, context }
}

/** POST /live-session/:id/end */
export function validateCallEnd(body: unknown): { seconds: number; transcript: TranscriptItem[] } {
  if (!isPlainObject(body) || typeof body.seconds !== 'number' || !Number.isFinite(body.seconds) || body.seconds < 0 || body.seconds > MAX_CALL_SECONDS
    || !Array.isArray(body.transcript) || body.transcript.length > MAX_TRANSCRIPT_ITEMS) throw new ValidationError()
  const transcript = body.transcript.map((item: unknown): TranscriptItem => {
    if (!isPlainObject(item) || (item.role !== 'user' && item.role !== 'agent') || !text(item.text, MAX_TRANSCRIPT_CHARS)
      || typeof item.startMs !== 'number' || !Number.isFinite(item.startMs) || item.startMs < 0 || item.startMs > MAX_CALL_SECONDS * 1000) throw new ValidationError()
    return { role: item.role, text: item.text as string, startMs: Math.round(item.startMs) }
  })
  return { seconds: Math.round(body.seconds), transcript }
}

/** The exact upstream body. Nothing else is sent: the session config is strict and immutable after startup. */
export function liveSessionBody(instructions: string, sdp: string) {
  return {
    session: { model: LIVE_MODEL, instructions, audio: { output: { voice: 'marin' } }, delegation: { type: 'client' } },
    transport: { type: 'webrtc', sdp },
  }
}

export class LiveUpstreamError extends Error {
  constructor() { super('voice_upstream') }
}

/** Returns the answer SDP. Every failure is logged here and surfaces as one fixed message. */
export async function createLiveSession(input: { instructions: string; sdp: string; apiKey: string; fetch?: typeof fetch }): Promise<{ sdp: string; upstreamId: string | null }> {
  let response: Response
  try {
    response = await (input.fetch ?? fetch)(LIVE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(liveSessionBody(input.instructions, input.sdp)),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    console.error('GPT-Live session request failed:', error instanceof Error ? error.name : 'Error')
    throw new LiveUpstreamError()
  }
  const raw = await response.text().catch(() => '')
  if (!response.ok) {
    console.error(`GPT-Live session rejected: status=${response.status} body=${raw.slice(0, 1_000)}`)
    throw new LiveUpstreamError()
  }
  let data: { session?: { id?: unknown }; transport?: { sdp?: unknown } } = {}
  try { data = JSON.parse(raw) } catch { /* reported below */ }
  if (typeof data.transport?.sdp !== 'string' || !data.transport.sdp.startsWith('v=0')) {
    console.error(`GPT-Live session returned no answer SDP: status=${response.status} body=${raw.slice(0, 1_000)}`)
    throw new LiveUpstreamError()
  }
  return { sdp: data.transport.sdp, upstreamId: typeof data.session?.id === 'string' ? data.session.id : null }
}

export interface LiveCall { id: string; purpose: Purpose; startedAt: number; upstreamId: string | null }

/**
 * One live session per user, at most 10 starts per user per hour.
 * ponytail: in-memory on the single Fly machine; a restart forgets open calls (their /end then 404s)
 * and a crashed tab holds the lock until the 30-minute call cap plus grace. Move to closeout_calls rows if either bites.
 */
export class LiveSessions {
  private readonly calls = new Map<string, LiveCall>()
  private readonly starts: TurnRateLimit

  constructor(limit = 10, windowMs = 3_600_000, private readonly ttlMs = 35 * 60_000) {
    this.starts = new TurnRateLimit(limit, windowMs)
  }

  get(email: string, id?: string): LiveCall | null {
    const call = this.calls.get(email)
    if (call && Date.now() - call.startedAt > this.ttlMs) this.calls.delete(email)
    const live = this.calls.get(email) ?? null
    return live && (id === undefined || live.id === id) ? live : null
  }

  /** Reserve synchronously, before the upstream await, so two tabs cannot both start a call. */
  start(email: string, purpose: Purpose): LiveCall | 'busy' | 'limited' {
    if (this.get(email)) return 'busy'
    try { this.starts.consume(email) } catch (error) { if (error instanceof QueueFullError) return 'limited'; throw error }
    const call: LiveCall = { id: randomUUID(), purpose, startedAt: Date.now(), upstreamId: null }
    this.calls.set(email, call)
    return call
  }

  release(email: string, id: string): void {
    if (this.calls.get(email)?.id === id) this.calls.delete(email)
  }
}
