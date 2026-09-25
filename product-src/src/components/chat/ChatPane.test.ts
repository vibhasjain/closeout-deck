import { Children, isValidElement, type EffectCallback, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPane } from './ChatPane'
import { stream, type ChatEvent } from '@/lib/chat'
import { DEFAULTS, getOnboarding, updateOnboarding } from '@/lib/onboarding'
import { CHAT_POST_EVENT, postToChat } from '@/lib/chatBus'
import { invalidate } from '@/lib/data'

// Exercise the real send handler and effect cleanup without requiring a browser.
const hooks = vi.hoisted(() => ({ cursor: 0, context: 0, slots: [] as unknown[], effects: [] as EffectCallback[] }))
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot] as T, (next: T | ((previous: T) => T)) => {
      hooks.slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[slot] as T) : next
    }]
  },
  useRef: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useContext: () => hooks.context++ === 0 ? {} : [],
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: EffectCallback) => { hooks.effects.push(effect) },
  useLayoutEffect: () => {},
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useLocation: () => ({ pathname: '/payroll' }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))
vi.mock('@/lib/onboarding', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/onboarding')>()
  return { ...original, flushOnboarding: vi.fn(async () => {}), useOnboarding: () => [original.getOnboarding(), original.updateOnboarding] }
})
vi.mock('@/lib/chat', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/chat')>(), stream: vi.fn(),
}))
vi.mock('@/lib/data', () => ({ invalidate: vi.fn(async () => {}) }))

type Props = {
  children?: ReactNode
  'aria-label'?: string
  onChange?: (event: { target: { value: string } }) => void
  onSubmit?: (event: { preventDefault(): void }) => void
}
function elements(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
}
function render() {
  hooks.cursor = 0
  hooks.context = 0
  hooks.effects = []
  return ChatPane()
}
function send(text: string) {
  elements(render()).find(({ props }) => props['aria-label'] === 'Message the Closeout Agent')!.props.onChange!({ target: { value: text } })
  elements(render()).find(({ type }) => type === 'form')!.props.onSubmit!({ preventDefault() {} })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  hooks.slots = []
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn(), cancelAnimationFrame: vi.fn() })
  updateOnboarding(structuredClone(DEFAULTS))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('chat conversation lifetime', () => {
  it('posts an upload chip, preserves ingest mode for one question, then refreshes before the completed reply', async () => {
    const target = new EventTarget()
    vi.stubGlobal('window', Object.assign(target, { setTimeout, clearTimeout, cancelAnimationFrame: vi.fn() }))
    vi.mocked(stream).mockImplementation(async function* (_message, context) {
      expect(context).toEqual({ fileIds: ['f_csv'] })
      yield { done: true, final: 'Are these actual clock times?\n```card\n{"kind":"question","input":"chips","chips":["Actual","Scheduled"],"topics":["workerHours"]}\n```' }
    })
    render()
    const cleanup = hooks.effects.map((effect) => effect())
    postToChat({ text: 'Uploaded fresh.csv for Pacific Cold Storage', mode: 'ingest', context: { fileIds: ['f_csv'] }, contextChip: 'Pacific Cold Storage · fresh.csv' })
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(vi.mocked(stream).mock.calls[0][2]).toBe('ingest')
    expect(getOnboarding().chat[0]).toMatchObject({ contextChip: 'Pacific Cold Storage · fresh.csv', text: 'Uploaded fresh.csv for Pacific Cold Storage' })
    expect(getOnboarding().chat[1]).toMatchObject({ text: 'Are these actual clock times?', ingestFileIds: ['f_csv'], cards: [{ kind: 'question', input: 'chips' }] })
    vi.mocked(stream).mockImplementation(async function* () {
      yield { ingest: { fileId: 'f_csv', status: 'normalized', entries: 3, cycles: ['2026-09-20'], gaps: [] } }
      yield { facts: { applied: 1, cycles: ['2026-09-20'] } }
      yield { done: true, final: 'Three time entries are ready.\n```mapping\n{"file":"f_csv"}\n```' }
    })
    send('Actual')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(4))
    expect(vi.mocked(stream).mock.calls[1][2]).toBe('ingest')
    expect(getOnboarding().chat[3]).toMatchObject({ text: 'Three time entries are ready.' })
    expect(getOnboarding().chat[3].ingestFileIds).toBeUndefined()
    expect(invalidate).toHaveBeenCalledTimes(2)
    cleanup.forEach((dispose) => { if (typeof dispose === 'function') dispose() })
    target.dispatchEvent(new CustomEvent(CHAT_POST_EVENT, { detail: { text: 'Unmounted' } }))
    expect(getOnboarding().chat).toHaveLength(4)
  })
  it('has no Clear control even when the conversation has messages', () => {
    updateOnboarding({ chat: [{ id: 'saved', role: 'agent', text: 'Saved conversation', at: 0 }] })
    const controls = elements(render()).filter(({ type }) => type === 'button')
    expect(controls.some(({ props }) => /clear/i.test(`${props['aria-label'] ?? ''} ${String(props.children)}`))).toBe(false)
    expect(getOnboarding().chat).toHaveLength(1)
  })

  it('saves the final reply and applies its actions instead of intermediate text', async () => {
    vi.mocked(stream).mockImplementation(async function* () {
      yield { text: 'I am checking the calendar.' }
      yield { done: true, sessionId: 'saved-session', final: 'Thursday it is.\n```action\n{"type":"set_calendar","patch":{"payDay":"Thursday"}}\n```' }
    })
    send('Use Thursday')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(getOnboarding().chat[1]).toMatchObject({ role: 'agent', text: 'Thursday it is.', actions: [{ type: 'set_calendar', patch: { payDay: 'Thursday' } }] })
    expect(getOnboarding()).toMatchObject({ payDay: 'Thursday', chatSessionId: 'saved-session' })
  })

  it('aborts the active stream on unmount and preserves saved history', async () => {
    let signal: AbortSignal | undefined
    let finished = false
    vi.mocked(stream).mockImplementation(async function* (_message, _context, _mode, requestSignal): AsyncGenerator<ChatEvent> {
      signal = requestSignal
      try {
        await new Promise<void>((_resolve, reject) => requestSignal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
        yield { done: true }
      } finally { finished = true }
    })
    render()
    const cleanup = hooks.effects.map((effect) => effect())
    send('Keep this question')
    await vi.waitFor(() => expect(signal?.aborted).toBe(false))
    cleanup.forEach((dispose) => { if (typeof dispose === 'function') dispose() })
    expect(signal?.aborted).toBe(true)
    await vi.waitFor(() => expect(finished).toBe(true))
    expect(getOnboarding().chat).toMatchObject([{ role: 'user', text: 'Keep this question' }])
  })
})
