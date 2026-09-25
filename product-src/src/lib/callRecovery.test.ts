import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authedFetch } from '@/lib/api'
import { stream } from '@/lib/chat'
import { viewerSession } from '@/lib/viewerSession'
import * as memory from '@/lib/memory'
import { clearStoredCall, liveCallKey, persistLiveCall, readStoredCall, recoverStoredCall, retryCallSave, setCallRetryFallback, type StoredCall } from './callRecovery'
vi.mock('@/lib/api', () => ({ authedFetch: vi.fn() }))
vi.mock('@/lib/viewerSession', () => ({ viewerSession: vi.fn() }))
vi.mock('@/lib/chat', async original => ({ ...await original<typeof import('@/lib/chat')>(), stream: vi.fn() }))
const email = 'recovery@example.test'
let storage: Map<string, string>
const record = (): StoredCall => ({ sessionId: crypto.randomUUID(), purpose: 'onboard', startedAt: 1000, seconds: 48, transcript: [{ role: 'user', text: 'Weekly Payroll.', startMs: 100 }] })
const save = (call: StoredCall) => storage.set(liveCallKey(email), JSON.stringify(call))
beforeEach(() => {
  storage = new Map(); vi.useFakeTimers(); vi.clearAllMocks()
  vi.mocked(viewerSession).mockReturnValue({ email, sessionToken: 'recovery-session', exp: 9999999999 })
  vi.spyOn(memory, 'scheduleMemoryRefresh').mockImplementation(() => {})
  vi.stubGlobal('localStorage', { getItem: vi.fn((key: string) => storage.get(key) ?? null), setItem: vi.fn((key: string, value: string) => storage.set(key, value)), removeItem: vi.fn((key: string) => storage.delete(key)) })
  vi.mocked(authedFetch).mockResolvedValue(new Response('{}'))
  vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: 'Saved.\n```action\n{"type":"cover_topic","topic":"calendar"}\n```' } })
})
afterEach(() => { const stored = readStoredCall(email); if (stored) clearStoredCall(email, stored.sessionId); setCallRetryFallback(undefined); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('durable live-call recovery', () => {
  it('boot ends the stored call, consolidates, applies actions and cards it before clearing storage', async () => {
    const call = record(); save(call); const order: string[] = []
    vi.mocked(authedFetch).mockImplementation(async () => { order.push('end'); return new Response('{}') })
    vi.mocked(stream).mockImplementation(async function* () { order.push('consolidate'); yield { done: true, final: 'Saved.' } })
    const onCompleted = vi.fn(() => { order.push('card'); expect(readStoredCall(email)?.sessionId).toBe(call.sessionId) })
    await recoverStoredCall(email, { onActions: async () => { order.push('actions') }, onCompleted })
    expect(order).toEqual(['end', 'consolidate', 'actions', 'card'])
    expect(authedFetch).toHaveBeenCalledWith(`/live-session/${call.sessionId}/end`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ seconds: 48, transcript: call.transcript }) }))
    expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ callId: call.sessionId, serverSaved: true, transcript: call.transcript }), call)
    expect(readStoredCall(email)).toBeNull()
    expect(memory.scheduleMemoryRefresh).toHaveBeenCalledExactlyOnceWith(email)
  })
  it('404 cards the local transcript as not saved and clears the key without consolidation', async () => {
    const call = record(); save(call); vi.mocked(authedFetch).mockResolvedValue(new Response('{}', { status: 404 }))
    const onCompleted = vi.fn()
    await recoverStoredCall(email, { onActions: vi.fn(), onCompleted })
    expect(stream).not.toHaveBeenCalled()
    expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ serverSaved: false, final: expect.stringContaining('not saved on the server'), transcript: call.transcript }), call)
    expect(readStoredCall(email)).toBeNull()
    expect(memory.scheduleMemoryRefresh).not.toHaveBeenCalled()
  })
  it('an end error keeps the key and exposes saving Retry; retry saves without opening media', async () => {
    const call = record(); save(call); vi.mocked(authedFetch).mockResolvedValueOnce(new Response('{}', { status: 503 }))
    const onCompleted = vi.fn()
    await expect(recoverStoredCall(email, { onActions: vi.fn(), onCompleted })).rejects.toThrow('could not be saved')
    expect(readStoredCall(email)?.sessionId).toBe(call.sessionId)
    expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ saveError: expect.any(String), serverSaved: false }), call)
    expect(memory.scheduleMemoryRefresh).not.toHaveBeenCalled()
    await retryCallSave(call.sessionId)
    expect(vi.mocked(authedFetch).mock.calls.every(([path]) => path.endsWith('/end'))).toBe(true)
    expect(readStoredCall(email)).toBeNull()
    expect(memory.scheduleMemoryRefresh).toHaveBeenCalledExactlyOnceWith(email)
  })
  it('consolidation errors keep the key; same-boot Retry does not re-end the released call', async () => {
    const call = record(); save(call); vi.mocked(stream).mockImplementationOnce(async function* () { yield { done: true, error: 'scribe unavailable' } })
    await expect(recoverStoredCall(email, { onActions: vi.fn(), onCompleted: vi.fn() })).rejects.toThrow('scribe unavailable')
    expect(readStoredCall(email)?.sessionId).toBe(call.sessionId)
    await retryCallSave(call.sessionId)
    expect(authedFetch).toHaveBeenCalledTimes(1)
    expect(memory.scheduleMemoryRefresh).toHaveBeenCalledExactlyOnceWith(email)
    expect(readStoredCall(email)).toBeNull()
  })
  it('uses a durable call-card fallback when an in-memory retry handle is missing', async () => {
    const fallback = vi.fn(async () => {})
    setCallRetryFallback(fallback)
    const callId = crypto.randomUUID()
    await retryCallSave(callId)
    expect(fallback).toHaveBeenCalledExactlyOnceWith(callId)
    expect(authedFetch).not.toHaveBeenCalled()
  })
  it('reports unavailable retry state instead of silently pretending to save', async () => {
    await expect(retryCallSave(crypto.randomUUID())).rejects.toThrow('Reload and try again')
  })
  it('consolidates a supplied saved call card without ending it again or clearing a newer live call', async () => {
    const older = record(), newer = record(); save(newer)
    const onCompleted = vi.fn()
    await recoverStoredCall(email, { onActions: vi.fn(), onCompleted }, older, true)
    expect(authedFetch).not.toHaveBeenCalled()
    expect(stream).toHaveBeenCalledExactlyOnceWith('call ended', { callId: older.sessionId }, 'consolidate')
    expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ callId: older.sessionId, purpose: older.purpose, serverSaved: true }), older)
    expect(readStoredCall(email)?.sessionId).toBe(newer.sessionId)
    expect(memory.scheduleMemoryRefresh).not.toHaveBeenCalled()
  })
  it('captures the initiating account for delayed memory refreshes', async () => {
    const call = record(); save(call)
    vi.mocked(authedFetch).mockImplementationOnce(async () => {
      vi.mocked(viewerSession).mockReturnValue({ email: 'next@example.test', sessionToken: 'next-session', exp: 9999999999 })
      return new Response('{}')
    })
    await recoverStoredCall(email, { onActions: vi.fn(), onCompleted: vi.fn() })
    expect(memory.scheduleMemoryRefresh).toHaveBeenCalledExactlyOnceWith(email)
  })
  it('keeps a supplied call-card Retry tied to its own record after a newer call takes the live key', async () => {
    const older = record(), newer = record(); save(older)
    vi.mocked(authedFetch).mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await expect(recoverStoredCall(email, { onActions: vi.fn(), onCompleted: vi.fn() })).rejects.toThrow()
    save(newer)
    await retryCallSave(older.sessionId)
    expect(vi.mocked(authedFetch).mock.calls.map(([path]) => path)).toEqual([`/live-session/${older.sessionId}/end`, `/live-session/${older.sessionId}/end`])
    expect(readStoredCall(email)?.sessionId).toBe(newer.sessionId)
  })
  it('boot and start share recovery so only one end and consolidation run', async () => {
    save(record()); let release!: (response: Response) => void
    vi.mocked(authedFetch).mockReturnValue(new Promise(resolve => { release = resolve }))
    const callbacks = { onActions: vi.fn(), onCompleted: vi.fn() }
    const boot = recoverStoredCall(email, callbacks), start = recoverStoredCall(email, callbacks)
    expect(start).toBe(boot)
    release(new Response('{}')); await start
    expect(authedFetch).toHaveBeenCalledTimes(1); expect(stream).toHaveBeenCalledTimes(1)
  })
  it('throttles writes to once per second, captures final updates and keeps the end within limits', async () => {
    const call = record()
    persistLiveCall(email, { ...call, transcript: Array.from({ length: 260 }, (_, index) => ({ role: index % 2 ? 'user' : 'agent', text: `turn ${index} ` + '界'.repeat(600), startMs: index * 1000 })) })
    expect(localStorage.setItem).toHaveBeenCalledTimes(1)
    const rows = readStoredCall(email)!.transcript
    expect(rows.length).toBeLessThanOrEqual(200); expect(rows.every(row => row.text.length <= 400)).toBe(true)
    expect(rows.at(-1)?.startMs).toBe(259000)
    persistLiveCall(email, { ...call, seconds: 49 }); persistLiveCall(email, { ...call, seconds: 50 })
    expect(localStorage.setItem).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(localStorage.setItem).toHaveBeenCalledTimes(2); expect(readStoredCall(email)?.seconds).toBe(50)
  })
  it('cancels a queued trailing write after completion and tolerates disabled storage', async () => {
    const call = record(); persistLiveCall(email, call); persistLiveCall(email, { ...call, seconds: 50 })
    clearStoredCall(email, call.sessionId); await vi.advanceTimersByTimeAsync(1000)
    expect(readStoredCall(email)).toBeNull()
    vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error('disabled') })
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('disabled') })
    expect(() => persistLiveCall(email, record())).not.toThrow()
    expect(readStoredCall(email)).toBeNull()
  })
})
