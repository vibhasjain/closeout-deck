import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAction, isAction } from '@/components/chat/ChatPane'
import { authedFetch } from '@/lib/api'
import { createChatHistory } from '@/lib/chatHistory'
import type { Action } from '@/lib/chat'
import type { ChatMessage } from '@/lib/onboarding'
import { isRememberReceipt, memoryHistory, recordMemoryResolution, type RememberReceipt } from './chatMemory'

vi.mock('@/lib/api', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/api')>(), authedFetch: vi.fn() }))
vi.mock('@/lib/viewerSession', () => ({ viewerSession: () => ({ email: 'memory-chat-test@example.com' }) }))

const action: Extract<Action, { type: 'remember' }> = { type: 'remember', kind: 'context', text: 'Travis Reed signs off Lonestar, not the site manager.' }
const receipt: RememberReceipt = { ...action, memory: { id: 'i_0123456789abcdef', state: 'pending' } }
const original = (): ChatMessage => ({ id: 'agent-memory', role: 'agent', text: 'I understand.', at: 1, scope: 'shift:travis', actions: [receipt] })
const apply = (value: Extract<Action, { type: 'remember' }>) => applyAction(value, vi.fn(), vi.fn(), new URLSearchParams())

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('remember actions exported through ChatPane', () => {
  it.each(['context', 'autonomy', 'style'] as const)('accepts %s and a real optional until date', kind => {
    expect(isAction({ ...action, kind })).toBe(true)
    expect(isAction({ ...action, kind, until: '2028-02-29' })).toBe(true)
    expect(isAction({ ...action, kind, text: 'x'.repeat(280) })).toBe(true)
  })

  it.each([
    null, [], { type: 'remember' }, { ...action, kind: 'rule' }, { ...action, kind: 1 },
    { ...action, text: '' }, { ...action, text: '  ' }, { ...action, text: 1 }, { ...action, text: 'x'.repeat(281) },
    { ...action, until: null }, { ...action, until: 20270101 }, { ...action, until: 'tomorrow' },
    { ...action, until: '2027-02-29' }, { ...action, until: '2027-13-01' }, { ...action, until: '2027-01-32' },
    { ...action, until: '2027-01-01T00:00:00Z' }, { ...action, source: 'user' }, { ...action, status: 'active' },
  ])('rejects malformed remember %#', value => expect(isAction(value)).toBe(false))

  it('posts a chat correction and returns its pending receipt without changing the Rules list', async () => {
    vi.mocked(authedFetch).mockResolvedValueOnce(Response.json({ instinct: {
      id: receipt.memory.id, kind: action.kind, text: action.text, status: 'pending', source: 'chat',
      until: '2027-01-15', ruleId: null, at: '2026-09-25T12:00:00Z',
    } }, { status: 201 }))
    const update = vi.fn()
    const result = await applyAction({ ...action, until: '2027-01-15' }, update, vi.fn(), new URLSearchParams())
    expect(authedFetch).toHaveBeenCalledExactlyOnceWith('/memory/instincts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'context', text: action.text, until: '2027-01-15', source: 'chat' }),
    })
    expect(result).toEqual({ ...receipt, until: '2027-01-15' })
    expect(update).not.toHaveBeenCalled()
  })

  it.each(['duplicate', 'tombstone'] as const)('records the 409 %s outcome with the message', async reason => {
    vi.mocked(authedFetch).mockResolvedValueOnce(Response.json({ reason }, { status: 409 }))
    expect(await apply(action)).toEqual({ ...action, memory: { state: reason } })
    expect(isRememberReceipt({ ...action, memory: { state: reason } })).toBe(true)
  })

  it('does not turn an unrecognized conflict or failed save into a remembered receipt', async () => {
    vi.mocked(authedFetch).mockResolvedValueOnce(Response.json({ reason: 'other' }, { status: 409 }))
    await expect(apply(action)).rejects.toThrow('Memory could not be updated')
    vi.mocked(authedFetch).mockResolvedValueOnce(Response.json({}, { status: 503 }))
    await expect(apply(action)).rejects.toThrow('Memory could not be updated')
  })
})

describe('append-only remembered chat history', () => {
  it('appends Keep and Forget outcomes, folds them onto the original line and leaves ordinary messages alone', () => {
    const initial = [original(), { id: 'user', role: 'user' as const, text: 'Thank you.', at: 2 }]
    const kept = recordMemoryResolution(initial, 'agent-memory', receipt.memory.id!, 'active')
    expect(initial).toHaveLength(2)
    expect(kept[0]).toBe(initial[0])
    expect(kept[2]).toMatchObject({ text: '', scope: 'shift:travis', actions: [{ type: 'memory_resolution', state: 'active' }] })
    expect(recordMemoryResolution(kept, 'agent-memory', receipt.memory.id!, 'active')).toBe(kept)
    const forgotten = recordMemoryResolution(kept, 'agent-memory', receipt.memory.id!, 'forgotten')
    expect(forgotten).toHaveLength(4)
    expect(recordMemoryResolution(forgotten, 'agent-memory', receipt.memory.id!, 'active')).toBe(forgotten)
    const visible = memoryHistory(forgotten)
    expect(visible).toHaveLength(2)
    expect(visible[0]).toMatchObject({ id: 'agent-memory', text: 'I understand.', actions: [{ ...receipt, memory: { id: receipt.memory.id, state: 'forgotten' } }] })
    expect(visible[1]).toEqual(initial[1])
    expect(original().actions).toEqual([receipt])
    const lateKeep: ChatMessage = { id: 'late-keep', role: 'agent', text: '', at: Date.now() + 1, actions: [{ type: 'memory_resolution', messageId: 'agent-memory', instinctId: receipt.memory.id, state: 'active' }] }
    expect(memoryHistory([...forgotten, lateKeep])[0]).toEqual(visible[0])
  })

  it('uploads only new resolution rows and restores the resolved line from canonical history after reload', async () => {
    const server: ChatMessage[] = []
    const request = vi.fn<Parameters<typeof createChatHistory>[0]['request']>(async (method, body) => {
      if (method === 'GET') return Response.json({ messages: server })
      server.push(...structuredClone(body!.messages))
      return Response.json({ ok: true })
    })
    let local: ChatMessage[] = [original()], pending: ChatMessage[] = []
    const history = createChatHistory({ request, read: () => local, apply: next => { local = next }, loadPending: () => pending, savePending: next => { pending = next } })
    history.appended([], local)
    await history.flush()
    const kept = recordMemoryResolution(local, 'agent-memory', receipt.memory.id!, 'active')
    history.appended(local, kept)
    local = kept
    await history.flush()
    const forgotten = recordMemoryResolution(local, 'agent-memory', receipt.memory.id!, 'forgotten')
    history.appended(local, forgotten)
    local = forgotten
    await history.flush()
    expect(request.mock.calls.map(([, body]) => body?.messages.length)).toEqual([1, 1, 1])
    expect(server[0].actions).toEqual([receipt])
    expect(pending).toEqual([])

    let reloaded: ChatMessage[] = []
    const reload = createChatHistory({ request, read: () => reloaded, apply: next => { reloaded = next }, loadPending: () => [], savePending: () => {} })
    await reload.load()
    expect(request.mock.calls.at(-1)?.[0]).toBe('GET')
    expect(reloaded).toHaveLength(3)
    expect(memoryHistory(reloaded)).toEqual([expect.objectContaining({ id: 'agent-memory', actions: [{ ...receipt, memory: { id: receipt.memory.id, state: 'forgotten' } }] })])
    expect(authedFetch).not.toHaveBeenCalled()
  })
})
