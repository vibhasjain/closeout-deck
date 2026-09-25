import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startScan, type ScanState } from './scan'

function setup(reducedMotion = false) {
  let bounds = { width: 358, height: 201 }
  let resize: () => void = () => {}
  let visibility: (entries: { isIntersecting: boolean }[]) => void = () => {}
  let preference: () => void = () => {}
  let serial = 0
  const frames = new Map<number, FrameRequestCallback>()
  const style = vi.fn()
  const context = { clearRect: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), beginPath: vi.fn(), fill: vi.fn(), setTransform: vi.fn(), set fillStyle(value: string) { style(value) } }
  const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: vi.fn(() => bounds) }
  const chip = { textContent: '', style: { opacity: '', transform: '', filter: '' } }
  const state: ScanState = { complete: false, paused: false, matched: 412, kept: 12, labels: ['Matched 412 workers', 'Meal Break · 95'], onFinished: vi.fn() }
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
  const cleanup = startScan(canvas as unknown as HTMLCanvasElement, chip as unknown as HTMLDivElement, () => state)
  return {
    canvas, context, chip, state, style, frames, window, motion, sizeObserver, visibilityObserver, cleanup,
    refresh: cleanup.refresh,
    resize: (width: number, height: number, dpr: number) => { bounds = { width, height }; window.devicePixelRatio = dpr; resize() },
    visibility: (isIntersecting: boolean) => visibility([{ isIntersecting }]),
    preference: (matches: boolean) => { motion.matches = matches; preference() },
    nextFrame: (time: number) => { const [id, callback] = [...frames][0]; frames.delete(id); callback(time) },
  }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('closeout scan canvas', () => {
  it('matches J&J circular geometry and caps devicePixelRatio at two', () => {
    const scan = setup()
    expect(scan.canvas).toMatchObject({ width: 716, height: 402 })
    expect(scan.context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
    expect(scan.context.clearRect).toHaveBeenLastCalledWith(0, 0, 358, 201)
    scan.resize(294, 201, 3)
    expect(scan.canvas).toMatchObject({ width: 588, height: 402 })
    expect(scan.context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
    expect(scan.context.clearRect).toHaveBeenLastCalledWith(0, 0, 294, 201)
    expect(scan.context.arc).toHaveBeenCalled()
    for (const [, , radius, from, to] of scan.context.arc.mock.calls) {
      expect(radius).toBeGreaterThanOrEqual(1)
      expect(from).toBe(0)
      expect(to).toBe(Math.PI * 2)
    }
    expect(scan.frames.size).toBe(1)
    scan.cleanup()
  })

  it('batches eight ink tints per frame and never reads layout in its animation loop', () => {
    const scan = setup()
    const colors = scan.style.mock.calls.map(([color]) => color)
    expect(new Set(colors).size).toBe(8)
    expect(colors.every(color => color.startsWith('rgba(16,15,15,'))).toBe(true)
    const measurements = scan.canvas.getBoundingClientRect.mock.calls.length
    scan.style.mockClear()
    scan.nextFrame(1000)
    expect(scan.style.mock.calls.map(([color]) => color)).toEqual(colors)
    expect(scan.canvas.getBoundingClientRect).toHaveBeenCalledTimes(measurements)
    scan.cleanup()
  })

  it('stops offscreen, resumes on return and cleans up observers', () => {
    const scan = setup()
    scan.visibility(false)
    const draws = scan.context.clearRect.mock.calls.length
    expect(scan.frames.size).toBe(0)
    scan.preference(false)
    scan.resize(294, 201, 2)
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

  it('updates field density when actual counts arrive without waiting for a viewport resize', () => {
    const scan = setup(true)
    const dense = scan.context.arc.mock.calls.length
    scan.context.arc.mockClear()
    scan.state.matched = 1
    scan.refresh()
    expect(scan.context.arc.mock.calls.length).toBeLessThan(dense)
    expect(scan.frames.size).toBe(0)
    scan.cleanup()
  })

  it('keeps reduced-motion still, displays true counts, and hands off immediately when the server completes', () => {
    const scan = setup(true)
    expect(scan.context.clearRect).toHaveBeenCalledOnce()
    expect(scan.frames.size).toBe(0)
    expect(scan.chip.textContent).toBe('Matched 412 workers')
    expect(scan.chip.style.opacity).toBe('1')
    scan.preference(false)
    expect(scan.frames.size).toBe(1)
    scan.preference(true)
    expect(scan.frames.size).toBe(0)
    scan.state.complete = true
    scan.refresh()
    expect(scan.state.onFinished).toHaveBeenCalledOnce()
    expect(scan.frames.size).toBe(0)
    scan.cleanup()
  })

  it('never completes from elapsed time, then gathers kept dots and fades only after a real completion', () => {
    const scan = setup()
    for (let n = 1; n <= 150; n++) scan.nextFrame(performance.now() + n * 50)
    expect(scan.state.onFinished).not.toHaveBeenCalled()
    scan.state.complete = true
    for (let n = 151; n <= 240 && scan.frames.size; n++) scan.nextFrame(performance.now() + n * 50)
    expect(scan.state.onFinished).toHaveBeenCalledOnce()
    expect(scan.frames.size).toBe(0)
    scan.cleanup()
  })
})
