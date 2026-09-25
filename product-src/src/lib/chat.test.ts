import { afterEach, describe, it, expect, vi } from 'vitest'
import { parseActions, stream } from './chat'
import type { ChatContext } from './chat'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('parseActions', () => {
  it('extracts one action and strips the block', () => {
    const r = parseActions('Done, weekly it is.\n```action\n{"type":"set_calendar","patch":{"frequency":"Weekly"}}\n```')
    expect(r.text).toBe('Done, weekly it is.'); expect(r.actions).toEqual([{ type: 'set_calendar', patch: { frequency: 'Weekly' } }])
  })
  it('ignores malformed blocks', () => { expect(parseActions('x\n```action\n{nope\n```').actions).toEqual([]) })
  it('extracts two actions and strips both blocks', () => {
    const r = parseActions('Done.\n```action\n{"type":"set_calendar","patch":{"frequency":"Weekly"}}\n```\n```action\n{"type":"go","to":"/timesheets"}\n```')
    expect(r.text).toBe('Done.')
    expect(r.text).not.toContain('```action')
    expect(r.actions).toEqual([
      { type: 'set_calendar', patch: { frequency: 'Weekly' } },
      { type: 'go', to: '/timesheets' },
    ])
  })
})

describe('chat transport', () => {
  const context: ChatContext = { page: '/payroll', calendar: {} }
  const session = { sessionToken: 'closeout-token', exp: Date.now() / 1000 + 3600, email: 'dev@hypertrack.io' }

  it('sends only the mode, message and context with the session bearer token, preserving streamed deltas', async () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(session) })
    const encoder = new TextEncoder()
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"text":"Hello'))
        controller.enqueue(encoder.encode(' there"}\n\n: ka\n\ndata: {"done":true,"sessionId":"server-session","final":"Final answer"}\n\n'))
        controller.close()
      },
    }))
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)
    const events = []
    for await (const event of stream('Hi', context)) events.push(event)
    expect(fetch).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer closeout-token' },
      body: JSON.stringify({ mode: 'chat', message: 'Hi', context }),
      signal: undefined,
    })
    expect(events).toEqual([{ text: 'Hello there' }, { done: true, sessionId: 'server-session', final: 'Final answer' }])
  })

  it('sends the requested mode without a bearer token when development has no session', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 501 }))
    vi.stubGlobal('fetch', fetch)
    const events = []
    for await (const event of stream('Hi', context, 'scribe')) events.push(event)
    expect(fetch).toHaveBeenCalledWith('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'scribe', message: 'Hi', context }),
      signal: undefined,
    })
    expect(events).toEqual([{ done: true, error: 'Chat is unavailable right now' }])
  })

  it('passes the abort signal to fetch and propagates cancellation', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const controller = new AbortController()
    const fetch = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const pending = stream('Hi', context, 'chat', controller.signal).next()
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('clears the Closeout session and reloads on an unauthorized response', async () => {
    const removeItem = vi.fn()
    const reload = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(session), removeItem })
    vi.stubGlobal('window', { location: { reload } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    const events = []
    for await (const event of stream('Hi', context)) events.push(event)
    expect(events).toEqual([])
    expect(removeItem).toHaveBeenCalledExactlyOnceWith('closeout:session:v1')
    expect(reload).toHaveBeenCalledOnce()
  })
})
