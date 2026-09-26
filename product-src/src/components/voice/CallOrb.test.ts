import type { DependencyList, EffectCallback } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallLevelSource, CallSnapshot } from '@/lib/live'
import { CallOrb } from './CallOrb'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as EffectCallback[], reduced: false }))
const paint = vi.hoisted(() => ({ draw: vi.fn(), preset: vi.fn((state: string) => ({ mode: 'test', speed: 1, opts: { state } })) }))
vi.mock('@/lib/useReducedMotion', () => ({ useReducedMotion: () => hooks.reduced }))
vi.mock('thinking-orbs', () => ({ MODE_DRAWS: { test: paint.draw }, resolvePreset: paint.preset }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: <T>(current: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current }
    return hooks.slots[slot]
  },
  useEffect: (effect: EffectCallback, dependencies: DependencyList) => {
    const slot = hooks.cursor++
    const previous = hooks.slots[slot] as { dependencies: DependencyList; cleanup?: () => void } | undefined
    if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return
    previous?.cleanup?.()
    const entry = { dependencies, cleanup: undefined as (() => void) | undefined }
    hooks.slots[slot] = entry
    hooks.effects.push(() => { entry.cleanup = effect() as (() => void) | undefined })
  },
}))

let frames: Map<number, FrameRequestCallback>
let visibility: Map<string, () => void>
let observers: { callback(): void; disconnect: ReturnType<typeof vi.fn> }[]
let listeners: Set<(level: number) => void>
let levelSource: CallLevelSource
let wrapper: { style: { transform: string } }
let canvas: { offsetWidth: number; width: number; height: number; getContext: ReturnType<typeof vi.fn> }

function render(state: CallSnapshot['orb'] = 'listening', level = 0.5) {
  hooks.cursor = 0
  hooks.effects = []
  const tree = CallOrb({ state, level, levelSource })
  tree.props.ref.current = wrapper
  tree.props.children.props.ref.current = canvas
  hooks.effects.forEach(effect => effect())
  return tree
}

beforeEach(() => {
  vi.clearAllMocks()
  hooks.slots = []
  hooks.reduced = false
  frames = new Map()
  visibility = new Map()
  observers = []
  listeners = new Set()
  wrapper = { style: { transform: '' } }
  canvas = { offsetWidth: 240, width: 0, height: 0, getContext: vi.fn(() => ({ setTransform: vi.fn(), clearRect: vi.fn() })) }
  levelSource = { get: () => 0.5, subscribe: vi.fn(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }) }
  let frameId = 0
  vi.stubGlobal('window', {
    devicePixelRatio: 2,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId }),
    cancelAnimationFrame: vi.fn((id: number) => { frames.delete(id) }),
  })
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (name: string, callback: () => void) => { visibility.set(name, callback) },
    removeEventListener: (name: string) => { visibility.delete(name) },
  })
  vi.stubGlobal('ResizeObserver', class {
    callback: () => void
    disconnect = vi.fn()
    constructor(callback: () => void) { this.callback = callback; observers.push(this) }
    observe() {}
  })
})
afterEach(() => {
  for (const slot of hooks.slots) (slot as { cleanup?: () => void })?.cleanup?.()
  vi.unstubAllGlobals()
})

describe('voice orb reduced motion', () => {
  it.each(['connecting', 'listening', 'composing', 'working'] as const)('keeps %s static without a canvas loop or audio scale subscription', state => {
    hooks.reduced = true
    render(state)
    expect(paint.preset).toHaveBeenLastCalledWith('breathing', 64)
    expect(frames.size).toBe(0)
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    expect(levelSource.subscribe).not.toHaveBeenCalled()
    expect(wrapper.style.transform).toBe('scale(1)')
    expect(paint.draw.mock.calls.every(call => call[2] === 0.6)).toBe(true)
    expect(canvas).toMatchObject({ width: 480, height: 480 })

    canvas.offsetWidth = 200
    observers[0].callback()
    visibility.get('visibilitychange')!()
    render(state, 1)
    expect(frames.size).toBe(0)
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    expect(wrapper.style.transform).toBe('scale(1)')
    expect(canvas).toMatchObject({ width: 400, height: 400 })
    expect(paint.draw.mock.calls.every(call => call[2] === 0.6)).toBe(true)
  })

  it('cancels active animation and unsubscribes audio when the preference changes', () => {
    render()
    expect(frames.size).toBe(1)
    expect(listeners.size).toBe(1)
    listeners.forEach(listener => listener(1))
    expect(wrapper.style.transform).toBe('scale(1.1)')

    hooks.reduced = true
    render()
    expect(frames.size).toBe(0)
    expect(listeners.size).toBe(0)
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(wrapper.style.transform).toBe('scale(1)')
    visibility.get('visibilitychange')!()
    expect(frames.size).toBe(0)

    hooks.reduced = false
    render()
    expect(frames.size).toBe(1)
    expect(listeners.size).toBe(1)
  })
})
