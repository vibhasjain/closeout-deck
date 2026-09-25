import { describe, expect, it, vi } from 'vitest'
import { createChatHistory } from './chatHistory'
import type { ChatMessage } from './onboarding'
const line = (id: string, at = 1): ChatMessage => ({ id, at, role: 'agent', text: `Message ${id}` })
function harness(local: ChatMessage[] = [], saved: ChatMessage[] = []) {
  let chat = local, pending = saved
  const request = vi.fn<Parameters<typeof createChatHistory>[0]['request']>(async (method) => method === 'GET' ? Response.json({ messages: [] }) : Response.json({ ok: true }))
  const history = createChatHistory({ request, read: () => chat, apply: next => { chat = next }, loadPending: () => pending, savePending: next => { pending = next } })
  return { history, request, chat: () => chat, pending: () => pending }
}
describe('separate append-only chat history', () => {
  it('durably saves pending actions before execution and appends only their settled audit row', async () => {
    const action = { type: 'approve', cycleId: '2026-09-20', groupId: 'CS-01' }
    const pending = { ...line('decision'), actions: [], pendingActions: [action] }
    const h = harness()
    h.history.appended([], [pending])
    expect(h.pending()).toEqual([pending])
    await h.history.flush()
    expect(h.request).not.toHaveBeenCalled()
    const reload = harness([], h.pending())
    await reload.history.load()
    expect(reload.chat()).toEqual([{ ...pending, pendingActions: [], skipped: ['Action outcome unconfirmed after reload; review the cycle before trying again'] }])
    expect(reload.request.mock.calls.map(([method]) => method)).toEqual(['GET', 'POST'])
    expect(reload.pending()).toEqual([])
    const complete = { ...pending, actions: [action], pendingActions: [] }
    h.history.appended([pending], [complete])
    await h.history.flush()
    expect(h.request).toHaveBeenCalledExactlyOnceWith('POST', { messages: [complete] })
    expect(h.pending()).toEqual([])
  })
  it('focus hydration leaves currently executing actions pending until they settle', async () => {
    const pending = { ...line('live'), pendingActions: [{ type: 'approve' }], actions: [] }
    const h = harness()
    h.history.appended([], [pending])
    await h.history.load()
    expect(h.chat()).toEqual([pending])
    expect(h.request.mock.calls.map(([method]) => method)).toEqual(['GET'])
  })
  it('keeps received trace metadata when an older server returns the same message without it', async () => {
    const local = { ...line('same'), traces: ['Read handbooks/mediation.md'] }
    const h = harness([local])
    h.request.mockResolvedValueOnce(Response.json({ messages: [line('same')] }))
    await h.history.load()
    expect(h.chat()).toEqual([local])
  })
  it('hydrates server rows and migrates local and legacy history once by id', async () => {
    const h = harness([line('local', 3), line('same', 1)])
    h.request.mockResolvedValueOnce(Response.json({ messages: [line('remote', 2), line('same', 1)] }))
    await h.history.load([line('legacy', 4)])
    expect(h.chat().map(message => message.id)).toEqual(['same', 'remote', 'local', 'legacy'])
    expect(h.request.mock.calls[1]).toEqual(['POST', { messages: [line('local', 3), line('legacy', 4)] }])
    expect(h.pending()).toEqual([])
  })
  it('queues offline appends durably and retries on reload', async () => {
    const h = harness(); h.history.appended([], [line('new')])
    expect(h.pending()).toEqual([line('new')])
    h.request.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(h.history.flush()).rejects.toThrow('kept here')
    expect(h.pending()).toEqual([line('new')])
    const reload = harness([], h.pending()); await reload.history.load()
    expect(reload.chat()).toEqual([line('new')]); expect(reload.pending()).toEqual([])
  })
  it('focus reload reads other-device lines without duplicating existing ones', async () => {
    const h = harness()
    h.request.mockResolvedValueOnce(Response.json({ messages: [line('first')] })); await h.history.load()
    h.request.mockResolvedValueOnce(Response.json({ messages: [line('first'), line('phone', 2)] })); await h.history.load()
    expect(h.chat().map(message => message.id)).toEqual(['first', 'phone'])
    expect(h.request.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })
  it('migrates old unsynced rows even when the server returns a full newer page', async () => {
    const h = harness([line('old-local', 1)])
    h.request.mockResolvedValueOnce(Response.json({ messages: Array.from({ length: 500 }, (_, i) => line(`remote-${i}`, i + 100)) }))
    await h.history.load()
    expect(h.request.mock.calls[1]).toEqual(['POST', { messages: [line('old-local', 1)] }])
  })
  it('batches by UTF-8 bytes and row count beneath the route body cap', async () => {
    const messages = Array.from({ length: 70 }, (_, i) => ({ ...line(`line-${i}`, i + 1), text: '界'.repeat(20_000) }))
    const h = harness([], messages); await h.history.flush()
    const batches = h.request.mock.calls.map(([, body]) => body!.messages)
    expect(batches.flat()).toEqual(messages)
    expect(batches.length).toBeGreaterThan(2)
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(50)
      expect(new TextEncoder().encode(JSON.stringify({ messages: batch })).length).toBeLessThan(512 * 1024)
    }
  })
  it('isolates a malformed legacy row instead of discarding its valid neighbors', async () => {
    const h = harness([], [line('good'), line('bad'), line('later')])
    h.request.mockImplementation(async (_method, body) => new Response(null, { status: body!.messages.some(message => message.id === 'bad') ? 400 : 200 }))
    await h.history.flush()
    expect(h.request.mock.calls.slice(1).map(([, body]) => body!.messages[0].id)).toEqual(['good', 'bad', 'later'])
    expect(h.pending()).toEqual([])
  })
})
