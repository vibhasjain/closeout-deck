import type { EffectCallback } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DotMatrix } from './DotMatrix'

const hooks = vi.hoisted(() => ({ element: null as unknown, effect: null as EffectCallback | null }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: () => ({ current: hooks.element }),
  useEffect: (effect: EffectCallback) => { hooks.effect = effect },
}))

function setup(reducedMotion = false) {
  let bounds = { width: 358, height: 88 }
  let resize: () => void = () => {}
  let visibility: (entries: { isIntersecting: boolean }[]) => void = () => {}
  let preference: () => void = () => {}
  let serial = 0
  const frames = new Map<number, FrameRequestCallback>()
  const style = vi.fn()
  const context = { clearRect: vi.fn(), fillRect: vi.fn(), setTransform: vi.fn(), set fillStyle(value: string) { style(value) } }
  const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: vi.fn(() => bounds) }
  const sizeObserver = { observe: vi.fn(), disconnect: vi.fn() }
  const visibilityObserver = { observe: vi.fn(), disconnect: vi.fn() }
  const motion = { matches: reducedMotion, addEventListener: vi.fn((_event: string, callback: () => void) => { preference = callback }), removeEventListener: vi.fn() }
  const window = { devicePixelRatio: 2, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('window', window)
  vi.stubGlobal('matchMedia', vi.fn(() => motion))
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((frame: number) => { frames.delete(frame) }))
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback; return sizeObserver } })
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: typeof visibility) { visibility = callback; return visibilityObserver } })
  hooks.element = canvas
  DotMatrix()
  const cleanup = hooks.effect!()
  return {
    canvas, context, style, frames, window, motion, sizeObserver, visibilityObserver,
    resize: (width: number, height: number, dpr: number) => { bounds = { width, height }; window.devicePixelRatio = dpr; resize() },
    visibility: (isIntersecting: boolean) => visibility([{ isIntersecting }]),
    preference: (matches: boolean) => { motion.matches = matches; preference() },
    nextFrame: (time: number) => { const [id, callback] = [...frames][0]; frames.delete(id); callback(time) },
    cleanup: () => { if (typeof cleanup === 'function') cleanup() },
  }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('closeout scan canvas', () => {
  it('matches its measured dimensions at devicePixelRatio and keeps square dots at different widths', () => {
    const scan = setup()
    expect(scan.canvas).toMatchObject({ width: 716, height: 176 })
    expect(scan.context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
    expect(scan.context.clearRect).toHaveBeenLastCalledWith(0, 0, 358, 88)
    scan.resize(294, 88, 3)
    expect(scan.canvas).toMatchObject({ width: 882, height: 264 })
    expect(scan.context.setTransform).toHaveBeenLastCalledWith(3, 0, 0, 3, 0, 0)
    expect(scan.context.clearRect).toHaveBeenLastCalledWith(0, 0, 294, 88)
    for (const [x, y, width, height] of scan.context.fillRect.mock.calls) {
      expect(width).toBe(height)
      expect(x + width).toBeLessThanOrEqual(358)
      expect(y + height).toBeLessThanOrEqual(88)
    }
    expect(scan.frames.size).toBe(1)
    scan.cleanup()
  })

  it('uses only eight precomputed fill styles per frame and does not measure layout in a frame', () => {
    const scan = setup()
    const colors = scan.style.mock.calls.map(([color]) => color)
    expect(new Set(colors).size).toBe(8)
    const measurements = scan.canvas.getBoundingClientRect.mock.calls.length
    scan.style.mockClear()
    scan.nextFrame(1000)
    expect(scan.style.mock.calls.map(([color]) => color)).toEqual(colors)
    expect(scan.canvas.getBoundingClientRect).toHaveBeenCalledTimes(measurements)
    scan.cleanup()
  })

  it('stops drawing and scheduling offscreen, resumes on return and cleans up observers', () => {
    const scan = setup()
    scan.visibility(false)
    const draws = scan.context.clearRect.mock.calls.length
    expect(scan.frames.size).toBe(0)
    scan.preference(false)
    scan.resize(294, 88, 2)
    expect(scan.context.clearRect).toHaveBeenCalledTimes(draws)
    expect(scan.frames.size).toBe(0)
    scan.visibility(true)
    expect(scan.context.clearRect).toHaveBeenCalledTimes(draws + 1)
    expect(scan.frames.size).toBe(1)
    scan.cleanup()
    expect(scan.frames.size).toBe(0)
    expect(scan.sizeObserver.disconnect).toHaveBeenCalledOnce()
    expect(scan.visibilityObserver.disconnect).toHaveBeenCalledOnce()
    expect(scan.motion.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(scan.window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('renders a static reduced-motion frame and responds to changed preferences', () => {
    const scan = setup(true)
    expect(scan.context.clearRect).toHaveBeenCalledOnce()
    expect(scan.frames.size).toBe(0)
    scan.preference(false)
    expect(scan.frames.size).toBe(1)
    scan.preference(true)
    expect(scan.frames.size).toBe(0)
    scan.cleanup()
  })
})
