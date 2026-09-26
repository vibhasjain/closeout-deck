import { Children, isValidElement, type EffectCallback, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamText } from '@/components/beautiful/stream-text'
import { AgentAvatar } from './AgentAvatar'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as EffectCallback[], reduced: false }))
vi.mock('@/lib/useReducedMotion', () => ({ useReducedMotion: () => hooks.reduced }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: T) => { hooks.slots[slot] = value }]
  },
  useRef: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect: (effect: EffectCallback, dependencies: unknown[]) => {
    const slot = hooks.cursor++
    const previous = hooks.slots[slot] as { dependencies: unknown[]; cleanup?: () => void } | undefined
    if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return
    previous?.cleanup?.()
    const entry = { dependencies, cleanup: undefined as (() => void) | undefined }
    hooks.slots[slot] = entry
    hooks.effects.push(() => { entry.cleanup = effect() as (() => void) | undefined })
  },
}))

function render<T>(component: () => T): T {
  hooks.cursor = 0
  hooks.effects = []
  const tree = component()
  hooks.effects.forEach(effect => effect())
  return tree
}
function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join('')
}

beforeEach(() => {
  hooks.slots = []
  hooks.reduced = false
  vi.useFakeTimers()
  vi.stubGlobal('window', { setInterval, clearInterval })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('live chat text', () => {
  it('preserves revealed text when the next real stream chunk arrives', () => {
    const show = (value: string) => render(() => StreamText({ text: value, charsPerTick: 2, tickMs: 10 }))
    show('Reviewing your Payroll')
    vi.advanceTimersByTime(20)
    expect(text(show('Reviewing your Payroll'))).toBe('Revi')
    expect(text(show('Reviewing your Payroll and checking the entries'))).toBe('Revi')
    vi.advanceTimersByTime(10)
    expect(text(show('Reviewing your Payroll and checking the entries'))).toBe('Review')
    vi.advanceTimersByTime(500)
    expect(text(show('Reviewing your Payroll and checking the entries'))).toBe('Reviewing your Payroll and checking the entries')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows all incoming text immediately with no timer or caret under reduced motion', () => {
    hooks.reduced = true
    const tree = render(() => StreamText({ text: 'Your Payroll is ready.' }))
    expect(text(tree)).toBe('Your Payroll is ready.')
    expect(tree.props['data-streaming']).toBe(false)
    expect(Children.toArray(tree.props.children).some(child => isValidElement<{ className?: string }>(child) && child.props.className?.includes('stream-caret'))).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an active reveal when reduced motion is enabled', () => {
    render(() => StreamText({ text: 'Reading the client handbook.' }))
    expect(vi.getTimerCount()).toBe(1)
    hooks.reduced = true
    expect(text(render(() => StreamText({ text: 'Reading the client handbook.' })))).toBe('Reading the client handbook.')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('agent avatar intelligence states', () => {
  it('keeps idle static indefinitely without timers or random modes', () => {
    const random = vi.spyOn(Math, 'random')
    expect(render(() => AgentAvatar({})).props).toMatchObject({ state: 'breathing', paused: true })
    vi.advanceTimersByTime(60_000)
    expect(render(() => AgentAvatar({})).props).toMatchObject({ state: 'breathing', paused: true })
    expect(vi.getTimerCount()).toBe(0)
    expect(random).not.toHaveBeenCalled()
  })

  it.each([['thinking', 'composing'], ['listening', 'listening'], ['processing', 'working']] as const)('maps %s consistently', (activity, mode) => {
    expect(render(() => AgentAvatar({ state: activity })).props).toMatchObject({ state: mode, paused: false })
    hooks.reduced = true
    expect(render(() => AgentAvatar({ state: activity })).props).toMatchObject({ state: 'breathing', paused: true, theme: 'light' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
