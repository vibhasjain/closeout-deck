import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ChatPane } from './ChatPane'
import { Message } from './Message'
import { dayDivider } from './dayDivider'
import { startCall } from '@/lib/live'
import { startDictation, type DictationOptions } from '@/lib/dictate'
import { DEFAULTS, getOnboarding, updateOnboarding, type Onboarding } from '@/lib/onboarding'
import { CHAT_POST_EVENT } from '@/lib/chatBus'
import { Chip } from '@/components/ui'
import { DeskCall } from '@/components/voice/DeskCall'
import { Loader2, Square } from 'lucide-react'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], suggestions: [] as string[], effects: [] as { effect: () => void; dependencies?: unknown[] }[] }))
const router = vi.hoisted(() => ({ params: new URLSearchParams(), setParams: vi.fn(), navigate: vi.fn() }))
const transport = vi.hoisted(() => ({ stream: vi.fn() }))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useContext: (context: { _currentValue: unknown }) => Array.isArray(context._currentValue) ? hooks.suggestions : context._currentValue,
  useState: <T>(initial: T | (() => T)) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[slot], (next: T | ((previous: T) => T)) => {
      hooks.slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[slot] as T) : next
    }]
  },
  useRef: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void, dependencies?: unknown[]) => { hooks.effects.push({ effect, dependencies }) },
  useLayoutEffect: () => {},
}))
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/payroll' }),
  useNavigate: () => router.navigate,
  useSearchParams: () => [router.params, router.setParams],
}))
vi.mock('@/lib/onboarding', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/onboarding')>()
  return { ...original, flushOnboarding: vi.fn(async () => {}), useOnboarding: () => [original.getOnboarding(), original.updateOnboarding] }
})
vi.mock('@/lib/chat', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/chat')>(), stream: transport.stream,
}))

vi.mock('@/lib/live', async (original) => ({ ...await original<typeof import('@/lib/live')>(), startCall: vi.fn() }))
vi.mock('@/lib/dictate', () => ({ startDictation: vi.fn() }))

type Props = {
  children?: ReactNode
  message?: { text: string }
  className?: string
  disabled?: boolean
  value?: string
  placeholder?: string
  'aria-label'?: string
  'aria-pressed'?: boolean
  'data-action'?: string
  'data-composer-action'?: string
  onClick?: () => void
  onSubmit?: (event: { preventDefault(): void }) => void
  onChange?: (event: { target: { value: string; files?: FileList } }) => void
  onKeyDown?: (event: { key: string; shiftKey: boolean; nativeEvent: { isComposing: boolean }; preventDefault(): void }) => void
}
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap((child) => isValidElement<Props>(child)
  ? [child, ...elements(child.props.children)] : [])
const button = (tree: ReactNode, name: string) => elements(tree).find((element) => element.type === 'button' && element.props['aria-label'] === name)!
const textarea = (tree: ReactNode) => elements(tree).find((element) => element.type === 'textarea')!
const composer = (tree: ReactNode) => elements(tree).find((element) => element.type === 'form')!
function render(scope?: string) { hooks.cursor = 0; hooks.effects = []; return ChatPane({ scope }) }
function type(value: string) { textarea(render()).props.onChange!({ target: { value } }) }
function submit() { composer(render()).props.onSubmit!({ preventDefault() {} }) }

beforeEach(() => {
  hooks.slots = []
  hooks.suggestions = []
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  updateOnboarding(structuredClone(DEFAULTS))
  router.params = new URLSearchParams()
  router.setParams.mockImplementation((next: (previous: URLSearchParams) => URLSearchParams) => { router.params = next(router.params) })
  transport.stream.mockImplementation(async function* () { yield { text: 'Ready.' }; yield { done: true } })
})
afterEach(() => vi.unstubAllGlobals())

describe('permanent Closeout Agent conversation', () => {
  it('has an empty-state orb, exact placeholder, one phone trailing action, and no Clear control', () => {
    const tree = render()
    expect(textarea(tree).props.placeholder).toBe('Ask the Closeout Agent…')
    expect(button(tree, 'Call your Closeout Agent').props.disabled).toBe(false)
    expect(elements(tree).filter(({ props }) => props.className === 'icon-btn chat-send')).toHaveLength(1)
    expect(elements(tree).some(({ props }) => props.className === 'chat-empty')).toBe(true)
    expect(elements(tree).some(({ props }) => /clear/i.test(props['aria-label'] ?? ''))).toBe(false)
    expect(button(tree, 'Call your Closeout Agent').props['data-action']).toBe('phone')
    expect(tree.props['data-composer-action']).toBe('phone')
  })

  it('starts a desk call from the single empty trailing button and switches to Send with text', async () => {
    const snapshot = { status: 'connecting' as const, orb: 'connecting' as const, stream: null, remoteStream: null, muted: false, seconds: 0, caption: '', transcript: [], level: 0 }
    vi.mocked(startCall).mockReturnValue({ snapshot: () => snapshot, hangup: vi.fn(async () => {}), dispose: vi.fn(async () => {}), release: vi.fn(async () => {}), retrySave: vi.fn(async () => {}), retryTurn: vi.fn(), mute: vi.fn() })
    button(render(), 'Call your Closeout Agent').props.onClick!()
    await vi.waitFor(() => expect(startCall).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'desk' })))
    expect(vi.mocked(startCall).mock.calls[0][0].getContext?.()).toMatchObject({ page: '/payroll', calendar: expect.any(Object) })
    expect(transport.stream).not.toHaveBeenCalled()
    expect(elements(render()).some(element => element.type === DeskCall)).toBe(true)
    // A fresh composer has Send when there is a draft, then Stop during its reply.
    hooks.slots = []
    type('Review this Payroll')
    expect(button(render(), 'Send message').props.disabled).toBe(false)
    expect(button(render(), 'Call your Closeout Agent')).toBeUndefined()
    expect(button(render(), 'Send message').props['data-action']).toBe('send')
    expect(render().props['data-composer-action']).toBe('send')
  })

  it('blocks suggestions and posted chat turns for the full live call', async () => {
    const snapshot = { status: 'active' as const, orb: 'listening' as const, stream: null, remoteStream: null, muted: false, seconds: 8, caption: '', transcript: [], level: 0 }
    vi.mocked(startCall).mockReturnValue({ snapshot: () => snapshot, hangup: vi.fn(async () => {}), dispose: vi.fn(async () => {}), release: vi.fn(async () => {}), retrySave: vi.fn(async () => {}), retryTurn: vi.fn(), mute: vi.fn() })
    hooks.suggestions = ['Review this Payroll']
    button(render(), 'Call your Closeout Agent').props.onClick!()
    await vi.waitFor(() => expect(startCall).toHaveBeenCalled())
    const tree = render()
    const suggestion = elements(tree).find(element => element.type === Chip)!
    expect(suggestion.props.disabled).toBe(true)
    suggestion.props.onClick!()
    hooks.effects.find(({ dependencies }) => dependencies?.[1] === router.setParams)!.effect()
    const listener = vi.mocked(window.addEventListener).mock.calls.find(([type]) => type === CHAT_POST_EVENT)?.[1] as EventListener
    listener({ detail: { text: 'Approve this item' } } as unknown as Event)
    expect(router.setParams).not.toHaveBeenCalled()
    expect(transport.stream).not.toHaveBeenCalled()
    expect(getOnboarding().chat).toHaveLength(0)
  })

  it('shows dictation connecting, listening and finishing states with an outline error retry', async () => {
    let options!: DictationOptions
    let finish!: (text: string) => void
    const stop = vi.fn(() => { options.onState?.('finishing'); return new Promise<string>(resolve => { finish = resolve }) })
    vi.mocked(startDictation).mockImplementation(value => { options = value; return { stop, dispose: vi.fn() } })
    button(render(), 'Dictate message').props.onClick!()
    expect(button(render(), 'Stop dictation').props['aria-pressed']).toBe(true)
    options.onState?.('connecting')
    expect(elements(render()).some(element => element.props.children === 'Connecting…')).toBe(true)
    expect(elements(button(render(), 'Stop dictation')).some(element => element.type === Loader2)).toBe(true)
    options.onState?.('listening')
    expect(elements(render()).some(element => element.props.children === 'Listening…')).toBe(true)
    expect(elements(button(render(), 'Stop dictation')).some(element => element.type === Square)).toBe(true)
    button(render(), 'Stop dictation').props.onClick!()
    expect(elements(render()).some(element => element.props.children === 'Finishing…')).toBe(true)
    expect(button(render(), 'Stop dictation').props.disabled).toBe(true)
    finish('Please check')
    await Promise.resolve()
    options.onError('The dictation connection was interrupted.')
    const retry = elements(render()).find(element => element.props.children === 'Retry')!
    expect(retry.props.className).toBe('btn')
  })

  it('Enter waits for dictation commit completion before sending the corrected final transcript', async () => {
    let options!: DictationOptions
    let finish!: (text: string) => void
    const stop = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
    vi.mocked(startDictation).mockImplementation(value => { options = value; return { stop, dispose: vi.fn() } })
    type('Please')
    button(render(), 'Dictate message').props.onClick!()
    options.onTranscript('approve the entry', false)
    expect(textarea(render()).props.value).toBe('Please approve the entry')
    textarea(render()).props.onKeyDown!({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault() {} })
    expect(stop).toHaveBeenCalledOnce()
    expect(transport.stream).not.toHaveBeenCalled()
    options.onTranscript('approve the time entries.', true)
    finish('approve the time entries.')
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(getOnboarding().chat[0].text).toBe('Please approve the time entries.')
  })

  it('keeps existing conversation and session when sending and never offers Clear', async () => {
    const previous: Onboarding['chat'] = Array.from({ length: 205 }, (_, index) => ({ id: `${index}`, role: 'user', text: 'Earlier', at: 1 }))
    updateOnboarding({ chat: previous, chatSessionId: 'same-session' })
    type('Hello')
    submit()
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(207))
    expect(getOnboarding().chat.slice(0, 205)).toEqual(previous)
    expect(getOnboarding().chatSessionId).toBe('same-session')
    expect(elements(render()).some(({ props }) => /clear/i.test(props['aria-label'] ?? ''))).toBe(false)
  })

  it('stops the active request, preserves partial text, and never applies its actions', async () => {
    let signal: AbortSignal | undefined
    transport.stream.mockImplementation(async function* (_message, _context, _mode, abort: AbortSignal) {
      signal = abort
      yield { text: 'Checking your run.\n```action\n{"type":"set_calendar","patch":{"payDay":"Tuesday"}}\n```' }
      await new Promise<void>((resolve) => abort.addEventListener('abort', () => resolve(), { once: true }))
      yield { text: ' This arrived after stopping.' }
      yield { done: true, sessionId: 'do-not-save' }
    })
    updateOnboarding({ chatSessionId: 'saved-session' })
    type('Check my run')
    submit()
    await vi.waitFor(() => expect(elements(render()).some(({ props }) => props.className === 'icon-btn chat-send' && props['aria-label'] === 'Stop reply')).toBe(true))
    await vi.waitFor(() => expect(elements(render()).some(({ props }) => props.message?.text.startsWith('Checking your run.'))).toBe(true))
    expect(button(render(), 'Stop reply').props['data-action']).toBe('stop')
    expect(render().props['data-composer-action']).toBe('stop')
    button(render(), 'Stop reply').props.onClick!()
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(signal?.aborted).toBe(true)
    expect(getOnboarding().chat[1]).toMatchObject({ role: 'agent', text: 'Checking your run.' })
    expect(getOnboarding().chat[1].actions).toBeUndefined()
    expect(getOnboarding().payDay).toBe(DEFAULTS.payDay)
    expect(getOnboarding().chatSessionId).toBe('saved-session')
    expect(button(render(), 'Call your Closeout Agent').props.disabled).toBe(false)
  })

  it('acknowledges attachments without exposing file names or discarding a draft or session', () => {
    updateOnboarding({ chatSessionId: 'saved-session' })
    type('Keep my draft')
    const input = elements(render()).find((element) => element.type === 'input')!
    const target = { value: 'upload', files: [{ name: 'client.csv' }, { name: 'hours.pdf' }] as unknown as FileList }
    input.props.onChange!({ target })
    expect(getOnboarding().chat.at(-1)).toMatchObject({ role: 'user', text: 'Attached 2 documents' })
    expect(textarea(render()).props.value).toBe('Keep my draft')
    expect(getOnboarding().chatSessionId).toBe('saved-session')
    expect(target.value).toBe('')
    expect(transport.stream).not.toHaveBeenCalled()
  })

  it('sends Enter, allowing Shift+Enter and IME composition through', async () => {
    type('Hello')
    const preventDefault = vi.fn()
    const key = { key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault }
    textarea(render()).props.onKeyDown!({ ...key, shiftKey: true })
    textarea(render()).props.onKeyDown!({ ...key, nativeEvent: { isComposing: true } })
    expect(transport.stream).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
    textarea(render()).props.onKeyDown!(key)
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(getOnboarding().chat[0].text).toBe('Hello')
  })

  it('keeps case scoping and Show all tied to the selected case', () => {
    const scopeButton = elements(render('case:12')).find(({ props }) => props.children === 'Show all')!
    scopeButton.props.onClick!()
    expect(router.params.get('chat')).toBe('all')
    expect(router.params.get('chatScope')).toBe('case:12')
  })

  it('says skipped model actions in human words, never raw action names, and retries from the latest reply', () => {
    const message = { id: 'partial', role: 'agent' as const, text: 'Saved the valid answers.', at: 1, skipped: ['set_firm', 'set_profile'] }
    const text = (tree: ReturnType<typeof Message>) => {
      const note = elements(tree).find(({ props }) => props.className === 'chat-skipped')!
      return elements(note).map(({ props }) => props.children).concat(Children.toArray(note.props.children)).filter((part): part is string => typeof part === 'string').join('')
    }
    expect(text(Message({ message }))).toBe("I couldn't save part of that.")
    expect(text(Message({ message }))).not.toMatch(/set_|Skipped/)
    const onAnswer = vi.fn()
    const retry = elements(Message({ message, onAnswer })).find(({ props }) => props.children === 'Tap to retry')!
    retry.props.onClick!()
    expect(onAnswer).toHaveBeenCalledWith('Try saving that again')
    expect(elements(Message({ message })).some(({ props }) => props.children === 'Tap to retry')).toBe(false)
    const reload = Message({ message: { ...message, skipped: ['Action outcome unconfirmed after reload; review the cycle before trying again'] } })
    expect(text(reload)).toBe('Action outcome unconfirmed after reload; review the cycle before trying again')
  })

  it('renders full-width agent text, user bubbles, and Applied action lines', () => {
    const agent = Message({ message: { id: 'a', role: 'agent', text: 'Done', at: 1, actions: [{ type: 'note', text: 'Saved' }] } })
    const user = Message({ message: { id: 'u', role: 'user', text: 'Hello', at: 1 } })
    expect(elements(agent).some(({ props }) => props.className === 'chat-agent-text')).toBe(true)
    expect(elements(agent).some(({ props }) => props.className === 'chat-bubble')).toBe(false)
    expect(elements(agent).some(({ props }) => props.className === 'chat-action')).toBe(true)
    expect(elements(user).some(({ props }) => props.className === 'chat-bubble')).toBe(true)
  })
})

describe('conversation day dividers', () => {
  const today = new Date(2026, 8, 25, 12).getTime()
  const earlier = new Date(2026, 8, 24, 23).getTime()
  it('labels the first message today and each later day once', () => {
    expect(dayDivider(today, undefined, today)).toBe('Today')
    expect(dayDivider(today, today - 1000, today)).toBeNull()
    expect(dayDivider(today, earlier, today)).toBe('Today')
    expect(dayDivider(earlier, undefined, today)).toBe('Sep 24, 2026')
  })
})
