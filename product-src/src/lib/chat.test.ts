import { afterEach, describe, it, expect, vi } from 'vitest'
import { isCard, parseCards, parseActions, stream } from './chat'
import type { ChatContext } from './chat'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('parseActions', () => {
  it('extracts one action and strips the block', () => {
    const r = parseActions('Done, weekly it is.\n```action\n{"type":"set_calendar","patch":{"frequency":"Weekly"}}\n```')
    expect(r.text).toBe('Done, weekly it is.'); expect(r.actions).toEqual([{ type: 'set_calendar', patch: { frequency: 'Weekly' } }])
  })
  it('ignores malformed blocks', () => { expect(parseActions('x\n```action\n{nope\n```').actions).toEqual([]) })
  it('hides complete and streaming mapping fences without treating them as client actions', () => {
    expect(parseActions('I read the clock times.\n```mapping\n{"file":"f_one","v":1}\n```')).toEqual({ text: 'I read the clock times.', actions: [] })
    expect(parseActions('I read the clock times.\n```mapping\n{"file":')).toEqual({ text: 'I read the clock times.', actions: [] })
  })
  it('preserves a server-applied fact action', () => {
    expect(parseActions('Saved.\n```action\n{"type":"set_fact","kind":"account","key":"timezone","value":{"value":"America/New_York"}}\n```'))
      .toEqual({ text: 'Saved.', actions: [{ type: 'set_fact', kind: 'account', key: 'timezone', value: { value: 'America/New_York' } }] })
  })
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
      headers: expect.any(Headers),
      body: JSON.stringify({ mode: 'chat', message: 'Hi', context }),
      signal: undefined,
    })
    expect(Object.fromEntries(fetch.mock.calls[0][1].headers)).toEqual({ 'content-type': 'application/json', authorization: 'Bearer closeout-token' })
    expect(events).toEqual([{ text: 'Hello there' }, { done: true, sessionId: 'server-session', final: 'Final answer' }])
  })

  it('sends the requested mode without a bearer token when development has no session', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 501 }))
    vi.stubGlobal('fetch', fetch)
    const events = []
    for await (const event of stream('Hi', context, 'scribe')) events.push(event)
    expect(fetch).toHaveBeenCalledWith('/api/chat', {
      method: 'POST', headers: expect.any(Headers),
      body: JSON.stringify({ mode: 'scribe', message: 'Hi', context }),
      signal: undefined,
    })
    expect(Object.fromEntries(fetch.mock.calls[0][1].headers)).toEqual({ 'content-type': 'application/json' })
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

  it('passes cancellation to fetch and releases the reader when the consumer stops', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: {"text":"Partial"}\n\n')) },
      cancel,
    }))
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    const reply = stream('Hi', context, 'chat', controller.signal)
    expect(await reply.next()).toEqual({ done: false, value: { text: 'Partial' } })
    await reply.return(undefined)
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal)
    expect(cancel).toHaveBeenCalledOnce()
    expect(response.body?.locked).toBe(false)
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

describe('onboarding cards', () => {
  it.each(['text', 'chips', 'multi', 'calendar', 'files', 'choice'])('validates the %s input', (input) => {
    expect(isCard({ kind: 'question', input, topics: ['calendar'], chips: ['Weekly', 'Biweekly'], placeholder: 'Tell me more', ...(input === 'choice' ? { choice: { yours: 'Your files / connection', sample: 'Use sample' } } : {}) })).toBe(true)
  })
  it('accepts completion and enforces lengths and card shape', () => {
    expect(isCard({ kind: 'onboard_complete' })).toBe(true)
    for (const card of [null, {}, { kind: 'onboard_complete', input: 'text' },
      { kind: 'question', input: 'unknown', topics: [] }, { kind: 'question', input: 'text' },
      { kind: 'question', input: 'chips', topics: [], chips: Array(9).fill('a') },
      { kind: 'question', input: 'text', topics: [false] },
      { kind: 'question', input: 'text', topics: [], placeholder: 'x'.repeat(201) },
      { kind: 'question', input: 'chips', topics: [], chips: ['x'.repeat(201)] },
      { kind: 'question', input: 'choice', topics: [], choice: { yours: 'Files' } },
      { kind: 'question', input: 'choice', topics: [], choice: { yours: 'Files', sample: 'x'.repeat(201) } },
    ]) expect(isCard(card)).toBe(false)
  })
  it('extracts valid cards in inline or multiline fences, leaving actions for their parser', () => {
    const reply = 'How does time reach you?\n```card\n{"kind":"question","input":"text","topics":["workerHours"]}\n```\n```action {"type":"cover_topic","topic":"calendar"}```'
    const parsed = parseCards(reply)
    expect(parsed).toMatchObject({ invalid: false, cards: [{ kind: 'question', input: 'text', topics: ['workerHours'] }] })
    expect(parseActions(parsed.text)).toEqual({ text: 'How does time reach you?', actions: [{ type: 'cover_topic', topic: 'calendar' }] })
    expect(parseCards('```card {"kind":"onboard_complete"}```').cards).toEqual([{ kind: 'onboard_complete' }])
  })
  it('reports malformed, invalid and unfinished cards even beside a valid card', () => {
    for (const block of ['```card {bad}```', '```card {"kind":"unknown"}```', '```card {']) {
      const parsed = parseCards(`Retry this.\n${block}\n\n\`\`\`card {"kind":"onboard_complete"}\`\`\``)
      expect(parsed.invalid).toBe(true)
    }
    expect(parseCards('No card yet')).toEqual({ text: 'No card yet', cards: [], invalid: false })
  })
})

describe('call cards', () => {
  const call = { kind: 'call', callId: '6b7fef17-4651-40b3-9d88-58621a81b4ca', seconds: 276 }
  it('validates and parses the exact persisted call reference', () => {
    expect(isCard(call)).toBe(true)
    expect(isCard({ ...call, seconds: 0 })).toBe(true)
    expect(isCard({ ...call, seconds: 3600 })).toBe(true)
    expect(parseCards(`Call ended.\n\`\`\`card ${JSON.stringify(call)}\`\`\``)).toEqual({ text: 'Call ended.', cards: [call], invalid: false })
  })
  it('rejects missing or invalid references, durations and extra presentation fields', () => {
    for (const card of [
      { kind: 'call', callId: call.callId }, { ...call, callId: '' }, { ...call, callId: '../other-call' },
      { ...call, seconds: '276' }, { ...call, seconds: -1 }, { ...call, seconds: 3601 },
      { ...call, seconds: NaN }, { ...call, seconds: Infinity }, { ...call, transcript: [] },
    ]) expect(isCard(card)).toBe(false)
  })
})
