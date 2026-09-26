import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '@/pages/setup/Agent'
import { QuestionScreen } from './QuestionScreen'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import type { CallSnapshot } from '@/lib/live'
import { CallScreen } from '@/components/voice/CallScreen'
import { Message } from '@/components/chat/Message'
import { ActionFeedback } from '@/components/ActionButton'
import type { PendingAction } from '@/lib/usePendingAction'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const store = vi.hoisted(() => ({ state: null as Onboarding | null }))
const flow = vi.hoisted(() => ({ readFirm: vi.fn(), requestOnboarding: vi.fn(), applyOnboardReply: vi.fn(), finishOnboarding: vi.fn(), rollbackOnboardingAnswer: vi.fn() }))
const navigate = vi.hoisted(() => vi.fn())
const voice = vi.hoisted(() => ({ snapshot: null as CallSnapshot | null, start: vi.fn(), end: vi.fn(), dismiss: vi.fn(), retrySave: vi.fn(), retryTurn: vi.fn(), mute: vi.fn() }))
vi.mock('@/lib/useVoiceCall', () => ({ useVoiceCall: () => voice }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: <T,>(initial: T | (() => T)) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[slot], (value: T | ((current: T) => T)) => { hooks.slots[slot] = typeof value === 'function' ? (value as (current: T) => T)(hooks.slots[slot] as T) : value }]
  },
  useRef: <T,>(value: T) => { const slot = hooks.cursor++; if (!(slot in hooks.slots)) hooks.slots[slot] = { current: value }; return hooks.slots[slot] },
  useCallback: <T,>(callback: T) => callback,
  useEffect: () => {},
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate, useSearchParams: () => [new URLSearchParams(), vi.fn()] }))
vi.mock('@/lib/onboarding', async (original) => ({
  ...await original<typeof import('@/lib/onboarding')>(),
  getOnboarding: () => store.state!,
  useOnboarding: () => [store.state!],
  updateOnboarding: (patch: Partial<Onboarding>) => { store.state = { ...store.state!, ...patch } },
  flushOnboarding: vi.fn(async () => {}),
}))
vi.mock('@/lib/onboardingFlow', () => flow)
vi.mock('@/lib/viewerSession', () => ({ viewerSession: () => ({ name: 'Morgan Lee' }) }))

type Props = { children?: ReactNode; footer?: ReactNode; className?: string; 'aria-label'?: string; action?: PendingAction; actionKey?: string; onClick?(): void; onChange?(event: { target: { value: string } }): void; onSubmit?(event: { preventDefault(): void }): void; question?: string; onBack?(): void; onForward?(): void; onAnswer?(answer: string): void; onKeepTyping?(): void; onRetry?(): void; message?: Onboarding['chat'][number] }
const elements = (tree: ReactNode): ReactElement<Props>[] => Children.toArray(tree).flatMap((node) => isValidElement<Props>(node) ? node.type === ActionFeedback ? elements(ActionFeedback({ action: node.props.action! })) : [node, ...elements(node.props.children), ...elements(node.props.footer)] : [])
const render = () => { hooks.cursor = 0; return Agent() }
const text = (tree: ReactNode, label: string) => elements(tree).find(({ props }) => props.children === label)!
const question = () => elements(render()).find((node) => node.type === QuestionScreen)!
function chooseFirm() {
  text(render(), "Your firm's website").props.onClick!()
  elements(render()).find(({ props }) => props['aria-label'] === "Your firm's website")!.props.onChange!({ target: { value: 'blocked.example.com' } })
  elements(render()).find((node) => node.type === 'form')!.props.onSubmit!({ preventDefault() {} })
}

beforeEach(() => {
  hooks.slots = []
  store.state = structuredClone(DEFAULTS)
  vi.clearAllMocks()
  voice.snapshot = null
  voice.dismiss.mockImplementation(() => { voice.snapshot = null })
  voice.retrySave.mockResolvedValue(undefined)
  voice.start.mockResolvedValue(undefined)
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }), requestAnimationFrame: (callback: () => void) => callback() })
  vi.stubGlobal('document', { activeElement: null })
  flow.requestOnboarding.mockResolvedValue({})
  flow.finishOnboarding.mockResolvedValue(undefined)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('onboarding navigation', () => {
  it('leaves the call view immediately on Keep typing and sends the typing continuation independently', () => {
    store.state!.setupStep = 'conversation'
    store.state!.setupHistory = [{ question: 'How do worker hours arrive?', card: { kind: 'question', input: 'text', topics: ['workerHours'] } }]
    store.state!.chat = [{ id: 'call-pending', role: 'agent', text: '', at: 1, cards: [{ kind: 'call', callId: 'pending', seconds: 8 }], callSaveError: 'Saving failed. Please try again.' }]
    voice.snapshot = { status: 'ending', errorKind: 'save', orb: 'listening', stream: null, remoteStream: null, muted: false, seconds: 8, caption: '', transcript: [], level: 0 }
    elements(render()).find(element => element.type === CallScreen)!.props.onKeepTyping!()
    expect(voice.dismiss).toHaveBeenCalledOnce()
    expect(elements(render()).some(element => element.type === CallScreen)).toBe(false)
    expect(elements(render()).find(element => element.type === Message)?.props.message?.callSaveError).toBe('Saving failed. Please try again.')
    expect(question().props.question).toBe('How do worker hours arrive?')
    expect(flow.requestOnboarding).toHaveBeenCalledWith(expect.stringContaining('Continue our conversation by typing'), expect.any(AbortSignal))
  })
  it('routes Retry saving to saving and Retry the call to a new call', () => {
    voice.snapshot = { status: 'error', errorKind: 'save', orb: 'listening', stream: null, remoteStream: null, muted: false, seconds: 8, caption: '', transcript: [], level: 0 }
    elements(render()).find(element => element.type === CallScreen)!.props.onRetry!()
    expect(voice.retrySave).toHaveBeenCalledOnce()
    expect(voice.start).not.toHaveBeenCalled()
    voice.snapshot.errorKind = 'call'
    elements(render()).find(element => element.type === CallScreen)!.props.onRetry!()
    expect(voice.start).toHaveBeenCalledOnce()
  })
  it('opens consent immediately and keeps the domain fallback after a failed background pre-read', async () => {
    store.state!.setupStep = 'basics'
    let reject: (reason: Error) => void = () => {}
    flow.readFirm.mockReturnValue(new Promise((_resolve, no) => { reject = no }))
    chooseFirm()
    expect(store.state).toMatchObject({ setupStep: 'trust', firm: { name: 'blocked.example.com', domain: 'blocked.example.com', states: [] } })
    text(render(), 'I agree').props.onClick!()
    expect(store.state!.setupStep).toBe('intro')
    reject(new Error('HTTP 403'))
    await Promise.resolve(); await Promise.resolve()
    expect(store.state!.firm!.states).toEqual([])
    expect(store.state!.setupStep).toBe('intro')
  })
  it('preserves answers supplied while the optional pre-read is still running', async () => {
    store.state!.setupStep = 'basics'
    let resolve: (value: Onboarding['firm']) => void = () => {}
    flow.readFirm.mockReturnValue(new Promise((yes) => { resolve = yes }))
    chooseFirm()
    store.state!.firm = { ...store.state!.firm!, states: ['PR'] }
    resolve({ ...store.state!.firm!, states: ['FL'], summary: 'Homepage summary' })
    await Promise.resolve()
    expect(store.state!.firm).toMatchObject({ states: ['PR'], summary: 'Homepage summary' })
  })
  it('can go Back then Forward or Next unchanged without re-asking or truncating history', () => {
    store.state!.setupStep = 'conversation'
    store.state!.setupHistory = [
      { question: 'How do worker hours arrive?', card: { kind: 'question', input: 'text', topics: ['workerHours'] }, answer: 'Email' },
      { question: 'Who approves the hours?', card: { kind: 'question', input: 'text', topics: ['clientHours'] } },
    ]
    question().props.onBack!()
    expect(question().props.question).toBe('How do worker hours arrive?')
    question().props.onForward!()
    expect(question().props.question).toBe('Who approves the hours?')
    question().props.onBack!()
    question().props.onAnswer!('Email')
    expect(question().props.question).toBe('Who approves the hours?')
    expect(store.state!.setupHistory).toHaveLength(2)
    expect(flow.requestOnboarding).not.toHaveBeenCalled()
  })
  it('rolls back superseded effects only when a previous answer changes', async () => {
    store.state!.setupStep = 'conversation'
    store.state!.setupHistory = [
      { question: 'How do hours arrive?', card: { kind: 'question', input: 'text', topics: ['workerHours'] }, answer: 'Email' },
      { question: 'Who approves?', card: { kind: 'question', input: 'text', topics: ['clientHours'] } },
    ]
    question().props.onBack!()
    question().props.onAnswer!('Our app')
    expect(flow.rollbackOnboardingAnswer).toHaveBeenCalledWith(0)
    expect(flow.requestOnboarding).toHaveBeenCalledWith(expect.stringContaining('Our app'), expect.any(AbortSignal))
    await Promise.resolve()
  })
  it('keeps the question and Back/Skip controls available after a request error', async () => {
    store.state!.setupStep = 'conversation'
    store.state!.setupHistory = [{ question: 'How do hours arrive?', card: { kind: 'question', input: 'text', topics: ['workerHours'] } }]
    flow.requestOnboarding.mockRejectedValue(new Error('Please try once more.'))
    question().props.onAnswer!('Email')
    await Promise.resolve(); await Promise.resolve()
    expect(question().props.question).toBe('How do hours arrive?')
    expect(text(render(), 'Retry')).toBeDefined()
    expect(question().props.onBack).toBeTypeOf('function')
    expect(question().props.onAnswer).toBeTypeOf('function')
  })
  it('waits for the real finish turn and opens the agent sheet after Finish', async () => {
    vi.useFakeTimers()
    store.state!.setupStep = 'never-contact'
    let resolve = () => {}
    flow.finishOnboarding.mockReturnValue(new Promise<void>((yes) => { resolve = yes }))
    text(render(), 'Save and continue').props.onClick!()
    expect(text(render(), 'Save and continue').props.action).toMatchObject({ status: 'pending', key: 'save', pending: true })
    expect(navigate).not.toHaveBeenCalled()
    // Persistence can move the store to ready before the request resolves; the dialog still owns the next step.
    store.state!.setupStep = 'ready'
    expect(text(render(), 'Save and continue').props.action?.pending).toBe(true)
    expect(text(render(), 'Finish →').props.className).not.toContain('primary')
    resolve()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(text(render(), 'Save and continue').props.action?.status).toBe('success')
    await vi.advanceTimersByTimeAsync(899)
    expect(navigate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(navigate).toHaveBeenCalledWith('/payroll?agent=1')
  })
  it('retries the original Skip choice inline without replacing it with the current contact draft', async () => {
    vi.useFakeTimers()
    store.state!.setupStep = 'never-contact'
    store.state!.neverContact = ['Original contact']
    flow.finishOnboarding.mockRejectedValueOnce(new Error('Connection interrupted'))
    text(render(), 'Skip for now').props.onClick!()
    expect(text(render(), 'Skip for now').props.action).toMatchObject({ pending: true, key: 'skip' })
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(text(render(), 'Skip for now').props.action?.error).toBe('Connection interrupted')
    expect(navigate).not.toHaveBeenCalled()
    store.state!.neverContact = ['A later change']
    text(render(), 'Retry').props.onClick!()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(flow.finishOnboarding).toHaveBeenLastCalledWith(['Original contact'])
    expect(text(render(), 'Skip for now').props.action?.status).toBe('success')
    await vi.advanceTimersByTimeAsync(900)
    expect(navigate).toHaveBeenCalledWith('/payroll?agent=1')
  })
})
