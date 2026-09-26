import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authedFetch } from '@/lib/api'
import { stream } from '@/lib/chat'
import { viewerSession } from '@/lib/viewerSession'
import * as memory from '@/lib/memory'
import { CALL_OPENER, MICROPHONE_CONSTRAINTS, callEndBody, callEndTranscript, startCall, stitchTranscript } from './live'
import type { CallHandle, LiveEvent } from './live'

vi.mock('@/lib/api', () => ({ authedFetch: vi.fn() }))
vi.mock('@/lib/viewerSession', () => ({ viewerSession: vi.fn(() => null) }))
vi.mock('@/lib/chat', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/chat')>(), stream: vi.fn() }))

class FakeChannel {
  readyState = 'open'
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: Record<string, unknown>[] = []
  send(message: string) { this.sent.push(JSON.parse(message)) }
  emit(event: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(event) }) }
  close() { this.readyState = 'closed'; this.onclose?.() }
}
class FakePeer extends EventTarget {
  static instances: FakePeer[] = []
  static iceState = 'complete'
  iceGatheringState = FakePeer.iceState
  connectionState = 'new'
  onconnectionstatechange: (() => void) | null = null
  localDescription: { sdp: string } | null = null
  channel = new FakeChannel()
  closed = false
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'v=0\noffer' }))
  setLocalDescription = vi.fn(async (offer: { sdp: string }) => { this.localDescription = offer })
  setRemoteDescription = vi.fn(async () => {})
  addTrack = vi.fn()
  createDataChannel = vi.fn(() => this.channel)
  constructor() { super(); FakePeer.instances.push(this) }
  close() { this.closed = true }
}
let handle: CallHandle | undefined
let events: LiveEvent[], microphoneTrack: { enabled: boolean; stop: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> }, microphone: MediaStream
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve() }
const fetchMock = vi.mocked(authedFetch)
const streamMock = vi.mocked(stream)
const peer = () => FakePeer.instances.at(-1)!
const channel = () => peer().channel
const endCalls = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/end'))
const started = async () => { await flush(); channel().emit({ type: 'session.started' }); await flush() }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  FakePeer.instances = []; FakePeer.iceState = 'complete'; events = []; handle = undefined
  microphoneTrack = { enabled: true, stop: vi.fn(), addEventListener: vi.fn() }
  microphone = { getTracks: () => [microphoneTrack], getAudioTracks: () => [microphoneTrack] } as unknown as MediaStream
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => microphone) } })
  vi.stubGlobal('RTCPeerConnection', FakePeer)
  vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: () => ({ autoplay: false, setAttribute: vi.fn(), play: vi.fn(async () => {}), pause: vi.fn(), remove: vi.fn() }) })
  fetchMock.mockImplementation(async url => new Response(JSON.stringify(url.endsWith('/end') ? { callId: 'call-1' } : { sessionId: 'call-1', sdp: 'v=0\nanswer' }), { status: 200 }))
  streamMock.mockImplementation(async function* () { yield { done: true, final: 'next: workerHours' } })
  vi.mocked(viewerSession).mockReturnValue(null)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => { await handle?.dispose().catch(() => {}); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
const call = (extra: Partial<Parameters<typeof startCall>[0]> = {}) => {
  handle = startCall({ purpose: 'onboard', context: { uncovered: ['calendar', 'workerHours'] }, onEvent: event => events.push(event), ...extra })
  return handle
}

describe('GPT-Live call lifecycle', () => {
  it('schedules the two memory reads once after a successful call end, including save retries', async () => {
    const schedule = vi.spyOn(memory, 'scheduleMemoryRefresh').mockImplementation(() => {})
    call(); await started()
    const ending = handle!.hangup()
    channel().emit({ type: 'session.closed' }); await ending
    await handle!.retrySave()
    expect(schedule).toHaveBeenCalledExactlyOnceWith('development')
  })

  it('does not schedule memory learning for a call missing from the server', async () => {
    const schedule = vi.spyOn(memory, 'scheduleMemoryRefresh').mockImplementation(() => {})
    call(); await started()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }))
    const ending = handle!.hangup()
    channel().emit({ type: 'session.closed' }); await ending
    expect(schedule).not.toHaveBeenCalled()
  })

  it('gathers ICE before POST, asks for echo cancellation, and sends nothing before session.started', async () => {
    FakePeer.iceState = 'gathering'
    call(); await flush()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(MICROPHONE_CONSTRAINTS)
    expect(peer().createDataChannel).toHaveBeenCalledWith('oai-events')
    handle!.mute(true)
    expect(fetchMock).not.toHaveBeenCalled(); expect(channel().sent).toEqual([])
    peer().iceGatheringState = 'complete'; peer().dispatchEvent(new Event('icegatheringstatechange')); await flush()
    expect(fetchMock).toHaveBeenCalledWith('/live-session', expect.objectContaining({ method: 'POST' }))
    expect(channel().sent).toEqual([])
    channel().emit({ type: 'session.started' })
    expect(channel().sent[0]).toMatchObject({ type: 'session.commentary.append', delegation_id: null, content: CALL_OPENER })
    expect(channel().sent[1]).toMatchObject({ type: 'session.input_audio.mute' })
  })

  it('serializes scribe requests, merges waiting turns, applies actions first, and identifies every append', async () => {
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    let scribeCount = 0, inFlight = 0, maximum = 0
    streamMock.mockImplementation(async function* (_message, _context, mode) {
      if (mode === 'scribe') {
        inFlight++; maximum = Math.max(maximum, inFlight)
        if (++scribeCount === 1) await blocked
        inFlight--
        yield { done: true, final: '```action\n{"type":"cover_topic","topic":"calendar"}\n```\nnext: workerHours' }
      } else yield { done: true, final: 'Saved.' }
    })
    const onActions = vi.fn(() => { expect(channel().sent.filter(event => event.type === 'session.thinking.append')).toHaveLength(scribeCount - 1) })
    call({ onActions }); await started()
    const input = (delta: string, start: number) => channel().emit({ type: 'session.input_transcript.delta', delta, start_ms: start, end_ms: start + 300 })
    input('Weekly.', 0); await vi.advanceTimersByTimeAsync(1200)
    input('Friday.', 2000); await vi.advanceTimersByTimeAsync(1200)
    input('Email.', 4000); await vi.advanceTimersByTimeAsync(1200)
    expect(scribeCount).toBe(1)
    release(); await flush()
    expect(scribeCount).toBe(2); expect(maximum).toBe(1)
    expect(streamMock.mock.calls.filter(args => args[2] === 'scribe')[1][0]).toBe('Friday.\nEmail.')
    expect(onActions).toHaveBeenCalledTimes(2)
    const appends = channel().sent.filter(event => String(event.type).endsWith('.append'))
    expect(appends).toHaveLength(3)
    expect(appends.every(event => typeof event.event_id === 'string' && event.event_id.length > 0)).toBe(true)
    expect(new Set(appends.map(event => event.event_id)).size).toBe(3)
  })

  it('uses evt.delegation.id and strips applied actions from the spoken answer', async () => {
    const onActions = vi.fn()
    streamMock.mockImplementation(async function* () { yield { done: true, final: 'You have ten time entries.\n```action\n{"type":"cover_topic","topic":"workerHours"}\n```' } })
    call({ onActions }); await started()
    channel().emit({ type: 'session.input_transcript.delta', delta: 'How many time entries?', start_ms: 1000, end_ms: 1800 })
    channel().emit({ type: 'session.delegation.created', id: 'wrong', offset_ms: 2000, delegation: { id: 'correct-delegation' } })
    await flush()
    expect(streamMock).toHaveBeenCalledWith('How many time entries?', expect.objectContaining({ purpose: 'onboard' }), 'delegate', expect.any(AbortSignal))
    expect(onActions).toHaveBeenCalledWith([{ type: 'cover_topic', topic: 'workerHours' }])
    expect(channel().sent.at(-1)).toMatchObject({ type: 'session.commentary.append', delegation_id: 'correct-delegation', content: 'You have ten time entries.', event_id: expect.any(String) })
  })

  it('waits for session.closed before tearing down, saves the transcript, and consolidates', async () => {
    call(); await started()
    channel().emit({ type: 'session.input_transcript.delta', delta: 'Weekly.', start_ms: 100, end_ms: 600 })
    const ending = handle!.hangup()
    expect(channel().sent.at(-1)?.type).toBe('session.close'); expect(peer().closed).toBe(false)
    expect(endCalls()).toHaveLength(0)
    channel().emit({ type: 'session.closed', usage: { seconds: 18 } }); await ending
    expect(peer().closed).toBe(true); expect(microphoneTrack.stop).toHaveBeenCalledOnce(); expect(endCalls()).toHaveLength(1)
    expect(JSON.parse(String(endCalls()[0][1]?.body))).toEqual({ seconds: 18, transcript: [{ role: 'user', text: 'Weekly.', startMs: 100 }] })
    expect(streamMock).toHaveBeenCalledWith('call ended', { callId: 'call-1' }, 'consolidate', expect.any(AbortSignal))
    expect(events.find(event => event.type === 'completed')).toMatchObject({ callId: 'call-1', seconds: 18 })
  })

  it('tears down after the five-second close deadline', async () => {
    call(); await started(); const ending = handle!.hangup()
    await vi.advanceTimersByTimeAsync(4999); expect(endCalls()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1); await ending; expect(endCalls()).toHaveLength(1)
  })

  it('shares one close request while hangup is awaiting acknowledgement', async () => {
    call(); await started()
    const first = handle!.hangup(), second = handle!.hangup()
    expect(first).toBe(second)
    await vi.advanceTimersByTimeAsync(4000)
    expect(channel().sent.filter(event => event.type === 'session.close')).toHaveLength(1)
    channel().emit({ type: 'session.closed', reason: 'close_requested' })
    await Promise.all([first, second]); expect(endCalls()).toHaveLength(1)
  })

  it('applies streamed consolidation actions and closing text when done.final is omitted', async () => {
    const onActions = vi.fn()
    streamMock.mockImplementation(async function* (_message, _context, mode) {
      if (mode === 'consolidate') {
        yield { text: 'Your profile is saved.\n' }
        yield { text: '```action\n{"type":"cover_topic","topic":"calendar"}\n```' }
        yield { done: true }
      }
    })
    call({ onActions }); await started(); await handle!.dispose()
    expect(onActions).toHaveBeenCalledWith([{ type: 'cover_topic', topic: 'calendar' }])
    expect(events.find(event => event.type === 'completed')).toMatchObject({ final: 'Your profile is saved.' })
  })

  it('prefers an authoritative consolidation final over text deltas', async () => {
    streamMock.mockImplementation(async function* () {
      yield { text: 'Preliminary text.' }
      yield { done: true, final: 'Your profile is saved.' }
    })
    call(); await started(); await handle!.dispose()
    expect(events.find(event => event.type === 'completed')).toMatchObject({ final: 'Your profile is saved.' })
  })

  it('keeps a per-turn protocol error inline without hanging up and lets the user retry', async () => {
    call(); await started(); channel().emit({ type: 'error', error: { message: 'Network error' } }); await flush()
    expect(endCalls()).toHaveLength(0); expect(handle!.snapshot()).toMatchObject({ status: 'active', note: 'Network error' })
    await handle!.retryTurn()
    expect(channel().sent.at(-1)).toMatchObject({ type: 'session.commentary.append', content: 'Please try the previous turn again.' })
    expect(handle!.snapshot().note).toBeUndefined()
  })

  it('ends a call only when the peer transport fails or the mic track ends', async () => {
    call(); await started()
    peer().connectionState = 'failed'; peer().onconnectionstatechange?.(); await flush()
    expect(endCalls()).toHaveLength(1)
    expect(handle!.snapshot()).toMatchObject({ status: 'error', errorKind: 'call' })
    await handle!.dispose()
    call(); await started()
    const endedListener = microphoneTrack.addEventListener.mock.calls.at(-1)?.[1] as () => void
    endedListener(); await flush()
    expect(endCalls()).toHaveLength(2)
    expect(handle!.snapshot().error).toContain('microphone disconnected')
  })

  it('surfaces an explicit connection_lost close as an error with the call saved', async () => {
    call(); await started()
    channel().emit({ type: 'session.closed', reason: 'connection_lost', usage: { seconds: 12 } }); await flush()
    expect(endCalls()).toHaveLength(1)
    expect(handle!.snapshot()).toMatchObject({ status: 'error', error: 'The call disconnected. Try again.' })
    expect(events.find(event => event.type === 'completed')).toMatchObject({ callId: 'call-1', seconds: 12 })
  })

  it('uses authenticated fetch keepalive on pagehide and never consolidates during unload', async () => {
    call(); await started(); window.dispatchEvent(new Event('pagehide')); await flush()
    expect(endCalls()).toHaveLength(1); expect(endCalls()[0][1]?.keepalive).toBe(true)
    expect(peer().closed).toBe(true); expect(streamMock).not.toHaveBeenCalled()
  })

  it('posts full long turns on normal hang-up without applying the unload byte limit', async () => {
    call(); await started()
    for (let index = 0; index < 10; index++) channel().emit({ type: index % 2 ? 'session.input_transcript.delta' : 'session.output_transcript.delta', delta: '界'.repeat(4000), start_ms: index * 1000, end_ms: index * 1000 + 900 })
    await handle!.dispose()
    const request = endCalls()[0][1]!, body = JSON.parse(request.body as string)
    expect(request.keepalive).toBe(false)
    expect(body.transcript).toHaveLength(10)
    expect(body.transcript.every((turn: { text: string }) => turn.text.length === 4000)).toBe(true)
    expect(new TextEncoder().encode(request.body as string).byteLength).toBeGreaterThan(60_000)
  })

  it('uses the complete-turn byte budget on the actual pagehide request', async () => {
    call(); await started()
    for (let index = 0; index < 10; index++) channel().emit({ type: index % 2 ? 'session.input_transcript.delta' : 'session.output_transcript.delta', delta: '界'.repeat(4000), start_ms: index * 1000, end_ms: index * 1000 + 900 })
    window.dispatchEvent(new Event('pagehide')); await flush()
    const request = endCalls()[0][1]!, body = JSON.parse(request.body as string)
    expect(request.keepalive).toBe(true)
    expect(new TextEncoder().encode(request.body as string).byteLength).toBeLessThanOrEqual(60_000)
    expect(body.transcript.at(-1).startMs).toBe(9000)
    expect(body.transcript.every((turn: { text: string }) => turn.text.length === 4000)).toBe(true)
  })

  it('releases the lock if a start response arrives after disposal', async () => {
    let respond!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve }))
    call(); await flush(); const disposing = handle!.dispose()
    respond(new Response(JSON.stringify({ sessionId: 'call-1', sdp: 'v=0\nanswer' }))); await disposing
    expect(endCalls()).toHaveLength(1); expect(peer().setRemoteDescription).not.toHaveBeenCalled()
    expect(streamMock).not.toHaveBeenCalled()
    expect(events.filter(event => event.type === 'completed')).toHaveLength(0)
  })

  it('keeps end persistence retryable after an HTTP error', async () => {
    call(); await started()
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await expect(handle!.dispose()).rejects.toThrow('notes could not be saved')
    expect(handle!.snapshot()).toMatchObject({ errorKind: 'save' })
    expect(events.filter(event => event.type === 'completed')).toHaveLength(1)
    expect(events.find(event => event.type === 'completed')).toMatchObject({ saveError: expect.any(String), serverSaved: false })
    await handle!.retrySave(); expect(endCalls()).toHaveLength(2)
    expect(events.filter(event => event.type === 'completed')).toHaveLength(2)
    expect(events.at(-2)).toMatchObject({ type: 'completed', saveError: undefined, serverSaved: true })
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce()
  })

  it('keeps scribe failure active, records the error, and retries only that turn', async () => {
    streamMock.mockImplementationOnce(async function* () { yield { done: true, error: 'Scribe timed out.' } })
    call(); await started()
    channel().emit({ type: 'session.input_transcript.delta', delta: 'Weekly.', start_ms: 100, end_ms: 600 })
    await vi.advanceTimersByTimeAsync(1200)
    expect(handle!.snapshot()).toMatchObject({ status: 'active', note: 'Scribe timed out.' })
    expect(endCalls()).toHaveLength(0); expect(microphoneTrack.stop).not.toHaveBeenCalled()
    await handle!.retryTurn()
    expect(streamMock.mock.calls.filter(args => args[2] === 'scribe')).toHaveLength(2)
    expect(endCalls()).toHaveLength(0)
  })

  it('shows a failed action inline and retries only that action without ending the call', async () => {
    const retry = vi.fn(async () => {})
    streamMock.mockImplementationOnce(async function* () { yield { done: true, final: '```action\n{"type":"cover_topic","topic":"calendar"}\n```' } })
    call({ onActions: async () => ({ error: 'That action could not be saved.', retry }) }); await started()
    channel().emit({ type: 'session.input_transcript.delta', delta: 'Weekly.', start_ms: 100, end_ms: 600 })
    await vi.advanceTimersByTimeAsync(1200)
    expect(handle!.snapshot()).toMatchObject({ status: 'active', note: 'That action could not be saved.' })
    expect(endCalls()).toHaveLength(0)
    await handle!.retryTurn()
    expect(retry).toHaveBeenCalledOnce()
    expect(streamMock.mock.calls.filter(args => args[2] === 'scribe')).toHaveLength(1)
  })

  it('records malformed and invalid actions as skipped without applying or ending the call', async () => {
    const onSkipped = vi.fn(), onActions = vi.fn()
    streamMock.mockImplementationOnce(async function* () { yield { done: true, final: '```action\n{"type":"cover_topic","topic":"invented"}\n```\n```action\n{"type":\n```' } })
    call({ onSkipped, onActions }); await started()
    channel().emit({ type: 'session.input_transcript.delta', delta: 'Weekly.', start_ms: 100, end_ms: 600 })
    await vi.advanceTimersByTimeAsync(1200)
    expect(onSkipped).toHaveBeenCalledWith(['malformed action', 'cover_topic: invalid action'])
    expect(onActions).not.toHaveBeenCalled()
    expect(handle!.snapshot().status).toBe('active')
    expect(endCalls()).toHaveLength(0)
  })

  it.each(['failure', 'empty'] as const)('answers a %s delegation with the required apology and keeps the call live', async kind => {
    streamMock.mockImplementationOnce(async function* () { yield kind === 'failure' ? { done: true, error: 'The request was rate limited.' } : { done: true, final: '' } })
    call(); await started()
    channel().emit({ type: 'session.input_transcript.delta', delta: 'Approve this.', start_ms: 0, end_ms: 500 })
    channel().emit({ type: 'session.delegation.created', delegation: { id: 'delegation-1' } }); await flush()
    expect(channel().sent.at(-1)).toMatchObject({ type: 'session.commentary.append', delegation_id: 'delegation-1', content: "I couldn't get that just now. Ask me again in a moment." })
    expect(handle!.snapshot().status).toBe('active'); expect(endCalls()).toHaveLength(0)
  })

  it('skips blank scribe/delegate inputs and answers a waiting delegation without an empty POST', async () => {
    call(); await started()
    channel().emit({ type: 'session.input_transcript.delta', delta: '  ', start_ms: 0, end_ms: 500 })
    await vi.advanceTimersByTimeAsync(1200)
    channel().emit({ type: 'session.delegation.created', delegation: { id: 'empty' } }); await flush()
    expect(streamMock).not.toHaveBeenCalled()
    expect(channel().sent.at(-1)).toMatchObject({ delegation_id: 'empty', content: "I couldn't get that just now. Ask me again in a moment." })
    expect(handle!.snapshot().status).toBe('active')
  })

  it('provides the preceding question to scribe and complete current desk context to delegate', async () => {
    const context = { page: '/payroll', cycleId: 'cycle-1', selection: { group: 'overtime' }, calendar: { cadence: 'weekly' }, cycle: { label: 'Sep 21' }, known: { covered: [] } }
    call({ purpose: 'desk', getContext: () => context }); await started()
    channel().emit({ type: 'session.output_transcript.delta', delta: 'When does your pay period end?', start_ms: 0, end_ms: 800 })
    channel().emit({ type: 'session.input_transcript.delta', delta: 'Sunday.', start_ms: 1000, end_ms: 1600 })
    await vi.advanceTimersByTimeAsync(1200)
    expect(streamMock).toHaveBeenCalledWith('Sunday.', expect.objectContaining({ asked: 'When does your pay period end?' }), 'scribe', expect.any(AbortSignal))
    channel().emit({ type: 'session.delegation.created', delegation: { id: 'context' } }); await flush()
    expect(streamMock).toHaveBeenCalledWith('Sunday.', expect.objectContaining({ ...context, purpose: 'desk' }), 'delegate', expect.any(AbortSignal))
  })

  it('keeps scribe silent in the orb while the agent is speaking', async () => {
    let finishScribe!: () => void
    streamMock.mockImplementationOnce(async function* () { await new Promise<void>(resolve => { finishScribe = resolve }); yield { done: true, final: '' } })
    call(); await started()
    channel().emit({ type: 'session.input_transcript.delta', delta: 'Weekly.', start_ms: 0, end_ms: 600 })
    await vi.advanceTimersByTimeAsync(1200)
    expect(handle!.snapshot().orb).toBe('listening')
    channel().emit({ type: 'session.output_transcript.delta', delta: 'Got it.', start_ms: 1000, end_ms: 1600 })
    expect(handle!.snapshot().orb).toBe('composing')
    finishScribe(); await flush()
  })

  it('handles end 404 as terminal, preserves the local card, and skips consolidation', async () => {
    const onSaved = vi.fn()
    call({ onSaved }); await started()
    channel().emit({ type: 'session.input_transcript.delta', delta: 'Friday.', start_ms: 100, end_ms: 600 })
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }))
    await handle!.dispose()
    expect(streamMock).not.toHaveBeenCalled()
    expect(events.find(event => event.type === 'completed')).toMatchObject({ serverSaved: false, final: expect.stringContaining('not saved on the server'), transcript: [{ role: 'user', text: 'Friday.', startMs: 100, endMs: 600 }] })
    expect(onSaved).toHaveBeenCalledWith('call-1')
    expect(handle!.snapshot().status).toBe('ended')
  })

  it('releases a failed transport without waiting for consolidation and save retry never opens a mic', async () => {
    let finishConsolidate!: () => void
    streamMock.mockImplementationOnce(async function* () { await new Promise<void>(resolve => { finishConsolidate = resolve }); yield { done: true, final: 'Saved.' } })
    call(); await started()
    peer().connectionState = 'failed'; peer().onconnectionstatechange?.(); await flush()
    expect(finishConsolidate).toBeTypeOf('function')
    await handle!.release()
    expect(endCalls()).toHaveLength(1)
    expect(events.filter(event => event.type === 'completed')).toHaveLength(0)
    finishConsolidate(); await handle!.retrySave()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce()
  })

  it('retries failed consolidation without ending twice or opening another microphone', async () => {
    streamMock.mockImplementationOnce(async function* () { yield { done: true, error: 'Saving notes timed out.' } })
    const onSaved = vi.fn()
    call({ onSaved }); await started()
    await expect(handle!.dispose()).rejects.toThrow('Saving notes timed out.')
    expect(handle!.snapshot()).toMatchObject({ status: 'error', errorKind: 'save' })
    expect(events.find(event => event.type === 'completed')).toMatchObject({ serverSaved: true, saveError: 'Saving notes timed out.' })
    expect(onSaved).not.toHaveBeenCalled()
    await handle!.retrySave()
    expect(endCalls()).toHaveLength(1)
    expect(streamMock.mock.calls.filter(args => args[2] === 'consolidate')).toHaveLength(2)
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce()
    expect(handle!.snapshot().status).toBe('ended')
    expect(onSaved).toHaveBeenCalledWith('call-1')
  })

  it('captures the start token for end persistence after sign-out', async () => {
    vi.mocked(viewerSession).mockReturnValue({ email: 'caller@example.com', sessionToken: 'captured-token' } as NonNullable<ReturnType<typeof viewerSession>>)
    call(); await started(); vi.mocked(viewerSession).mockReturnValue(null)
    window.dispatchEvent(new Event('pagehide')); await flush()
    expect(new Headers(endCalls()[0][1]?.headers).get('Authorization')).toBe('Bearer captured-token')
  })

  it('persists the call before connection, at final turn boundaries, and on teardown', async () => {
    const onPersist = vi.fn(), onSaved = vi.fn()
    call({ onPersist, onSaved }); await started()
    expect(onPersist).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'call-1', purpose: 'onboard', startedAt: expect.any(Number) }), false)
    channel().emit({ type: 'session.input_transcript.delta', delta: 'Sunday.', start_ms: 0, end_ms: 600 })
    await vi.advanceTimersByTimeAsync(1200)
    expect(onPersist).toHaveBeenCalledWith(expect.objectContaining({ transcript: [expect.objectContaining({ text: 'Sunday.' })] }), false)
    await handle!.dispose()
    expect(onPersist).toHaveBeenLastCalledWith(expect.objectContaining({ seconds: expect.any(Number) }), true)
    expect(onSaved).toHaveBeenCalledWith('call-1')
  })

  it('publishes microphone levels without emitting pane snapshots', async () => {
    const analyser = { fftSize: 0, getByteTimeDomainData: (samples: Uint8Array) => { samples.fill(140) } }
    vi.stubGlobal('AudioContext', class {
      resume = async () => {}; close = async () => {}; createAnalyser = () => analyser
      createMediaStreamSource = () => ({ connect: () => {} })
    })
    call(); await started()
    const listener = vi.fn(), unsubscribe = handle!.snapshot().levelSource!.subscribe(listener)
    const statesBefore = events.filter(event => event.type === 'state').length
    await vi.advanceTimersByTimeAsync(800)
    expect(listener).toHaveBeenCalledTimes(10)
    expect(handle!.snapshot().levelSource!.get()).toBeGreaterThan(0)
    expect(events.filter(event => event.type === 'state')).toHaveLength(statesBefore)
    unsubscribe()
  })
})

describe('voice transcript timestamps and server bounds', () => {
  it('orders by timestamps, joins audio fragments, and starts a new turn after silence or a role change', () => {
    expect(stitchTranscript([
      { role: 'user', text: 'weekly.', startMs: 400, endMs: 800 },
      { role: 'user', text: 'We pay ', startMs: 0, endMs: 400 },
      { role: 'agent', text: 'Got it.', startMs: 900, endMs: 1500 },
      { role: 'user', text: 'Friday.', startMs: 1700, endMs: 2100 },
      { role: 'user', text: 'Email.', startMs: 4000, endMs: 4500 },
    ])).toEqual([
      { role: 'user', text: 'We pay weekly.', startMs: 0, endMs: 800 },
      { role: 'agent', text: 'Got it.', startMs: 900, endMs: 1500 },
      { role: 'user', text: 'Friday.', startMs: 1700, endMs: 2100 },
      { role: 'user', text: 'Email.', startMs: 4000, endMs: 4500 },
    ])
  })
  it('splits long turns without dropping characters and respects the end endpoint row limit', () => {
    const text = 'a'.repeat(8001)
    const rows = callEndTranscript([{ role: 'user', text, startMs: 0, endMs: 1000 }])
    expect(rows.map(row => row.text.length)).toEqual([4000, 4000, 1])
    expect(rows.map(row => row.text).join('')).toBe(text)
    const longCall = Array.from({ length: 210 }, (_, index) => ({ role: index % 2 ? 'user' as const : 'agent' as const, text: `turn ${index}`, startMs: index, endMs: index + 1 }))
    expect(callEndTranscript(longCall)).toHaveLength(200)
    expect(callEndTranscript(longCall).at(-1)?.text).toBe('turn 209')
    expect(callEndTranscript(Array.from({ length: 210 }, () => ({ role: 'user', text: 'test', startMs: 0, endMs: 1 })))).toHaveLength(200)
  })
  it('keeps a 4000-character answer intact across local persistence and normal end', () => {
    const turns = [{ role: 'agent' as const, text: '界'.repeat(4000), startMs: 0, endMs: 1000 }]
    expect(callEndTranscript(turns)).toEqual([{ role: 'agent', text: turns[0].text, startMs: 0 }])
    const saved = callEndTranscript(turns).map(turn => ({ ...turn, endMs: turn.startMs }))
    expect(callEndTranscript(saved)).toEqual(callEndTranscript(turns))
    expect(JSON.parse(callEndBody(43, turns)).transcript[0].text).toBe(turns[0].text)
  })
  it('only trims pagehide payloads and drops oldest whole turns, including split turns', () => {
    const turns = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'agent' as const : 'user' as const, text: '界'.repeat(index === 0 ? 8000 : 4000), startMs: index * 1000, endMs: index * 1000 + 900 }))
    const complete = JSON.parse(callEndBody(43, turns))
    expect(complete.transcript).toHaveLength(11)
    const body = callEndBody(43, turns, true), kept = JSON.parse(body).transcript
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(60_000)
    expect(kept.at(-1).text).toBe(turns.at(-1)!.text)
    expect(kept.every((turn: { text: string; startMs: number }) => turn.text === turns.find(source => source.startMs === turn.startMs)!.text)).toBe(true)
    expect(kept[0].startMs).toBeGreaterThan(0)
  })
  it('does not split a Unicode surrogate pair or drop half an old turn to reach 200 rows', () => {
    const unicode = 'a'.repeat(3999) + '😀tail'
    expect(callEndTranscript([{ role: 'agent', text: unicode, startMs: 0, endMs: 1 }]).map(row => row.text)).toEqual(['a'.repeat(3999), '😀tail'])
    const old = { role: 'agent' as const, text: 'a'.repeat(8000), startMs: 0, endMs: 1 }
    const later = Array.from({ length: 199 }, (_, index) => ({ role: 'user' as const, text: 'Later', startMs: index + 1, endMs: index + 1 }))
    expect(callEndTranscript([old, ...later])).toHaveLength(199)
    expect(callEndTranscript([old, ...later])[0].startMs).toBe(1)
  })
})
