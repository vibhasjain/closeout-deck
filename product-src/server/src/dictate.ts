// Composer dictation only. The voice agent stays GPT-Live-1 (live.ts) with no fallback. gpt-live-transcribe is served
// only by Realtime transcription sessions, so dictation uses that transport (orchestrator decision, Sep 25 2026).
// Ported from agent-keyboard-mpp server/src/realtime.ts transcriptionBody(), minus its env override and fallback.
// The SDP exchange happens here, server-side, so the API key and any client secret never reach the browser.
export const DICTATE_MODEL = 'gpt-live-transcribe'
export const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'
export const DICTATE_ERROR = 'Dictation is unavailable right now. Try again in a moment.'

/** Transcription-only session: no responses, no audio out. gpt-live-transcribe has no turn detection. */
export function transcriptionSession() {
  return {
    type: 'transcription',
    audio: { input: { transcription: { model: DICTATE_MODEL, language: 'en' }, noise_reduction: { type: 'near_field' } } },
  }
}

export class DictateUpstreamError extends Error {
  constructor() { super('dictate_upstream') }
}

/** Unified WebRTC interface: multipart sdp + session, answered with the SDP as text. Failures are logged, never forwarded. */
export async function createDictation(input: { sdp: string; apiKey: string; fetch?: typeof fetch }): Promise<string> {
  const form = new FormData()
  form.set('sdp', input.sdp)
  form.set('session', JSON.stringify(transcriptionSession()))
  let response: Response
  try {
    response = await (input.fetch ?? fetch)(REALTIME_CALLS_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${input.apiKey}` }, body: form, signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    console.error('Dictation session request failed:', error instanceof Error ? error.name : 'Error')
    throw new DictateUpstreamError()
  }
  const answer = await response.text().catch(() => '')
  if (!response.ok || !answer.startsWith('v=0')) {
    console.error(`Dictation session rejected: status=${response.status} body=${answer.slice(0, 1_000)}`)
    throw new DictateUpstreamError()
  }
  return answer
}
