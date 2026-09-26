import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Message } from './Message'
import { CallCard } from './CallCard'
import type { CallCard as CallCardValue, CallTranscriptTurn } from '@/lib/chat'
import { authedFetch } from '@/lib/api'

// Exercise the component's event handlers and persistent hooks without adding a DOM dependency.
const hooks = vi.hoisted(() => ({ active: false, index: 0, slots: [] as unknown[] }))
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>()
  return { ...react,
    useState(initial: unknown) {
      if (!hooks.active) return react.useState(initial)
      const index = hooks.index++
      if (!(index in hooks.slots)) hooks.slots[index] = initial
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = next }]
    },
    useRef(initial: unknown) {
      if (!hooks.active) return react.useRef(initial)
      const index = hooks.index++
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }
      return hooks.slots[index]
    },
  }
})
vi.mock('@/lib/api', () => ({ authedFetch: vi.fn() }))

function renderCard(props: Parameters<typeof CallCard>[0]) {
  hooks.active = true; hooks.index = 0
  try { return CallCard(props) } finally { hooks.active = false }
}
function element(tree: ReactNode, type: string): ReactElement<Record<string, unknown>> {
  if (isValidElement<Record<string, unknown>>(tree)) {
    if (tree.type === type) return tree
    for (const child of [tree.props.children].flat() as ReactNode[]) {
      try { return element(child, type) } catch { /* search the other children */ }
    }
  }
  throw new Error(`Missing ${type}`)
}
function toggle(tree: ReactNode, open = true) {
  const handler = element(tree, 'details').props.onToggle as (event: { currentTarget: { open: boolean } }) => void
  handler({ currentTarget: { open } })
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
afterEach(() => { hooks.slots = []; hooks.active = false; vi.resetAllMocks() })

const card: CallCardValue = { kind: 'call', callId: '6b7fef17-4651-40b3-9d88-58621a81b4ca', seconds: 276 }
const transcript: CallTranscriptTurn[] = [
  { role: 'agent', text: 'I’ll write your Payroll profile and Rulebook.', startMs: 0 },
  { role: 'user', text: 'We run Payroll weekly.', startMs: 11200 },
]

describe('call card rendering', () => {
  it('labels the active journal as a live call and keeps expansion offline until it ends', () => {
    const props = { card: { ...card, seconds: 0 }, live: true }
    expect(renderToStaticMarkup(renderCard(props))).toContain('On a call with the Closeout Agent · 0:00')
    toggle(renderCard(props))
    expect(authedFetch).not.toHaveBeenCalled()
    expect(renderToStaticMarkup(renderCard({ ...props, live: false, card: { ...card, seconds: 43 } }))).toContain('You had a call with the Closeout Agent · 0:43')
  })
  it('loads and renders a full 4000-character server turn', async () => {
    const text = 'A'.repeat(3989) + 'END-OF-LINE'
    vi.mocked(authedFetch).mockResolvedValueOnce(Response.json({ call: { id: card.callId, transcript: [{ role: 'agent', text, startMs: 0 }] } }))
    toggle(renderCard({ card })); await flush()
    expect(renderToStaticMarkup(renderCard({ card }))).toContain(text)
  })
  it('renders the exact title and a collapsed, accessible transcript in chat', () => {
    const html = renderToStaticMarkup(createElement(Message, { message: { id: 'call-message', role: 'agent', text: '', at: 1, cards: [card], callTranscript: transcript } }))
    expect(html).toContain('You had a call with the Closeout Agent · 4:36')
    expect(html).toContain(`data-call-id="${card.callId}"`)
    expect(html).toContain('<details class="chat-call-transcript"><summary>Transcript</summary>')
    expect(html).not.toContain('<details open')
    expect(html).toContain('aria-label="Call transcript"')
    expect(html).toContain('<span>Closeout Agent</span><time>0:00</time>')
    expect(html).toContain('<span>You</span><time>0:11</time>')
    expect(html).toContain('We run Payroll weekly.')
  })
  it('formats sub-minute duration and safely renders transcript text', () => {
    const html = renderToStaticMarkup(createElement(CallCard, { card: { ...card, seconds: 9.9 }, transcript: [{ role: 'user', text: '<script>alert(1)</script>', startMs: 1000 }] }))
    expect(html).toContain('Closeout Agent · 0:09')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('waits until expansion before loading a transcript from the server', () => {
    const html = renderToStaticMarkup(createElement(CallCard, { card }))
    expect(html).toContain('Open to load the call transcript.')
    expect(authedFetch).not.toHaveBeenCalled()
  })

  it('fetches once on open, shows loading and caches the validated turns through reopening', async () => {
    let respond!: (response: Response) => void
    vi.mocked(authedFetch).mockImplementation(() => new Promise(resolve => { respond = resolve }))
    const view = renderCard({ card })
    toggle(view, false); expect(authedFetch).not.toHaveBeenCalled()
    toggle(view); toggle(view)
    expect(authedFetch).toHaveBeenCalledExactlyOnceWith(`/calls/${card.callId}`)
    expect(renderToStaticMarkup(renderCard({ card }))).toContain('Loading transcript…')
    respond(new Response(JSON.stringify({ call: { id: card.callId, transcript } }))); await flush()
    const loaded = renderCard({ card })
    expect(renderToStaticMarkup(loaded)).toContain('We run Payroll weekly.')
    toggle(loaded, false); toggle(loaded)
    expect(authedFetch).toHaveBeenCalledOnce()
  })

  it('uses the local transcript without a network request', () => {
    toggle(renderCard({ card, transcript }))
    expect(authedFetch).not.toHaveBeenCalled()
  })

  it.each([404, 503])('shows an honest error and a working Retry after HTTP %s', async status => {
    vi.mocked(authedFetch).mockResolvedValueOnce(new Response('{}', { status }))
    toggle(renderCard({ card })); await flush()
    const failed = renderCard({ card })
    const html = renderToStaticMarkup(failed)
    expect(html).toContain(status === 404 ? 'This call’s transcript isn’t available.' : 'The call transcript could not be loaded.')
    expect(html).toContain('Retry</button>')
    vi.mocked(authedFetch).mockResolvedValueOnce(new Response(JSON.stringify({ call: { id: card.callId, transcript } })))
    const retry = element(failed, 'button').props.onClick as () => void
    retry(); await flush()
    expect(renderToStaticMarkup(renderCard({ card }))).toContain('We run Payroll weekly.')
    expect(authedFetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    { id: 'another-call', transcript },
    { id: card.callId, transcript: [{ role: 'system', text: 'Unexpected data', startMs: 0 }] },
    { id: card.callId, transcript: [{ role: 'user', text: 'x'.repeat(4001), startMs: 0 }] },
    { id: card.callId, transcript: [{ role: 'user', text: 'Unexpected data', startMs: -1 }] },
  ])('rejects malformed or mismatched server transcript data', async call => {
    vi.mocked(authedFetch).mockResolvedValueOnce(new Response(JSON.stringify({ call })))
    toggle(renderCard({ card })); await flush()
    const html = renderToStaticMarkup(renderCard({ card }))
    expect(html).toContain('The call transcript could not be read.')
    expect(html).not.toContain('Unexpected data')
  })

  it('labels saving retries explicitly and invokes only the supplied save callback', () => {
    const onRetrySave = vi.fn()
    const view = renderCard({ card, transcript, saveError: 'The notes could not be saved.', onRetrySave })
    expect(renderToStaticMarkup(view)).toContain('Retry saving</button>')
    const retry = element(view, 'button').props.onClick as () => void
    retry()
    expect(onRetrySave).toHaveBeenCalledOnce(); expect(authedFetch).not.toHaveBeenCalled()
  })
})
