import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceCall, voiceContext } from './useVoiceCall'
import { startCall, type CallOptions, type CallHandle, type CallSnapshot } from './live'
import { authedFetch } from './api'
import { stream } from './chat'
import { DEFAULTS, flushOnboarding, getOnboarding, updateOnboarding, type Onboarding } from './onboarding'
import { recoverVoiceCall } from './voiceActions'
import { CallChecklist } from '@/components/voice/CallChecklist'
import { clearStoredCall, liveCallKey, readStoredCall } from './callRecovery'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const store = vi.hoisted(() => ({ state: null as Onboarding | null }))
const navigation = vi.hoisted(() => vi.fn())
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T>(initial: T) => { const i = hooks.cursor++; if (!(i in hooks.slots)) hooks.slots[i] = initial; return [hooks.slots[i], (next: T | ((current: T) => T)) => { hooks.slots[i] = typeof next === 'function' ? (next as (current: T) => T)(hooks.slots[i] as T) : next }] },
  useRef: <T>(value: T) => { const i = hooks.cursor++; if (!(i in hooks.slots)) hooks.slots[i] = { current: value }; return hooks.slots[i] },
  useEffect: () => {},
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => navigation, useSearchParams: () => [new URLSearchParams()] }))
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), authedFetch: vi.fn() }))
vi.mock('./viewerSession', () => ({ viewerSession: () => ({ email: 'hook@example.test', sessionToken: 'token' }) }))
vi.mock('./live', async original => ({ ...await original<typeof import('./live')>(), startCall: vi.fn() }))
vi.mock('./chat', async original => ({ ...await original<typeof import('./chat')>(), stream: vi.fn() }))
vi.mock('./onboarding', async original => ({ ...await original<typeof import('./onboarding')>(), getOnboarding: () => store.state!, updateOnboarding: (patch: Partial<Onboarding>) => { store.state = { ...store.state!, ...patch } }, flushOnboarding: vi.fn(async () => {}) }))
let options: CallOptions, handle: CallHandle, snapshot: CallSnapshot, storage: Map<string, string>
// eslint-disable-next-line react-hooks/immutability -- This runner resets the mocked hook cursor between renders.
const useTestCall = (purpose: 'onboard' | 'desk' = 'onboard') => { hooks.cursor = 0; return useVoiceCall(purpose) }
const email = 'hook@example.test'
beforeEach(() => {
  hooks.slots = []; store.state = structuredClone(DEFAULTS); storage = new Map(); vi.clearAllMocks()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  snapshot = { status: 'active', orb: 'listening', stream: null, remoteStream: null, seconds: 10, muted: false, caption: '', transcript: [], level: 0, callId: crypto.randomUUID() }
  handle = { snapshot: () => snapshot, hangup: vi.fn(async () => {}), dispose: vi.fn(async () => {}), release: vi.fn(async () => {}), retrySave: vi.fn(async () => {}), retryTurn: vi.fn(async () => {}), mute: vi.fn() }
  vi.mocked(startCall).mockImplementation(value => { options = value; return handle })
  vi.mocked(authedFetch).mockResolvedValue(new Response('{}'))
  vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: 'Saved.' } })
})
afterEach(() => { const call = readStoredCall(email); if (call) clearStoredCall(email, call.sessionId); vi.unstubAllGlobals() })

describe('voice hook lifecycle and real action integration', () => {
  it('journals one live card, updates its clock, and finalizes that same card at hang-up', async () => {
    await useTestCall('desk').start()
    const id = snapshot.callId!, record = { sessionId: id, purpose: 'desk' as const, startedAt: 1000, seconds: 0, transcript: [] }
    options.onPersist!(record, false)
    expect(getOnboarding().chat).toHaveLength(0)
    options.onEvent({ type: 'state', snapshot })
    options.onPersist!(record, false)
    expect(getOnboarding().chat).toHaveLength(1)
    expect(getOnboarding().chat[0]).toMatchObject({ id: `call-${id}`, callLive: true, callSaving: true, cards: [{ seconds: 0 }] })
    options.onPersist!({ ...record, seconds: 11 }, false)
    options.onPersist!({ ...record, seconds: 42 }, false)
    expect(getOnboarding().chat).toHaveLength(1)
    expect(getOnboarding().chat[0].cards).toEqual([{ kind: 'call', callId: id, seconds: 42 }])
    options.onPersist!({ ...record, seconds: 43 }, true)
    options.onEvent({ type: 'completed', callId: id, seconds: 43, transcript: [], final: 'Saved.' })
    expect(getOnboarding().chat).toHaveLength(1)
    expect(getOnboarding().chat[0]).toMatchObject({ id: `call-${id}`, at: 1000, callLive: false, callSaving: false, text: 'Saved.', cards: [{ seconds: 43 }] })
  })
  it('boot recovery replaces legacy duplicate call cards by session identity', async () => {
    const id = crypto.randomUUID(), card = { kind: 'call' as const, callId: id, seconds: 11 }
    updateOnboarding({ chat: [
      { id: 'old-snapshot', role: 'agent', text: '', at: 1, callSaving: true, cards: [card] },
      { id: `call-${id}`, role: 'agent', text: '', at: 1, callSaving: true, cards: [card] },
    ] })
    storage.set(liveCallKey(email), JSON.stringify({ sessionId: id, purpose: 'desk', startedAt: 1, seconds: 43, transcript: [] }))
    await recoverVoiceCall(navigation, new URLSearchParams())
    expect(getOnboarding().chat).toHaveLength(1)
    expect(getOnboarding().chat[0]).toMatchObject({ id: `call-${id}`, callSaving: false, callLive: false, cards: [{ seconds: 43 }] })
    expect(startCall).not.toHaveBeenCalled()
  })
  it('Retry saving calls only the save method and never opens a new microphone session', async () => {
    await useTestCall().start(); await useTestCall().retrySave()
    expect(handle.retrySave).toHaveBeenCalledTimes(1); expect(startCall).toHaveBeenCalledTimes(1)
  })
  it('Keep typing immediately hides the call while end remains rejected and later errors stay hidden', async () => {
    await useTestCall().start()
    vi.mocked(handle.hangup).mockRejectedValue(new Error('End is offline'))
    useTestCall().dismiss(); expect(useTestCall().snapshot).toBeNull()
    options.onEvent({ type: 'state', snapshot: { ...snapshot, status: 'error', errorKind: 'save', error: 'Still offline' } })
    await Promise.resolve(); expect(useTestCall().snapshot).toBeNull()
    options.onEvent({ type: 'completed', callId: snapshot.callId!, seconds: 10, transcript: [], final: '', saveError: 'End is offline' })
    expect(getOnboarding().chat.at(-1)).toMatchObject({ callSaveError: 'End is offline', callSaving: true })
  })
  it('Keep typing also exits while consolidation is pending', async () => {
    await useTestCall().start(); vi.mocked(handle.hangup).mockReturnValue(new Promise(() => {}))
    useTestCall().dismiss(); expect(useTestCall().snapshot).toBeNull()
  })
  it('Retry the call waits for release only, not old consolidation', async () => {
    await useTestCall().start(); vi.mocked(handle.dispose).mockReturnValue(new Promise(() => {}))
    await useTestCall().start(); expect(handle.release).toHaveBeenCalledTimes(1); expect(startCall).toHaveBeenCalledTimes(2)
  })
  it('retrying a never-connected session releases it without fabricating a zero-second card', async () => {
    snapshot = { ...snapshot, status: 'connecting', seconds: 0 }
    await useTestCall().start()
    storage.set(liveCallKey(email), JSON.stringify({ sessionId: snapshot.callId, purpose: 'onboard', startedAt: 1, seconds: 0, transcript: [] }))
    await useTestCall().start()
    expect(handle.release).toHaveBeenCalledTimes(1)
    expect(getOnboarding().chat).toEqual([])
    expect(stream).not.toHaveBeenCalled()
  })
  it('starting a call recovers the stored call before starting transport', async () => {
    const id = crypto.randomUUID()
    storage.set(liveCallKey(email), JSON.stringify({ sessionId: id, purpose: 'onboard', startedAt: 1, seconds: 22, transcript: [{ role: 'user', text: 'Weekly.', startMs: 1 }] }))
    let finish!: (response: Response) => void
    vi.mocked(authedFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const starting = useTestCall().start(); expect(startCall).not.toHaveBeenCalled()
    finish(new Response('{}')); await starting
    expect(stream).toHaveBeenCalledWith('call ended', { callId: id }, 'consolidate')
    expect(getOnboarding().chat.some(message => message.id === `call-${id}`)).toBe(true)
    expect(readStoredCall(email)).toBeNull(); expect(startCall).toHaveBeenCalledTimes(1)
  })
  it('a recovery error blocks transport and keeps its saving Retry card', async () => {
    const id = crypto.randomUUID()
    storage.set(liveCallKey(email), JSON.stringify({ sessionId: id, purpose: 'onboard', startedAt: 1, seconds: 22, transcript: [] }))
    vi.mocked(authedFetch).mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await useTestCall().start()
    expect(startCall).not.toHaveBeenCalled(); expect(readStoredCall(email)?.sessionId).toBe(id)
    expect(getOnboarding().chat.at(-1)?.callSaveError).toBeTruthy()
  })
  it('scribe actions use validation, the onboarding allow-list, store and flush before checklist strikes', async () => {
    await useTestCall().start()
    await options.onActions!([{ type: 'cover_topic', topic: 'calendar' }, { type: 'go', to: '/payroll' }])
    expect(getOnboarding().covered).toContain('calendar'); expect(navigation).not.toHaveBeenCalled(); expect(flushOnboarding).toHaveBeenCalled()
    const markup = renderToStaticMarkup(createElement(CallChecklist, { onboarding: getOnboarding() }))
    expect(markup).toMatch(/data-topic="calendar" data-covered="true"/)
    expect(markup).toContain('<s class="call-topic-label">')
    options.onEvent({ type: 'completed', callId: snapshot.callId!, seconds: 10, transcript: [], final: 'Saved.' })
    expect(getOnboarding().chat.at(-1)).toMatchObject({ actions: [{ type: 'cover_topic', topic: 'calendar' }], skipped: ['go is unavailable during setup'] })
  })
  it('one failed desk action and failed state flush do not prevent later actions or lose the audit', async () => {
    await useTestCall('desk').start()
    navigation.mockImplementationOnce(() => { throw new Error('navigation failed') })
    vi.mocked(flushOnboarding).mockRejectedValueOnce(new Error('offline'))
    await expect(options.onActions!([{ type: 'go', to: '/payroll' }, { type: 'cover_topic', topic: 'calendar' }])).resolves.toMatchObject({ error: 'go: navigation failed', retry: expect.any(Function) })
    options.onEvent({ type: 'completed', callId: snapshot.callId!, seconds: 10, transcript: [], final: 'Saved.' })
    expect(getOnboarding().chat.at(-1)).toMatchObject({ actions: [{ type: 'cover_topic', topic: 'calendar' }], skipped: ['go: navigation failed'] })
    expect(getOnboarding().setupNotice).toBeNull()
  })
  it('boot 404 retains actions already journaled by scribe before tab close', async () => {
    const id = crypto.randomUUID()
    updateOnboarding({ chat: [{ id: `call-${id}`, role: 'agent', text: '', at: 1, callSaving: true, callPurpose: 'onboard', actions: [{ type: 'cover_topic', topic: 'calendar' }], skipped: ['go is unavailable during setup'], cards: [{ kind: 'call', callId: id, seconds: 25 }], callTranscript: [{ role: 'user', text: 'Weekly.', startMs: 1 }] }] })
    storage.set(liveCallKey(email), JSON.stringify({ sessionId: id, purpose: 'onboard', startedAt: 1, seconds: 25, transcript: [{ role: 'user', text: 'Weekly.', startMs: 1 }] }))
    vi.mocked(authedFetch).mockResolvedValueOnce(new Response('{}', { status: 404 }))
    await recoverVoiceCall(navigation, new URLSearchParams())
    expect(getOnboarding().chat[0]).toMatchObject({ callSaving: false, callServerSaved: false, actions: [{ type: 'cover_topic', topic: 'calendar' }], skipped: ['go is unavailable during setup'] })
    expect(readStoredCall(email)).toBeNull()
  })
  it('boot resumes an older released call from its pending card without a live key or a mic', async () => {
    const id = crypto.randomUUID()
    updateOnboarding({ chat: [{ id: `call-${id}`, role: 'agent', text: '', at: 1, callSaving: true, callServerSaved: true, callPurpose: 'onboard', actions: [{ type: 'cover_topic', topic: 'calendar' }], cards: [{ kind: 'call', callId: id, seconds: 25 }], callTranscript: [] }] })
    await recoverVoiceCall(navigation, new URLSearchParams())
    expect(authedFetch).not.toHaveBeenCalled(); expect(startCall).not.toHaveBeenCalled()
    expect(stream).toHaveBeenCalledWith('call ended', { callId: id }, 'consolidate')
    expect(getOnboarding().chat[0]).toMatchObject({ callSaving: false, callServerSaved: true, actions: [{ type: 'cover_topic', topic: 'calendar' }] })
  })
  it('structured known facts survive a long profile ahead of the truncated prose', () => {
    updateOnboarding({ profile: { ...DEFAULTS.profile, notes: 'long '.repeat(2000) } })
    const known = String(voiceContext().known)
    expect(known.indexOf('covered')).toBeLessThan(known.indexOf('profile'))
    expect(known.slice(0, 900)).toContain('calendar'); expect(known.slice(0, 900)).toContain('authority')
  })
})
