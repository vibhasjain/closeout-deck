import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTweened } from './useTweened'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], reduced: false }))
vi.mock('./useReducedMotion', () => ({ useReducedMotion: () => hooks.reduced }))
vi.mock('react', () => ({
  useState(initial: unknown) {
    const i = hooks.cursor++
    if (!(i in hooks.slots)) hooks.slots[i] = initial
    return [hooks.slots[i], (value: unknown) => { hooks.slots[i] = value }]
  },
  useRef(initial: unknown) {
    const i = hooks.cursor++
    if (!(i in hooks.slots)) hooks.slots[i] = { current: initial }
    return hooks.slots[i]
  },
  useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
    const i = hooks.cursor++
    const previous = hooks.slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined
    if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
      previous?.cleanup?.()
      hooks.slots[i] = { deps, cleanup: effect() }
    }
  },
}))
let now = 0, serial = 0
const frames = new Map<number, FrameRequestCallback>()
function render(target: number) {
  hooks.cursor = 0
  // eslint-disable-next-line react-hooks/rules-of-hooks -- The test dispatcher above preserves hook slots.
  return useTweened(target, 400)
}
function advance(ms: number) {
  now += ms
  const current = [...frames]
  frames.clear()
  current.forEach(([, callback]) => callback(now))
}
beforeEach(() => {
  hooks.slots = []; hooks.reduced = false; now = 0; frames.clear()
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => vi.unstubAllGlobals())

describe('changing counts', () => {
  it('starts at actual data and finishes exactly on the next count', () => {
    expect(render(100)).toBe(100)
    render(200); advance(200)
    expect(render(200)).toBe(187.5)
    advance(200)
    expect(render(200)).toBe(200)
    expect(frames.size).toBe(0)
  })
  it('retargets from the visible count without jumping back', () => {
    render(0); render(100); advance(200)
    const current = render(100)
    expect(render(50)).toBe(current)
    advance(400)
    expect(render(50)).toBe(50)
  })
  it('immediately renders true counts and schedules no motion under reduced motion', () => {
    hooks.reduced = true
    expect(render(12)).toBe(12)
    expect(render(42)).toBe(42)
    expect(frames.size).toBe(0)
  })
  it('cancels an in-flight tween when reduced motion is enabled', () => {
    render(0); render(100); advance(100)
    hooks.reduced = true
    expect(render(100)).toBe(100)
    expect(frames.size).toBe(0)
    hooks.reduced = false
    expect(render(100)).toBe(100)
  })
})
