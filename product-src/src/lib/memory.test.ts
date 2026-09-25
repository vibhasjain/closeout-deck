import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewerSession } from '@/lib/viewerSession'
import { API_BASE } from '@/lib/api'
import { createInstinct, dismissProposal, editInstinct, forgetInstinct, getMemory, getMemorySnapshot, keepInstinct, keepProposal, MemoryError, refreshMemory, scheduleMemoryRefresh, subscribeMemory, watchMemory, type Instinct, type MemorySnapshot } from './memory'

vi.mock('@/lib/viewerSession', () => ({ viewerSession: vi.fn(), expireSession: vi.fn() }))
const fetchMock = vi.fn<typeof fetch>()
const row: Instinct = { id: 'i_1234567890abcdef', kind: 'context', text: 'Travis Reed signs off Lonestar time', source: 'chat', status: 'pending', until: null, ruleId: null, at: '2026-09-25T12:00:00Z' }
const snapshot: MemorySnapshot = { instincts: [row], proposals: [{ ruleId: 'CS-01', count: 4, cycles: 2, topReason: 'Verified with the client' }], lastRun: { trigger: 'send', finishedAt: row.at, applied: 2, dropped: 3 } }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
let sequence = 0
const session = (email: string) => vi.mocked(viewerSession).mockReturnValue({ email, sessionToken: 'memory-session', exp: 9999999999 })
beforeEach(() => {
  vi.useFakeTimers()
  session(`memory-${sequence++}@example.test`)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => response(snapshot))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('memory wire client', () => {
  it('reads the real count-based lastRun using the session bearer and API_BASE', async () => {
    expect(await getMemory()).toEqual(snapshot)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/memory`)
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer memory-session')
  })
  it('creates a user or chat instinct without inventing an email or overriding source/status', async () => {
    fetchMock.mockImplementation(async (_path, init) => response({ instinct: { ...row, ...JSON.parse(String(init?.body)) } }, 201))
    const chat = { kind: 'context' as const, text: row.text, source: 'chat' as const }
    const user = { kind: 'autonomy' as const, text: 'Approves schedule corrections by hand', source: 'user' as const, status: 'active' as const, ruleId: 'CS-01' }
    expect(await createInstinct(chat)).toMatchObject(chat)
    await createInstinct(user)
    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method, JSON.parse(String(init?.body))])).toEqual([
      [`${API_BASE}/memory/instincts`, 'POST', chat], [`${API_BASE}/memory/instincts`, 'POST', user],
    ])
  })
  it('keeps with PATCH active, edits text and nullable until, and forgets without a body', async () => {
    fetchMock.mockImplementation(async () => response({ instinct: { ...row, status: 'active' } }))
    await keepInstinct(row.id)
    await editInstinct(row.id, { text: 'Travis signs off Lonestar time entries', until: null })
    fetchMock.mockImplementation(async () => response({ instinct: { ...row, status: 'forgotten' } }))
    await forgetInstinct(row.id)
    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method, init?.body === undefined ? undefined : JSON.parse(String(init.body))])).toEqual([
      [`${API_BASE}/memory/instincts/${row.id}`, 'PATCH', { status: 'active' }],
      [`${API_BASE}/memory/instincts/${row.id}`, 'PATCH', { text: 'Travis signs off Lonestar time entries', until: null }],
      [`${API_BASE}/memory/instincts/${row.id}/forget`, 'POST', undefined],
    ])
    expect(getMemorySnapshot().instincts).toEqual([])
  })
  it('keeps and dismisses proposals with no body and removes the decided suggestion', async () => {
    await refreshMemory()
    fetchMock.mockImplementation(async path => response({ instinct: { ...row, kind: 'autonomy', source: 'decisions', ruleId: 'CS-01', status: String(path).endsWith('/keep') ? 'active' : 'forgotten' } }))
    await keepProposal('CS-01')
    expect(getMemorySnapshot().proposals).toEqual([])
    await dismissProposal('CS-01')
    expect(fetchMock.mock.calls.slice(1).map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      [`${API_BASE}/memory/proposals/CS-01/keep`, 'POST', undefined], [`${API_BASE}/memory/proposals/CS-01/dismiss`, 'POST', undefined],
    ])
  })
  it.each([['duplicate', 'Already known'], ['tombstone', 'You asked me to forget this']] as const)('preserves the %s 409 reason and client line', async (reason, message) => {
    fetchMock.mockImplementation(async () => response({ reason }, 409))
    await expect(createInstinct({ kind: 'context', text: row.text, source: 'chat' })).rejects.toMatchObject({ status: 409, reason, message })
    await expect(keepInstinct(row.id)).rejects.toBeInstanceOf(MemoryError)
  })
  it('publishes Keep and Edit immediately to all subscribed panes', async () => {
    await refreshMemory()
    const notify = vi.fn(), unsubscribe = subscribeMemory(notify)
    fetchMock.mockImplementation(async () => response({ instinct: { ...row, status: 'active', text: 'A corrected fact' } }))
    await editInstinct(row.id, { text: 'A corrected fact', status: 'active' })
    expect(getMemorySnapshot().instincts).toEqual([{ ...row, status: 'active', text: 'A corrected fact' }])
    expect(notify).toHaveBeenCalledOnce()
    unsubscribe()
  })
  it('never shares a previous account snapshot or publishes its late mutation', async () => {
    await refreshMemory()
    let finish!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const saving = keepInstinct(row.id)
    session('other@example.test')
    expect(getMemorySnapshot().instincts).toEqual([])
    finish(response({ instinct: { ...row, status: 'active' } }))
    await expect(saving).rejects.toThrow('The account changed')
    expect(getMemorySnapshot().instincts).toEqual([])
  })
  it('does not let a pre-Forget read resurrect the row', async () => {
    await refreshMemory()
    let finish!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = refreshMemory()
    fetchMock.mockResolvedValueOnce(response({ instinct: { ...row, status: 'forgotten' } }))
    await forgetInstinct(row.id)
    fetchMock.mockImplementation(async () => response({ ...snapshot, instincts: [] }))
    finish(response(snapshot))
    await pending
    await vi.advanceTimersByTimeAsync(0)
    expect(getMemorySnapshot().instincts).toEqual([])
  })
  it.each(['keep', 'edit'] as const)('does not let a delayed %s response or its chat result resurrect a forgotten id', async operation => {
    await refreshMemory()
    let finish!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = operation === 'keep' ? keepInstinct(row.id) : editInstinct(row.id, { text: 'A correction before Forget' })
    const forgotten: Instinct = { ...row, status: 'forgotten' }
    fetchMock.mockResolvedValueOnce(response({ instinct: forgotten }))
    await forgetInstinct(row.id)
    expect(getMemorySnapshot().instincts).toEqual([])
    finish(response({ instinct: { ...row, status: 'active', text: 'A correction before Forget' } }))
    expect(await pending).toEqual(forgotten)
    expect(getMemorySnapshot().instincts).toEqual([])
    // Even a lagging read cannot bring the confirmed tombstone back into a pane.
    fetchMock.mockResolvedValueOnce(response(snapshot))
    await refreshMemory()
    expect(getMemorySnapshot().instincts).toEqual([])
  })
})

describe('memory refresh lifecycle', () => {
  it('reads on every Rules mount and window focus, and removes the focus listener on unmount', async () => {
    const unmount = watchMemory()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    unmount()
    window.dispatchEvent(new Event('focus'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const again = watchMemory()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    again()
  })
  it('shares a pending mount/focus request across open panes', async () => {
    let finish!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const one = watchMemory(), two = watchMemory()
    window.dispatchEvent(new Event('focus'))
    expect(fetchMock).toHaveBeenCalledOnce()
    finish(response(snapshot)); await vi.advanceTimersByTimeAsync(0)
    one(); two()
  })
  it('refreshes exactly 5 and 30 seconds after a trigger with no Rules pane mounted', async () => {
    scheduleMemoryRefresh()
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(24999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([`${API_BASE}/memory`, `${API_BASE}/memory`])
  })
  it('does not run delayed reads for an account that has signed out', async () => {
    scheduleMemoryRefresh()
    session('next-account@example.test')
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
