import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaintBoundary } from '@/components/shell/PaintBoundary'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], server: false }))
vi.mock('react', () => ({
  useState(initial: unknown) {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = initial
    return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = value }]
  },
  useSyncExternalStore: () => hooks.server,
  useEffect(effect: () => (() => void), dependencies: unknown[]) {
    const index = hooks.cursor++
    const previous = hooks.slots[index] as { dependencies: unknown[]; cleanup(): void } | undefined
    if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
      previous?.cleanup()
      hooks.slots[index] = { dependencies, cleanup: effect() }
    }
  },
}))
const frames = new Map<number, FrameRequestCallback>()
let serial = 0
const render = (routeKey: string) => { hooks.cursor = 0; return PaintBoundary({ routeKey, fallback: 'ghost frame', children: 'cached cycle content' }) }
function paint() {
  const current = [...frames.values()]
  frames.clear()
  current.forEach(callback => callback(0))
}
beforeEach(() => {
  hooks.slots = []; hooks.server = false; frames.clear()
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('page frame before dense content', () => {
  it('renders prefetched content in the first render without scheduling a skeleton frame', () => {
    hooks.cursor = 0
    expect(PaintBoundary({ routeKey: 'warm', fallback: 'ghost', children: 'real data', ready: true })).toBe('real data')
    expect(frames.size).toBe(0)
  })
  it('paints the header and skeleton before starting dense work in a later task', () => {
    expect(render('payroll:review')).toBe('ghost frame')
    paint()
    expect(render('payroll:review')).toBe('ghost frame')
    paint()
    expect(render('payroll:review')).toBe('ghost frame')
    vi.runAllTimers()
    expect(render('payroll:review')).toBe('cached cycle content')
    expect(frames.size).toBe(0)
  })

  it('cancels obsolete navigation work and preserves an unchanged view', () => {
    render('payroll:review'); paint(); paint()
    expect(render('payroll:collect')).toBe('ghost frame')
    vi.runAllTimers()
    expect(render('payroll:collect')).toBe('ghost frame')
    paint(); paint(); vi.runAllTimers()
    expect(render('payroll:collect')).toBe('cached cycle content')
    expect(render('payroll:collect')).toBe('cached cycle content')
    expect(frames.size).toBe(0)
  })

  it('provides full content to server rendering without waiting for browser frames', () => {
    hooks.server = true
    expect(render('rules')).toBe('cached cycle content')
  })
})
