import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionScreen, TypedQuestion } from './QuestionScreen'
import { DEFAULTS } from '@/lib/onboarding'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => void | (() => void))[] }))
const state = vi.hoisted(() => ({ value: {} as typeof DEFAULTS }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: <T,>(initial: T | (() => T)) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[slot], (value: T) => { hooks.slots[slot] = value }]
  },
  useRef: <T,>(value: T) => { const slot = hooks.cursor++; if (!(slot in hooks.slots)) hooks.slots[slot] = { current: value }; return hooks.slots[slot] },
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect) },
}))
vi.mock('@/lib/onboarding', async original => ({ ...await original<typeof import('@/lib/onboarding')>(), getOnboarding: () => state.value }))
vi.mock('@/lib/useDictation', () => ({ useDictation: () => ({ active: false, finishing: false, state: 'idle', status: '', error: '' }) }))
type Props = { children?: ReactNode; onSubmit?(event: { preventDefault(): void }): void; onDone?(): void; 'data-typing'?: boolean }
const elements = (tree: ReactNode): ReactElement<Props>[] => Children.toArray(tree).flatMap(node => isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [])

beforeEach(() => {
  hooks.cursor = 0; hooks.slots = []; hooks.effects = []
  state.value = structuredClone(DEFAULTS)
  vi.useFakeTimers()
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), setTimeout, clearTimeout })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('onboarding question progression', () => {
  it('Next serializes the current calendar fields through the existing answer path', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    state.value = { ...state.value, frequency: 'Semi-monthly', payDatesOfMonth: [5, 20], cutoffDays: 3, deadlineDays: 1 }
    const onAnswer = vi.fn()
    const tree = QuestionScreen({ question: 'When is Payroll?', card: { kind: 'question', input: 'calendar', topics: ['calendar'] }, canBack: true, onBack() {}, onAnswer })
    elements(tree).find(node => node.type === 'form')!.props.onSubmit!({ preventDefault() {} })
    expect(onAnswer).toHaveBeenCalledOnce()
    expect(JSON.parse(onAnswer.mock.calls[0][0].replace('Pay calendar: ', ''))).toEqual({
      frequency: 'Semi-monthly', periodEndDay: state.value.periodEndDay, payDay: state.value.payDay,
      payDatesOfMonth: [5, 20], cutoffDays: 3, deadlineDays: 1,
    })
  })

  it.each(['When is Payroll?', 'A longer question '.repeat(16)])('reveals the whole question in about 260ms after the lead-in: %s', text => {
    const onDone = vi.fn()
    TypedQuestion({ text, skip: false, onDone })
    hooks.effects.forEach(effect => effect())
    vi.advanceTimersByTime(59)
    expect(hooks.slots[0]).toBe(0)
    vi.advanceTimersByTime(129)
    expect(hooks.slots[0]).toBeGreaterThan(text.length / 2)
    expect(hooks.slots[0]).toBeLessThan(text.length)
    expect(onDone).not.toHaveBeenCalled()
    vi.advanceTimersByTime(132)
    expect(hooks.slots[0]).toBe(text.length)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it.each([true, false])('makes revisited or reduced-motion text static (revisited: %s)', skip => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: !skip }), setTimeout, clearTimeout })
    const onDone = vi.fn()
    TypedQuestion({ text: 'Ready immediately', skip, onDone })
    hooks.effects.forEach(effect => effect())
    expect(hooks.slots[0]).toBe('Ready immediately'.length)
    expect(onDone).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps inputs hidden until the question completes, then reveals them', () => {
    const props = { question: 'How do hours arrive?', card: { kind: 'question' as const, input: 'chips' as const, topics: ['workerHours' as const], chips: ['Email'] }, canBack: true, onBack() {}, onAnswer() {} }
    const tree = QuestionScreen(props)
    expect(elements(tree).find(node => node.type === 'form')!.props['data-typing']).toBe(true)
    elements(tree).find(node => node.type === TypedQuestion)!.props.onDone!()
    hooks.cursor = 0
    expect(elements(QuestionScreen(props)).find(node => node.type === 'form')!.props['data-typing']).toBeUndefined()
  })
})
