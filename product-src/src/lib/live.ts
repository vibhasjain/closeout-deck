import { authedFetch } from '@/lib/api'
import { parseActions, stream } from '@/lib/chat'
import type { Action, ChatMode, TurnContext } from '@/lib/chat'
import { isAction } from '@/lib/chatActions'
import { viewerSession } from '@/lib/viewerSession'
import { scheduleMemoryRefresh } from '@/lib/memory'

export const MICROPHONE_CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } } as const
export const CALL_OPENER = 'The call just connected and the user is waiting. Say your opener now.'
export const MIC_BLOCKED = 'Your browser blocked the mic. Allow it and try again, or keep typing.'
export type CallPurpose = 'onboard' | 'desk'
export interface LiveContext {
  [key: string]: unknown
  firm?: string | { name: string; summary?: string; states?: string[] }
  known?: string | Record<string, unknown>
  uncovered?: string[]
  cycleId?: string
  page?: string
}
export interface TranscriptTurn { role: 'user' | 'agent'; text: string; startMs: number; endMs: number }
export interface CallLevelSource { get: () => number; subscribe: (listener: (level: number) => void) => () => void }
export interface CallSnapshot {
  status: 'connecting' | 'active' | 'ending' | 'ended' | 'error'
  orb: 'connecting' | 'listening' | 'composing' | 'working'
  stream: MediaStream | null
  remoteStream: MediaStream | null
  muted: boolean
  seconds: number
  caption: string
  transcript: TranscriptTurn[]
  level: number
  levelSource?: CallLevelSource
  callId?: string
  error?: string
  errorKind?: 'call' | 'save'
  note?: string
}
export type LiveEvent = { type: 'state'; snapshot: CallSnapshot }
  | { type: 'actions'; actions: Action[] }
  | { type: 'error'; message: string }
  | { type: 'completed'; callId: string; seconds: number; transcript: TranscriptTurn[]; final: string; saveError?: string; serverSaved?: boolean }
export interface CallActionError { error: string; retry: () => Promise<void> }
export interface CallOptions {
  purpose: CallPurpose
  context: LiveContext
  getContext?: () => LiveContext
  onActions?: (actions: Action[]) => void | CallActionError | Promise<void | CallActionError>
  onSkipped?: (skipped: string[]) => void
  onPersist?: (record: { sessionId: string; purpose: CallPurpose; startedAt: number; seconds: number; transcript: TranscriptTurn[] }, final?: boolean) => void
  onSaved?: (sessionId: string) => void
  onEvent: (event: LiveEvent) => void
}
export interface CallHandle {
  snapshot: () => CallSnapshot
  mute: (muted?: boolean) => void
  hangup: () => Promise<void>
  dispose: () => Promise<void>
  retrySave: () => Promise<void>
  release: () => Promise<void>
  retryTurn: () => Promise<void>
}

export function voiceError(error: unknown): string {
  if (error instanceof Error && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)) return MIC_BLOCKED
  return error instanceof Error ? error.message : 'The call could not connect. Try again.'
}

export async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({})) as { message?: string; error?: string }
  const messages: Record<string, string> = {
    call_in_progress: 'A call is already open. End that call and try again.',
    too_many_calls: 'You have started too many calls. Try again in a little while.',
    too_many_dictations: 'You have started too many dictations. Try again in a little while.',
    voice_not_configured: 'Voice is not configured yet. Try again in a moment.',
  }
  return new Error(body.message ?? messages[body.error ?? ''] ?? fallback)
}

/** The answer endpoint accepts a complete SDP, rather than subsequent ICE candidates. */
export function waitForIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('The microphone connection timed out. Try again.')), 15_000)
    const changed = () => { if (pc.iceGatheringState === 'complete') finish() }
    const finish = (error?: Error) => {
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', changed)
      if (error) reject(error); else resolve()
    }
    pc.addEventListener('icegatheringstatechange', changed)
    changed()
  })
}

interface Fragment extends TranscriptTurn { sequence: number }

/** Audio timestamps determine turn order; a silence over 1.5 seconds starts a new turn. */
export function stitchTranscript(fragments: readonly TranscriptTurn[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = []
  for (const fragment of [...fragments].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)) {
    const previous = turns.at(-1)
    if (previous?.role === fragment.role && fragment.startMs - previous.endMs <= 1500) {
      previous.text += fragment.text
      previous.endMs = Math.max(previous.endMs, fragment.endMs)
    } else turns.push({ ...fragment })
  }
  return turns.map(turn => ({ ...turn, text: turn.text.trim() })).filter(turn => turn.text)
}

/** Keep every saved row inside the server's 400-character / 200-row contract. */
export function callEndTranscript(turns: readonly TranscriptTurn[]) {
  const merged: { role: 'user' | 'agent'; text: string; startMs: number }[] = []
  for (const turn of turns) {
    const previous = merged.at(-1)
    if (previous?.role === turn.role) previous.text += ` ${turn.text}`
    else merged.push({ role: turn.role, text: turn.text, startMs: turn.startMs })
  }
  const rows = merged.flatMap(turn => {
    const pieces: { role: 'user' | 'agent'; text: string; startMs: number }[] = []
    for (let offset = 0; offset < turn.text.length; offset += 400) pieces.push({ role: turn.role, text: turn.text.slice(offset, offset + 400), startMs: turn.startMs })
    return pieces
  }).slice(-200)
  // Keep the authenticated end request below the browser's 64 KiB keepalive quota,
  // including non-ASCII speech, so navigating away still releases the server lock.
  const encoder = new TextEncoder()
  while (rows.length && encoder.encode(JSON.stringify(rows)).byteLength > 60_000) rows.shift()
  return rows
}

let activeCall: CallHandle | null = null

export function startCall(options: CallOptions): CallHandle {
  const bearerToken = viewerSession()?.sessionToken
  const owner = viewerSession()?.email ?? 'development'
  let level = 0
  const levelListeners = new Set<(value: number) => void>()
  const levelSource: CallLevelSource = { get: () => level, subscribe: listener => { levelListeners.add(listener); return () => { levelListeners.delete(listener) } } }
  let state: CallSnapshot = { status: 'connecting', orb: 'connecting', stream: null, remoteStream: null, muted: false, seconds: 0, caption: '', transcript: [], level: 0, levelSource }
  let pc: RTCPeerConnection | null = null, channel: RTCDataChannel | null = null, audio: HTMLAudioElement | null = null
  let audioContext: AudioContext | null = null, micAnalyser: AnalyserNode | null = null, remoteAnalyser: AnalyserNode | null = null
  let sessionId: string | null = null, started = false, stopped = false, unloading = false, saved = false, completed = false, serverSaved = true
  let startedAt = 0, fragmentSequence = 0, scribeBusy = false, working = 0
  let spokenRole: 'user' | 'agent' | null = null
  let finishPromise: Promise<void> | null = null, endPromise: Promise<void> | null = null, hangupPromise: Promise<void> | null = null
  let closeResolve: (() => void) | null = null
  let scribeTimer: ReturnType<typeof setTimeout> | undefined, speakingTimer: ReturnType<typeof setTimeout> | undefined
  let connectTimer: ReturnType<typeof setTimeout> | undefined
  let clockTimer: ReturnType<typeof setInterval> | undefined, levelTimer: ReturnType<typeof setInterval> | undefined
  let pendingInput: Fragment[] = [], queuedInput: Fragment[] = []
  const fragments: Fragment[] = [], seenDelegations = new Set<string>(), brainControllers = new Set<AbortController>()
  let delegateQueue = Promise.resolve()
  let retryTurn: (() => Promise<void>) | undefined
  let pendingSession: Promise<void> | undefined, resolvePendingSession: (() => void) | undefined
  const currentContext = () => options.getContext?.() ?? options.context
  const emit = () => options.onEvent({ type: 'state', snapshot: { ...state, transcript: state.transcript.map(turn => ({ ...turn })) } })
  const orb = () => { state = { ...state, orb: !started ? 'connecting' : spokenRole === 'agent' ? 'composing' : working ? 'working' : 'listening' }; emit() }
  const send = (type: string, fields: Record<string, unknown> = {}) => {
    if (!started || stopped || channel?.readyState !== 'open') return false
    channel.send(JSON.stringify({ type, event_id: crypto.randomUUID(), ...fields }))
    return true
  }
  const reportError = (error: unknown, errorKind: 'call' | 'save' = 'call') => {
    const message = voiceError(error)
    state = { ...state, status: 'error', error: message, errorKind }; emit()
    options.onEvent({ type: 'error', message })
  }
  const turnError = (error: unknown, retry: () => Promise<void>) => {
    console.warn('Call turn failed:', error)
    retryTurn = retry
    state = { ...state, note: voiceError(error) }; emit()
  }
  const persistLocal = (final = false) => {
    if (sessionId) options.onPersist?.({ sessionId, purpose: options.purpose, startedAt: startedAt || Date.now(), seconds: state.seconds, transcript: state.transcript }, final)
  }
  const updateSeconds = () => {
    if (startedAt) state = { ...state, seconds: Math.min(3600, Math.max(state.seconds, Math.floor((Date.now() - startedAt) / 1000))) }
  }
  const endBody = () => JSON.stringify({ seconds: state.seconds, transcript: callEndTranscript(state.transcript) })
  const persistEnd = async () => {
    if (!sessionId || saved) return
    if (endPromise) return endPromise
    endPromise = (async () => {
      const response = await authedFetch(`/live-session/${encodeURIComponent(sessionId!)}/end`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}) }, body: endBody(), keepalive: true })
      if (!response.ok && response.status !== 404) throw await responseError(response, 'The call ended, but its notes could not be saved. Retry saving to finish saving them.')
      serverSaved = response.status !== 404
      saved = true
      if (serverSaved) scheduleMemoryRefresh(owner)
    })()
    try { await endPromise } finally { endPromise = null }
  }
  const brain = async (message: string, context: TurnContext, mode: ChatMode) => {
    const controller = new AbortController(); brainControllers.add(controller)
    let final: string | undefined, streamed = ''
    try {
      for await (const event of stream(message, context, mode, controller.signal)) {
        if (event.error) throw new Error(event.error)
        if (mode === 'consolidate' && event.text) streamed += event.text
        if (event.done) final = event.final ?? (mode === 'consolidate' ? streamed : '')
      }
      if (controller.signal.aborted) throw new DOMException('Call ended', 'AbortError')
      if (final === undefined) throw new Error('The agent did not finish processing the call. Try again.')
      const parsed = parseActions(final), actions = parsed.actions.filter(isAction)
      const skipped = [...(parsed.skipped ?? []), ...parsed.actions.filter(action => !isAction(action)).map(action => {
        const type = (action as { type?: unknown } | null)?.type
        return typeof type === 'string' ? `${type}: invalid action`.slice(0, 200) : 'invalid action'
      })]
      if (skipped.length) options.onSkipped?.(skipped)
      if (actions.length) {
        const actionError = await options.onActions?.(actions)
        if (actionError && !stopped) turnError(new Error(actionError.error), actionError.retry)
        options.onEvent({ type: 'actions', actions })
      }
      return parsed.text
    } finally { brainControllers.delete(controller) }
  }
  const stopMedia = () => {
    if (stopped) return
    stopped = true; updateSeconds(); persistLocal(true)
    closeResolve?.()
    clearTimeout(scribeTimer); clearTimeout(speakingTimer); clearTimeout(connectTimer)
    clearInterval(clockTimer); clearInterval(levelTimer)
    for (const controller of brainControllers) controller.abort()
    state.stream?.getTracks().forEach(track => track.stop())
    state.remoteStream?.getTracks().forEach(track => track.stop())
    channel?.close(); pc?.close()
    if (audio) { audio.pause(); audio.srcObject = null; audio.remove() }
    void audioContext?.close().catch(() => {})
    state = { ...state, stream: null, remoteStream: null, level: 0 }
    level = 0; for (const listener of levelListeners) listener(0)
    if (activeCall === handle) activeCall = null
  }
  const release = async () => {
    stopMedia()
    await pendingSession
    await persistEnd()
    if (sessionId && !started) { options.onSaved?.(sessionId); window.removeEventListener('pagehide', pagehide) }
  }
  const postCompleted = (final: string, saveError?: string) => {
    if (started && sessionId && !unloading) options.onEvent({ type: 'completed', callId: sessionId, seconds: state.seconds, transcript: state.transcript, final, saveError, serverSaved: saved && serverSaved })
  }
  const finish = (): Promise<void> => {
    stopMedia()
    if (finishPromise) return finishPromise
    finishPromise = (async () => {
      await release()
      if (!sessionId || !started) {
        window.removeEventListener('pagehide', pagehide)
        if (state.status !== 'error') state = { ...state, status: 'ended' }
        emit(); return
      }
      if (!completed && !unloading) {
        const final = serverSaved ? await brain('call ended', { callId: sessionId }, 'consolidate') : 'This call was not saved on the server. Your transcript is available here.'
        if (!unloading) {
          postCompleted(final); completed = true
          options.onSaved?.(sessionId)
          window.removeEventListener('pagehide', pagehide)
        }
      }
      if (state.status !== 'error' || state.errorKind === 'save') state = { ...state, status: 'ended', error: undefined, errorKind: undefined }
      emit()
    })().catch(error => { finishPromise = null; postCompleted('', voiceError(error)); reportError(error, 'save'); throw error })
    return finishPromise
  }
  const fail = (error: unknown) => { if (!stopped) { reportError(error); void finish().catch(() => {}) } }
  const pagehide = () => {
    unloading = true; stopMedia()
    // fetch keepalive preserves the Authorization header; sendBeacon cannot set it.
    void persistEnd().catch(() => {})
  }
  const runScribe = async () => {
    if (scribeBusy || stopped || !queuedInput.length) return
    const input = queuedInput; queuedInput = []
    const message = stitchTranscript(input).map(turn => turn.text).join('\n').trim()
    if (!message) return
    scribeBusy = true
    try {
      const context = currentContext()
      const asked = state.transcript.filter(turn => turn.role === 'agent' && turn.startMs <= input[0].startMs).at(-1)?.text
      const scribeContext = { purpose: options.purpose, known: context.known, uncovered: context.uncovered, asked }
      const final = await brain(message, scribeContext, 'scribe')
      const latest = currentContext(), next = /^next:\s*(.+)$/m.exec(final)?.[1] ?? latest.uncovered?.[0] ?? 'none'
      // A deliberately small hint remains comfortably inside the 500-token append budget.
      const known = typeof latest.known === 'string' ? latest.known : JSON.stringify(latest.known ?? {})
      send('session.thinking.append', { delegation_id: null, content: `Known: ${known.slice(0, 900)}\nNext uncovered goal: ${next.slice(0, 100)}` })
    } catch (error) { if (!stopped) turnError(error, async () => { queuedInput.unshift(...input); await runScribe() }) }
    finally { scribeBusy = false; if (!stopped) void runScribe() }
  }
  const delegate = (id: string, offsetMs: number) => {
    if (seenDelegations.has(id)) return
    seenDelegations.add(id); working++; orb()
    const userTurns = state.transcript.filter(turn => turn.role === 'user' && turn.startMs <= offsetMs + 1500)
    const nearby = userTurns.filter(turn => turn.endMs >= offsetMs - 30_000)
    const message = (nearby.length ? nearby : userTurns.slice(-2)).map(turn => turn.text).join('\n')
    const answer = async () => {
      if (stopped) return
      try {
        if (!message.trim()) { send('session.commentary.append', { delegation_id: id, content: "I couldn't get that just now. Ask me again in a moment." }); return }
        const context = currentContext()
        const final = await brain(message, { ...context, purpose: options.purpose }, 'delegate')
        if (!final.trim()) throw new Error('The agent could not answer that turn. Try again.')
        send('session.commentary.append', { delegation_id: id, content: final.slice(0, 1500) })
      } catch (error) {
        if (!stopped) {
          send('session.commentary.append', { delegation_id: id, content: "I couldn't get that just now. Ask me again in a moment." })
          turnError(error, answer)
        }
      }
    }
    delegateQueue = delegateQueue.then(answer).finally(() => { working--; if (!stopped) orb() })
  }
  const receive = (message: MessageEvent) => {
    if (stopped) return
    let event: Record<string, unknown>
    try { event = JSON.parse(String(message.data)) as Record<string, unknown> } catch { return }
    if (event.type === 'session.started') {
      if (started) return
      started = true; startedAt = Date.now(); clearTimeout(connectTimer)
      state = { ...state, status: 'active' }; orb()
      persistLocal(true)
      send('session.commentary.append', { delegation_id: null, content: CALL_OPENER })
      if (state.muted) send('session.input_audio.mute')
      clockTimer = setInterval(() => { updateSeconds(); persistLocal(); emit(); if (state.seconds >= 30 * 60) void handle.hangup().catch(() => {}) }, 1000)
    } else if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
      if (typeof event.delta !== 'string' || typeof event.start_ms !== 'number' || typeof event.end_ms !== 'number') return
      const role = event.type === 'session.input_transcript.delta' ? 'user' : 'agent'
      const fragment: Fragment = { role, text: event.delta, startMs: event.start_ms, endMs: event.end_ms, sequence: fragmentSequence++ }
      fragments.push(fragment)
      state = { ...state, transcript: stitchTranscript(fragments) }
      state.caption = state.transcript.filter(turn => turn.role === role).at(-1)?.text ?? ''
      spokenRole = role; clearTimeout(speakingTimer); speakingTimer = setTimeout(() => { spokenRole = null; if (!stopped) { persistLocal(true); orb() } }, 1500)
      if (role === 'user') {
        pendingInput.push(fragment); clearTimeout(scribeTimer)
        scribeTimer = setTimeout(() => { persistLocal(true); queuedInput.push(...pendingInput); pendingInput = []; void runScribe() }, 1200)
      }
      orb()
    } else if (event.type === 'session.input_transcript.done' || event.type === 'session.output_transcript.done' || event.type === 'session.input_transcript.final' || event.type === 'session.output_transcript.final') {
      persistLocal(true)
    } else if (event.type === 'session.delegation.created') {
      const delegation = event.delegation as { id?: unknown } | undefined
      if (typeof delegation?.id === 'string') delegate(delegation.id, typeof event.offset_ms === 'number' ? event.offset_ms : Infinity)
    } else if (event.type === 'session.usage.updated' || event.type === 'session.closed') {
      const usage = event.usage as { seconds?: unknown } | undefined
      if (typeof usage?.seconds === 'number' && Number.isFinite(usage.seconds)) state = { ...state, seconds: Math.min(3600, Math.max(state.seconds, usage.seconds)) }
      if (event.type === 'session.closed') {
        closeResolve?.()
        if (event.reason === 'connection_lost') reportError(new Error('The call disconnected. Try again.'))
        void finish().catch(() => {})
      } else emit()
    } else if (event.type === 'error') {
      const error = event.error as { message?: unknown } | undefined
      turnError(new Error(typeof error?.message === 'string' ? error.message : 'The call encountered an error. Try again.'), async () => {
        send('session.commentary.append', { delegation_id: null, content: 'Please try the previous turn again.' })
      })
    }
  }
  const initialize = async () => {
    try {
      if (stopped) return
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') throw new Error('This browser cannot start a voice call. Try again in a browser with microphone support.')
      const microphone = await navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS)
      if (stopped) { microphone.getTracks().forEach(track => track.stop()); return }
      state = { ...state, stream: microphone }; emit()
      pc = new RTCPeerConnection()
      microphone.getTracks().forEach(track => {
        track.enabled = !state.muted; pc!.addTrack(track, microphone)
        track.addEventListener?.('ended', () => fail(new Error('The microphone disconnected. Retry the call.')))
      })
      audio = document.createElement('audio'); audio.autoplay = true; audio.setAttribute('playsinline', ''); audio.hidden = true; document.body.appendChild(audio)
      if (typeof AudioContext !== 'undefined') {
        audioContext = new AudioContext(); await audioContext.resume()
        if (stopped) return
        micAnalyser = audioContext.createAnalyser(); micAnalyser.fftSize = 256; audioContext.createMediaStreamSource(microphone).connect(micAnalyser)
        const samples = new Uint8Array(256)
        const rms = (analyser: AnalyserNode | null) => {
          if (!analyser) return 0
          analyser.getByteTimeDomainData(samples)
          return Math.min(1, Math.sqrt(samples.reduce((total, sample) => total + ((sample - 128) / 128) ** 2, 0) / samples.length) * 4)
        }
        levelTimer = setInterval(() => {
          level = Math.max(state.muted ? 0 : rms(micAnalyser), rms(remoteAnalyser))
          for (const listener of levelListeners) listener(level)
        }, 80)
      }
      pc.ontrack = event => {
        if (stopped || !audio) return
        const remote = event.streams[0] ?? new MediaStream([event.track])
        audio.srcObject = remote; state = { ...state, remoteStream: remote }; emit()
        if (audioContext) { remoteAnalyser = audioContext.createAnalyser(); remoteAnalyser.fftSize = 256; audioContext.createMediaStreamSource(remote).connect(remoteAnalyser) }
        const play = async () => { await audio?.play() }
        void play().catch(() => turnError(new Error('Your browser blocked call audio. Retry to allow playback.'), play))
      }
      pc.onconnectionstatechange = () => {
        if (pc?.connectionState === 'failed') fail(new Error('The call connection failed. Try again.'))
      }
      channel = pc.createDataChannel('oai-events'); channel.onmessage = receive
      channel.onclose = () => { if (!stopped) fail(new Error('The call disconnected. Try again.')) }
      channel.onerror = () => fail(new Error('The call connection failed. Try again.'))
      await pc.setLocalDescription(await pc.createOffer()); await waitForIce(pc)
      if (stopped) return
      const context = currentContext()
      pendingSession = new Promise(resolve => { resolvePendingSession = resolve })
      const response = await authedFetch('/live-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: pc.localDescription?.sdp, purpose: options.purpose,
        context: { firm: context.firm, known: context.known, uncovered: context.uncovered, cycleId: context.cycleId } }) })
      if (!response.ok) throw await responseError(response, 'The Closeout Agent could not start the call. Try again in a moment.')
      const answer = await response.json() as { sdp?: string; sessionId?: string }
      sessionId = answer.sessionId ?? null
      if (sessionId) { startedAt = Date.now(); state = { ...state, callId: sessionId }; persistLocal(true); emit() }
      resolvePendingSession?.()
      if (stopped) { await persistEnd(); if (!started) options.onSaved?.(sessionId!); return }
      if (!sessionId || !answer.sdp) throw new Error('The call returned an invalid connection. Try again.')
      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
      if (!started && !stopped) connectTimer = setTimeout(() => fail(new Error('The call did not connect. Try again.')), 30_000)
    } catch (error) { resolvePendingSession?.(); if (!stopped) fail(error) }
  }
  const handle: CallHandle = {
    snapshot: () => ({ ...state, transcript: state.transcript.map(turn => ({ ...turn })) }),
    mute: (muted = !state.muted) => {
      state = { ...state, muted }; state.stream?.getAudioTracks().forEach(track => { track.enabled = !muted })
      send(muted ? 'session.input_audio.mute' : 'session.input_audio.unmute'); emit()
    },
    hangup: () => {
      if (stopped) return finish()
      if (hangupPromise) return hangupPromise
      clearInterval(clockTimer)
      state = { ...state, status: 'ending' }; emit()
      hangupPromise = (async () => {
        if (started && channel?.readyState === 'open') {
          await new Promise<void>(resolve => {
            const timeout = setTimeout(resolve, 5000)
            closeResolve = () => { clearTimeout(timeout); resolve() }
            send('session.close')
          })
        }
        await finish()
      })()
      return hangupPromise
    },
    dispose: () => finish(),
    retrySave: () => finish(),
    release,
    retryTurn: async () => {
      if (stopped || !retryTurn) return
      const retry = retryTurn; retryTurn = undefined
      state = { ...state, note: undefined }; emit()
      try { await retry() } catch (error) { if (!stopped) turnError(error, retry) }
    },
  }
  if (activeCall) { queueMicrotask(() => { reportError(new Error('A call is already open. End that call and try again.')); stopped = true }); return handle }
  activeCall = handle
  window.addEventListener('pagehide', pagehide)
  queueMicrotask(() => { emit(); void initialize() })
  return handle
}
