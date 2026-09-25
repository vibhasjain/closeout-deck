import { authedFetch } from '@/lib/api'
import { MICROPHONE_CONSTRAINTS, responseError, voiceError, waitForIce } from '@/lib/live'

export type DictationState = 'connecting' | 'listening' | 'finishing' | 'ended' | 'error'
export interface DictationOptions {
  onTranscript: (text: string, final: boolean) => void
  onError: (message: string) => void
  onState?: (state: DictationState) => void
}
export interface DictationHandle { stop: () => Promise<string>; dispose: () => void }

function transcriptionError(code?: string): string {
  if (code === 'input_audio_buffer_commit_empty' || code === 'input_audio_buffer_too_small') return 'No speech was captured. Try again and speak before stopping.'
  if (code === 'rate_limit_exceeded' || code === 'insufficient_quota') return 'Dictation is busy right now. Try again in a moment.'
  if (code === 'session_expired') return 'Dictation timed out. Try again.'
  return 'Dictation could not transcribe the audio. Try again.'
}

/** A microphone-only transcription session. Commit speech on stop, and cap the mic at two minutes. */
export function startDictation(options: DictationOptions): DictationHandle {
  let pc: RTCPeerConnection | null = null, channel: RTCDataChannel | null = null, microphone: MediaStream | null = null
  let disposed = false, stopRequested = false, committed = false, text = '', completedText: string | null = null
  let finishResolve: ((text: string) => void) | null = null, finishReject: ((error: Error) => void) | null = null
  let finishPromise: Promise<string> | null = null, timer: ReturnType<typeof setTimeout> | undefined
  let connectTimer: ReturnType<typeof setTimeout> | undefined, autoStopTimer: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => {
    disposed = true; clearTimeout(timer); clearTimeout(connectTimer); clearTimeout(autoStopTimer)
    microphone?.getTracks().forEach(track => track.stop()); channel?.close(); pc?.close()
    window.removeEventListener('pagehide', dispose)
  }
  const fail = (error: unknown) => {
    if (disposed) return
    const message = voiceError(error)
    cleanup(); options.onState?.('error'); options.onError(message); finishReject?.(new Error(message))
  }
  const commit = () => {
    if (!stopRequested || committed || disposed || channel?.readyState !== 'open') return
    committed = true
    microphone?.getAudioTracks().forEach(track => { track.enabled = false })
    channel.send(JSON.stringify({ type: 'input_audio_buffer.commit', event_id: crypto.randomUUID() }))
    timer = setTimeout(() => fail(new Error('The final dictation did not arrive. Try again.')), 10_000)
  }
  const dispose = () => { if (!disposed) { cleanup(); options.onState?.('ended'); finishResolve?.(text) } }
  const stop = () => {
    if (completedText !== null) return Promise.resolve(completedText)
    if (disposed) return Promise.reject(new Error('Dictation has ended. Try again.'))
    if (finishPromise) return finishPromise
    stopRequested = true; options.onState?.('finishing'); clearTimeout(autoStopTimer)
    finishPromise = new Promise<string>((resolve, reject) => { finishResolve = resolve; finishReject = reject })
    // A second click or Enter during connection must never commit an empty audio buffer.
    if (!text.trim()) { completedText = ''; cleanup(); options.onState?.('ended'); finishResolve?.('') }
    else commit()
    return finishPromise
  }
  const initialize = async () => {
    try {
      if (disposed) return
      options.onState?.('connecting')
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') throw new Error('This browser cannot start dictation. Try again in a browser with microphone support.')
      const media = await navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS)
      if (disposed) { media.getTracks().forEach(track => track.stop()); return }
      microphone = media; pc = new RTCPeerConnection()
      autoStopTimer = setTimeout(() => { void stop().catch(() => {}) }, 120_000)
      media.getTracks().forEach(track => pc!.addTrack(track, media))
      channel = pc.createDataChannel('oai-events')
      channel.onopen = () => { clearTimeout(connectTimer); if (!stopRequested) options.onState?.('listening'); commit() }
      channel.onclose = () => { if (!disposed) fail(new Error('Dictation disconnected. Try again.')) }
      channel.onerror = () => fail(new Error('Dictation could not connect. Try again.'))
      channel.onmessage = message => {
        let event: { type?: string; delta?: string; transcript?: string; error?: { code?: string } }
        try { event = JSON.parse(String(message.data)) as typeof event } catch { return }
        if (disposed) return
        if (event.type === 'conversation.item.input_audio_transcription.delta' && typeof event.delta === 'string') {
          text += event.delta; options.onTranscript(text, false)
        } else if (event.type === 'conversation.item.input_audio_transcription.completed' && typeof event.transcript === 'string') {
          text = event.transcript; completedText = text; options.onTranscript(text, true)
          cleanup(); options.onState?.('ended'); finishResolve?.(text)
        } else if (event.type === 'error' || event.type === 'conversation.item.input_audio_transcription.failed') {
          fail(new Error(transcriptionError(event.error?.code)))
        }
      }
      pc.onconnectionstatechange = () => { if (pc?.connectionState === 'failed') fail(new Error('Dictation could not connect. Try again.')) }
      await pc.setLocalDescription(await pc.createOffer()); await waitForIce(pc)
      if (disposed) return
      const response = await authedFetch('/dictate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: pc.localDescription?.sdp }) })
      if (!response.ok) throw await responseError(response, 'Dictation is unavailable right now. Try again in a moment.')
      const answer = await response.json() as { sdp?: string }
      if (disposed) return
      if (!answer.sdp) throw new Error('Dictation returned an invalid connection. Try again.')
      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
      if (channel.readyState === 'open') { if (!stopRequested) options.onState?.('listening'); commit() }
      else connectTimer = setTimeout(() => fail(new Error('Dictation did not connect. Try again.')), 30_000)
    } catch (error) { fail(error) }
  }
  window.addEventListener('pagehide', dispose)
  queueMicrotask(() => { void initialize() })
  return { stop, dispose }
}
