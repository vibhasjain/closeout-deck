import { Children, isValidElement, type EffectCallback, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPane } from './ChatPane'
import { stream, type ChatEvent } from '@/lib/chat'
import { DEFAULTS, flushOnboarding, getOnboarding, updateOnboarding } from '@/lib/onboarding'
import { CHAT_POST_EVENT, postToChat } from '@/lib/chatBus'
import { invalidate } from '@/lib/data'
import { decide } from '@/lib/journey'

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
const data = vi.hoisted(() => ({ snapshot: { loaded: false, files: [] as { id: string; status: string }[] } }))
vi.mock('@/lib/data', () => ({ invalidate: vi.fn(async () => {}), getDataSnapshot: () => data.snapshot }))
vi.mock('@/lib/journey', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/journey')>(), decide: vi.fn(),
}))

type Props = {
  children?: ReactNode
  'aria-label'?: string
  onClick?: () => void
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
  data.snapshot = { loaded: false, files: [] }
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('chat conversation lifetime', () => {
  it('keeps an ingest follow-up attached to its question after an earlier memory was resolved', async () => {
    updateOnboarding({ chat: [
      { id: 'question', role: 'agent', text: 'Are these actual clock times?', at: 1, ingestFileIds: ['f_csv'], cards: [{ kind: 'question', input: 'chips', chips: ['Actual', 'Scheduled'], topics: [] }] },
      { id: 'receipt', role: 'agent', text: '', at: 2, actions: [{ type: 'memory_resolution', messageId: 'earlier', instinctId: 'i_123', state: 'active' }] },
    ] })
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: 'Saved.' } })
    send('Actual')
    await vi.waitFor(() => expect(stream).toHaveBeenCalled())
    expect(vi.mocked(stream).mock.calls[0][1]).toEqual({ fileIds: ['f_csv'] })
    expect(vi.mocked(stream).mock.calls[0][2]).toBe('ingest')
  })
  it('answers a mapping question as a chat turn once its file was removed, and keeps a file still awaiting mapping', async () => {
    const question = { id: 'question', role: 'agent' as const, text: 'Are these actual clock times?', at: 1, ingestFileIds: ['f_gone', 'f_left'], cards: [{ kind: 'question' as const, input: 'chips' as const, chips: ['Actual', 'Scheduled'], topics: [] }] }
    updateOnboarding({ chat: [question] })
    data.snapshot = { loaded: true, files: [{ id: 'f_left', status: 'needs_mapping' }] }
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: 'Saved.' } })
    send('Actual')
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(1))
    expect(vi.mocked(stream).mock.calls[0][1]).toEqual({ fileIds: ['f_left'] })
    expect(vi.mocked(stream).mock.calls[0][2]).toBe('ingest')

    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(3))
    updateOnboarding({ chat: [question] })
    data.snapshot = { loaded: true, files: [] }
    send('Actual')
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2))
    expect(vi.mocked(stream).mock.calls[1][2]).toBe('chat')
    expect(vi.mocked(stream).mock.calls[1][1]).not.toHaveProperty('fileIds')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(3))
    expect(getOnboarding().chat[1].ingestFileIds).toBeUndefined()
  })
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
  it('ends ingest mode for a next-step post and for replies that do not answer a mapping question', async () => {
    const target = new EventTarget()
    vi.stubGlobal('window', Object.assign(target, { setTimeout, clearTimeout, cancelAnimationFrame: vi.fn() }))
    vi.mocked(stream).mockImplementation(async function* () {
      yield { done: true, final: 'Are these actual clock times?\n```card\n{"kind":"question","input":"chips","chips":["Actual","Scheduled"],"topics":["workerHours"]}\n```' }
    })
    render()
    hooks.effects.map((effect) => effect())
    postToChat({ text: 'Uploaded fresh.csv', mode: 'ingest', context: { fileIds: ['f_csv'] } })
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: 'I still need to know which column is the client.' } })
    postToChat({ text: 'Chase missing time for Sep 14 to 20', context: { page: '/payroll', calendar: {} }, contextChip: 'Chase missing time · Sep 14 to 20' })
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(4))
    expect(vi.mocked(stream).mock.calls[1][2]).toBe('chat')
    expect(vi.mocked(stream).mock.calls[1][1]).toEqual({ page: '/payroll', calendar: {} })
    getOnboarding().chat[3] = { ...getOnboarding().chat[3], ingestFileIds: ['f_csv'] }
    send('Which payments are on hold?')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(6))
    expect(vi.mocked(stream).mock.calls[2][2]).toBe('chat')
    expect(getOnboarding().chat[4].ingestFileIds).toBeUndefined()
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

  it('persists real trace frames with the final message, with three data reads and separate handbook reads', async () => {
    vi.mocked(stream).mockImplementation(async function* () {
      yield { trace: 'Read handbooks/send-to-payroll.md' }
      yield { text: 'Checking the batch.' }
      yield { trace: 'Read data/cycles/2026-09-20.json' }
      yield { trace: 'Read handbooks/send-to-payroll.md' }
      yield { trace: 'Made up progress' }
      yield { trace: 'Read data/decisions.jsonl' }
      yield { trace: 'Read data/extra.json' }
      yield { done: true, final: 'The batch is ready for your review.' }
    })
    send('Review the batch')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(getOnboarding().chat[1]).toMatchObject({ text: 'The batch is ready for your review.', traces: [
      'Read handbooks/send-to-payroll.md', 'Read data/cycles/2026-09-20.json', 'Read data/decisions.jsonl', 'Read data/extra.json',
    ] })
    expect(getOnboarding().chat[0].traces).toBeUndefined()
  })

  it('deduplicates an open_form action with its card and preserves only the agent-written message text', async () => {
    vi.mocked(stream).mockImplementation(async function* () {
      yield { done: true, final: 'Choose the Payroll destination.\n```card {"kind":"form","form":"send","cycleId":"2026-09-20"}```\n```action {"type":"open_form","form":"send","cycleId":"2026-09-20"}```' }
    })
    send('Send to Payroll')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(getOnboarding().chat[1]).toMatchObject({ text: 'Choose the Payroll destination.',
      cards: [{ kind: 'form', form: 'send', cycleId: '2026-09-20' }],
      actions: [{ type: 'open_form', form: 'send', cycleId: '2026-09-20' }], skipped: [],
    })
    expect(getOnboarding().chat[1].cards).toHaveLength(1)
    expect(decide).not.toHaveBeenCalled()
  })

  it('awaits a decision and does not label a failed mutation Applied', async () => {
    let rejectDecision: (error: Error) => void = () => {}
    vi.mocked(decide).mockImplementation(() => new Promise((_resolve, reject) => { rejectDecision = reject }))
    vi.mocked(stream).mockImplementation(async function* () {
      yield { done: true, final: 'Applying your choice.\n```action {"type":"approve","cycleId":"2026-09-20","groupId":"CS-01"}```' }
    })
    send('Approve the duplicates')
    await vi.waitFor(() => expect(decide).toHaveBeenCalledWith('2026-09-20', { groupId: 'CS-01', decision: 'approved' }))
    expect(getOnboarding().chat).toHaveLength(2)
    expect(getOnboarding().chat[1]).toMatchObject({ actions: [], pendingActions: [{ type: 'approve' }] })
    rejectDecision(new Error('Decision could not be saved'))
    await vi.waitFor(() => expect(getOnboarding().chat[1].pendingActions).toEqual([]))
    expect(getOnboarding().chat[1]).toMatchObject({ text: 'Applying your choice.', actions: [], skipped: ['approve: Decision could not be saved'] })
  })

  it('rejects server shift-level decide without a mutation or a false Applied audit line', async () => {
    updateOnboarding({ dataSource: 'server' })
    vi.mocked(stream).mockImplementation(async function* () {
      yield { done: true, final: 'Reviewing Maria.\n```action {"type":"decide","cycleId":"2026-09-20","shiftId":"maria","decision":"dismissed","reason":"Took her meal"}```' }
    })
    send('She took her meal')
    await vi.waitFor(() => expect(getOnboarding().chat[1]?.pendingActions).toEqual([]))
    expect(decide).not.toHaveBeenCalled()
    expect(getOnboarding().chat[1]).toMatchObject({ actions: [], skipped: ['decide: use approve/dismiss for a group'] })
  })

  it('Stop keeps the saved reply and in-flight outcome, but never starts the remaining actions', async () => {
    let finishDecision!: () => void
    vi.mocked(decide).mockImplementation(() => new Promise(resolve => { finishDecision = () => resolve({} as Awaited<ReturnType<typeof decide>>) }))
    vi.mocked(stream).mockImplementation(async function* () {
      yield { text: 'Checking both groups.' }
      yield { done: true, final: 'Applying two group choices.\n```action {"type":"approve","cycleId":"2026-09-20","groupId":"CS-01"}```\n```action {"type":"dismiss","cycleId":"2026-09-20","groupId":"CA-MB-01","reason":"Verified waivers"}```' }
    })
    send('Apply these choices')
    await vi.waitFor(() => expect(decide).toHaveBeenCalledTimes(1))
    expect(getOnboarding().chat[1]).toMatchObject({ text: 'Applying two group choices.', actions: [], pendingActions: [{ type: 'approve' }, { type: 'dismiss' }] })
    elements(render()).find(({ props }) => props['aria-label'] === 'Stop reply')!.props.onClick!()
    expect(getOnboarding().chat).toHaveLength(2)
    finishDecision()
    await vi.waitFor(() => expect(getOnboarding().chat[1].pendingActions).toEqual([]))
    expect(decide).toHaveBeenCalledTimes(1)
    expect(getOnboarding().chat[1]).toMatchObject({ actions: [{ type: 'approve', groupId: 'CS-01' }], skipped: ['dismiss: stopped before applying'] })
    expect(getOnboarding().chat).toHaveLength(2)
  })

  it('an unmounted decision completion merges into current history without losing a later message', async () => {
    let finishDecision!: () => void
    vi.mocked(decide).mockImplementation(() => new Promise(resolve => { finishDecision = () => resolve({} as Awaited<ReturnType<typeof decide>>) }))
    vi.mocked(stream).mockImplementation(async function* () {
      yield { done: true, final: 'Applying the group choice.\n```action {"type":"approve","cycleId":"2026-09-20","groupId":"CS-01"}```' }
    })
    render()
    const cleanup = hooks.effects.map(effect => effect())
    send('Approve the group')
    await vi.waitFor(() => expect(decide).toHaveBeenCalledTimes(1))
    cleanup.forEach(dispose => { if (typeof dispose === 'function') dispose() })
    updateOnboarding({ chat: [...getOnboarding().chat, { id: 'later-message', role: 'user', text: 'Another question from the new pane', at: Date.now() }] })
    finishDecision()
    await vi.waitFor(() => expect(getOnboarding().chat[1].pendingActions).toEqual([]))
    expect(getOnboarding().chat).toHaveLength(3)
    expect(getOnboarding().chat[2].id).toBe('later-message')
    expect(getOnboarding().chat[1].actions).toEqual([{ type: 'approve', cycleId: '2026-09-20', groupId: 'CS-01' }])
  })

  it('caps the combined card fences and open_form actions before persisting the message', async () => {
    vi.mocked(stream).mockImplementation(async function* () {
      yield { done: true, final: 'Here is the closeout.\n```card {"kind":"task","cycleId":"2026-09-20"}```\n```card {"kind":"findings","cycleId":"2026-09-20"}```\n```card {"kind":"form","form":"gaps","cycleId":"2026-09-20"}```\n```action {"type":"open_form","form":"send","cycleId":"2026-09-20"}```\n```action {"type":"open_form","form":"dispute","cycleId":"2026-09-20"}```' }
    })
    send('Show this closeout')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    const saved = getOnboarding().chat[1]
    expect(saved.text).toBe('Here is the closeout.')
    expect(saved.cards).toHaveLength(3)
    expect(JSON.stringify(saved.cards).length).toBeLessThanOrEqual(8192)
    expect(saved.skipped?.length).toBeGreaterThan(0)
  })

  it('sends despite unrelated sync failure and keeps valid actions when a neighboring model action is invalid', async () => {
    vi.mocked(flushOnboarding).mockRejectedValueOnce(new Error('profile save unavailable'))
    vi.mocked(stream).mockImplementation(async function* () {
      yield { done: true, final: 'Thursday it is.\n```action {"type":"set_calendar","patch":{"payDay":"Thursday"}}```\n```action {"type":"never_contact","name":""}```\n```action {invalid}```' }
    })
    send('Use Thursday')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(stream).toHaveBeenCalledOnce()
    expect(getOnboarding().payDay).toBe('Thursday')
    expect(getOnboarding().chat[1]).toMatchObject({ text: 'Thursday it is.', skipped: ['malformed action', 'never_contact'], actions: [{ type: 'set_calendar', patch: { payDay: 'Thursday' } }] })
  })

  it('drops unsafe model URLs from choices and chips before persisting them', async () => {
    updateOnboarding({ firm: { name: 'Acme', domain: 'acme.com', summary: '', states: [], verticals: [], clientTypes: [], size: '', staffing: true } })
    vi.mocked(stream).mockImplementation(async function* () {
      yield { done: true, final: 'Choose your source.\n```card {"kind":"question","input":"choice","set":1,"topics":["workerHours"],"choice":{"yours":"Your hours https://evil.tld/exfil","sample":"Sample hours"}}```\n```card {"kind":"question","input":"chips","topics":[],"chips":["https://evil.tld","Safe"]}```' }
    })
    send('Use my hours')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(getOnboarding().chat[1].cards).toMatchObject([{ choice: { yours: 'Your hours', sample: 'Sample hours' } }, { chips: ['Safe'] }])
    expect(getOnboarding().chat[1].skipped).toEqual(['card URL'])
    expect(JSON.stringify(getOnboarding().chat[1])).not.toContain('evil.tld')
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
