import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ChatPane } from './ChatPane'
import { Message } from './Message'
import { dayDivider } from './dayDivider'
import { DEFAULTS, getOnboarding, updateOnboarding, type Onboarding } from '@/lib/onboarding'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const router = vi.hoisted(() => ({ params: new URLSearchParams(), setParams: vi.fn(), navigate: vi.fn() }))
const transport = vi.hoisted(() => ({ stream: vi.fn() }))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useContext: (context: { _currentValue: unknown }) => context._currentValue,
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
  useEffect: () => {},
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

type Props = {
  children?: ReactNode
  message?: { text: string }
  className?: string
  disabled?: boolean
  value?: string
  placeholder?: string
  'aria-label'?: string
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
function render(scope?: string) { hooks.cursor = 0; return ChatPane({ scope }) }
function type(value: string) { textarea(render()).props.onChange!({ target: { value } }) }
function submit() { composer(render()).props.onSubmit!({ preventDefault() {} }) }

beforeEach(() => {
  hooks.slots = []
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('window', { setTimeout, clearTimeout })
  updateOnboarding(structuredClone(DEFAULTS))
  router.params = new URLSearchParams()
  router.setParams.mockImplementation((next: (previous: URLSearchParams) => URLSearchParams) => { router.params = next(router.params) })
  transport.stream.mockImplementation(async function* () { yield { text: 'Ready.' }; yield { done: true } })
})
afterEach(() => vi.unstubAllGlobals())

describe('permanent Closeout Agent conversation', () => {
  it('has an empty-state orb, exact placeholder, one disabled trailing action, and no Clear control', () => {
    const tree = render()
    expect(textarea(tree).props.placeholder).toBe('Ask the Closeout Agent anything…')
    expect(button(tree, 'Send message').props.disabled).toBe(true)
    expect(elements(tree).filter(({ props }) => props.className === 'icon-btn chat-send')).toHaveLength(1)
    expect(elements(tree).some(({ props }) => props.className === 'chat-empty')).toBe(true)
    expect(elements(tree).some(({ props }) => /clear/i.test(props['aria-label'] ?? ''))).toBe(false)
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
    button(render(), 'Stop reply').props.onClick!()
    await vi.waitFor(() => expect(getOnboarding().chat).toHaveLength(2))
    expect(signal?.aborted).toBe(true)
    expect(getOnboarding().chat[1]).toMatchObject({ role: 'agent', text: 'Checking your run.' })
    expect(getOnboarding().chat[1].actions).toBeUndefined()
    expect(getOnboarding().payDay).toBe(DEFAULTS.payDay)
    expect(getOnboarding().chatSessionId).toBe('saved-session')
    expect(button(render(), 'Send message').props.disabled).toBe(true)
  })

  it('posts selected file names without discarding a draft or session', () => {
    updateOnboarding({ chatSessionId: 'saved-session' })
    type('Keep my draft')
    const input = elements(render()).find((element) => element.type === 'input')!
    const target = { value: 'upload', files: [{ name: 'client.csv' }, { name: 'hours.pdf' }] as unknown as FileList }
    input.props.onChange!({ target })
    expect(getOnboarding().chat.at(-1)).toMatchObject({ role: 'user', text: 'Attached client.csv, hours.pdf' })
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
