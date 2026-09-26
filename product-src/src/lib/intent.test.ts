import { beforeEach, describe, expect, it, vi } from 'vitest'
const { prefetchGet } = vi.hoisted(() => ({ prefetchGet: vi.fn(async () => {}) }))
vi.mock('@/lib/api', () => ({ prefetchGet }))
vi.mock('@/lib/data', () => ({ getDataSnapshot: () => ({ list: [] }) }))
vi.mock('@/lib/onboarding', () => ({ getOnboarding: vi.fn() }))
vi.mock('@/lib/desk', () => ({ activeCycles: vi.fn() }))
vi.mock('@/lib/rules', () => ({ warmRuleActivity: vi.fn() }))
vi.mock('@/lib/intake', () => ({ cycleIntake: vi.fn() }))
import { intentPaths, prefetchIntent, listenForNavigationIntent } from './intent'
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals() })
describe('intent coverage', () => {
  it('warms cycle detail, threads and entry evidence as well as shared shell data', () => {
    expect(intentPaths('/payroll/s_1?cycle=2026-09-20')).toEqual(['/state', '/data/cycles', '/data/cycles/2026-09-20', '/data/threads?cycleId=2026-09-20', '/data/entries?cycle=2026-09-20&shift=s_1'])
    for (const route of ['/rules', '/profile']) expect(intentPaths(route)).toEqual(['/state', '/data/cycles', '/memory', '/files'])
    expect(intentPaths('/settings')).toEqual(['/state', '/data/cycles'])
  })
  it('skips all speculative data and modules with Save-Data enabled', () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } })
    prefetchIntent('/payroll?cycle=week')
    expect(prefetchGet).not.toHaveBeenCalled()
  })
  it('registers pointerenter, keyboard focus and touchstart in capture and removes them', () => {
    const root = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const stop = listenForNavigationIntent(root as unknown as HTMLElement)
    expect(root.addEventListener.mock.calls.map(([name]) => name)).toEqual(['pointerenter', 'focus', 'touchstart'])
    expect(root.addEventListener.mock.calls.every(([, , opts]) => opts.capture && opts.passive)).toBe(true)
    stop()
    expect(root.removeEventListener).toHaveBeenCalledTimes(3)
  })
})
