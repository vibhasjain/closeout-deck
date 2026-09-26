import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authedFetch } from '@/lib/api'
import { MIC_BLOCKED, MICROPHONE_CONSTRAINTS } from '@/lib/live'
import { startDictation } from './dictate'
import type { DictationHandle } from './dictate'

vi.mock('@/lib/api', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/api')>(), authedFetch: vi.fn() }))
class Channel {
  readyState = 'open'
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: Record<string, unknown>[] = []
  send(value: string) { this.sent.push(JSON.parse(value)) }
  emit(value: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(value) }) }
  close() { this.readyState = 'closed'; this.onclose?.() }
}
class Peer extends EventTarget {
  static latest: Peer
  static iceState = 'complete'
  iceGatheringState = Peer.iceState
  localDescription: { sdp: string } | null = null
  channel = new Channel()
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'v=0\noffer' }))
  setLocalDescription = vi.fn(async (offer: { sdp: string }) => { this.localDescription = offer })
  setRemoteDescription = vi.fn(async () => {})
  addTrack = vi.fn()
  createDataChannel = vi.fn(() => this.channel)
  close = vi.fn()
  constructor() { super(); Peer.latest = this }
}
let handle: DictationHandle | undefined
let track: { enabled: boolean; stop: ReturnType<typeof vi.fn> }
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); Peer.iceState = 'complete'
  track = { enabled: true, stop: vi.fn() }; handle = undefined
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('RTCPeerConnection', Peer)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [track] })) } })
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ sdp: 'v=0\nanswer' })))
})
afterEach(() => { handle?.dispose(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('uses server-side SDP exchange with ICE complete and echo-cancelled microphone audio', async () => {
  Peer.iceState = 'gathering'
  handle = startDictation({ onTranscript: vi.fn(), onError: vi.fn() }); await flush()
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(MICROPHONE_CONSTRAINTS)
  expect(Peer.latest.createDataChannel).toHaveBeenCalledWith('oai-events')
  expect(authedFetch).not.toHaveBeenCalled()
  Peer.latest.iceGatheringState = 'complete'; Peer.latest.dispatchEvent(new Event('icegatheringstatechange')); await flush()
  expect(authedFetch).toHaveBeenCalledWith('/dictate', expect.objectContaining({ body: JSON.stringify({ sdp: 'v=0\noffer' }) }))
  expect(Peer.latest.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'v=0\nanswer' })
})

it('streams deltas, explicitly commits on stop, and waits for the authoritative final transcript', async () => {
  const onTranscript = vi.fn(), onState = vi.fn()
  handle = startDictation({ onTranscript, onState, onError: vi.fn() }); await flush()
  const channel = Peer.latest.channel
  channel.emit({ type: 'conversation.item.input_audio_transcription.delta', delta: 'Approve ' })
  channel.emit({ type: 'conversation.item.input_audio_transcription.delta', delta: 'the entries' })
  expect(onTranscript.mock.calls).toEqual([['Approve ', false], ['Approve the entries', false]])
  const final = handle.stop()
  expect(channel.sent).toEqual([{ type: 'input_audio_buffer.commit', event_id: expect.any(String) }])
  expect(track.enabled).toBe(false); expect(Peer.latest.close).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(400)
  expect(Peer.latest.close).not.toHaveBeenCalled()
  channel.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Approve the time entries.' })
  expect(await final).toBe('Approve the time entries.')
  expect(onTranscript).toHaveBeenLastCalledWith('Approve the time entries.', true)
  expect(Peer.latest.close).toHaveBeenCalledOnce(); expect(track.stop).toHaveBeenCalledOnce()
  expect(onState.mock.calls.flat()).toEqual(['connecting', 'listening', 'finishing', 'ended'])
})

it('reports the specified microphone denial and does not switch input methods', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
  const onError = vi.fn(), onState = vi.fn()
  handle = startDictation({ onTranscript: vi.fn(), onError, onState }); await flush()
  expect(onError).toHaveBeenCalledWith(MIC_BLOCKED)
  expect(onState).toHaveBeenLastCalledWith('error'); expect(authedFetch).not.toHaveBeenCalled()
})

it('surfaces a missing final transcript instead of silently treating deltas as final', async () => {
  const onError = vi.fn(), onTranscript = vi.fn()
  handle = startDictation({ onTranscript, onError }); await flush()
  Peer.latest.channel.emit({ type: 'conversation.item.input_audio_transcription.delta', delta: 'Partial speech' })
  const failed = expect(handle.stop()).rejects.toThrow('final dictation did not arrive')
  await vi.advanceTimersByTimeAsync(10_000); await failed
  expect(onError).toHaveBeenCalledWith('The final dictation did not arrive. Try again.')
  expect(onTranscript).toHaveBeenCalledExactlyOnceWith('Partial speech', false)
})

it('stops before any speech without committing an empty buffer or replacing the draft', async () => {
  const onError = vi.fn(), onTranscript = vi.fn(), onState = vi.fn()
  handle = startDictation({ onTranscript, onError, onState }); await flush()
  expect(await handle.stop()).toBe('')
  expect(Peer.latest.channel.sent).toEqual([])
  expect(track.stop).toHaveBeenCalledOnce()
  expect(onTranscript).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled()
  expect(onState).toHaveBeenLastCalledWith('ended')
})

it('stops immediately while microphone access is pending and releases a late mic', async () => {
  let release!: (stream: MediaStream) => void
  vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise(resolve => { release = resolve }))
  handle = startDictation({ onTranscript: vi.fn(), onError: vi.fn() }); await flush()
  expect(await handle.stop()).toBe('')
  release({ getTracks: () => [track] } as unknown as MediaStream); await flush()
  expect(track.stop).toHaveBeenCalledOnce(); expect(authedFetch).not.toHaveBeenCalled()
})

it('automatically finishes after two minutes and stops the mic while waiting for the final text', async () => {
  const onState = vi.fn()
  handle = startDictation({ onTranscript: vi.fn(), onError: vi.fn(), onState }); await flush()
  Peer.latest.channel.emit({ type: 'conversation.item.input_audio_transcription.delta', delta: 'Weekly payroll' })
  await vi.advanceTimersByTimeAsync(119_999)
  expect(Peer.latest.channel.sent).toEqual([])
  await vi.advanceTimersByTimeAsync(1)
  expect(Peer.latest.channel.sent).toEqual([{ type: 'input_audio_buffer.commit', event_id: expect.any(String) }])
  expect(track.enabled).toBe(false); expect(onState).toHaveBeenLastCalledWith('finishing')
  Peer.latest.channel.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Weekly Payroll.' })
  expect(track.stop).toHaveBeenCalledOnce(); expect(onState).toHaveBeenLastCalledWith('ended')
})

it('automatically closes a silent dictation after two minutes without a commit', async () => {
  const onError = vi.fn()
  handle = startDictation({ onTranscript: vi.fn(), onError }); await flush()
  await vi.advanceTimersByTimeAsync(120_000)
  expect(Peer.latest.channel.sent).toEqual([]); expect(track.stop).toHaveBeenCalledOnce(); expect(onError).not.toHaveBeenCalled()
})

it.each([
  ['input_audio_buffer_commit_empty', 'No speech was captured. Try again and speak before stopping.'],
  ['rate_limit_exceeded', 'Dictation is busy right now. Try again in a moment.'],
  ['server_error', 'Dictation could not transcribe the audio. Try again.'],
])('maps %s to plain copy without exposing upstream messages', async (code, message) => {
  const onError = vi.fn()
  handle = startDictation({ onTranscript: vi.fn(), onError }); await flush()
  Peer.latest.channel.emit({ type: 'error', error: { code, message: 'Raw protocol internals' } })
  expect(onError).toHaveBeenCalledExactlyOnceWith(message)
  expect(track.stop).toHaveBeenCalledOnce()
})
