import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoApproveOffer } from './AutoApproveOffer'
import { RULES } from '@/bench/engine.js'
import { createInstinct, MemoryError, type Instinct } from '@/lib/memory'
import { flushOnboarding, getOnboarding, updateOnboarding } from '@/lib/onboarding'
import { memoryRuleLabel } from './memoryDisplay'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], instincts: [] as Instinct[], loaded: true, declined: [] as string[] }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T>(initial: T) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = initial
    return [hooks.slots[index], (value: T) => { hooks.slots[index] = value }]
  },
  useEffect: (effect: () => unknown) => { effect() },
}))
vi.mock('@/lib/onboarding', () => ({
  getOnboarding: () => ({ declinedAutoApproveRules: hooks.declined }),
  useOnboarding: () => [{ declinedAutoApproveRules: hooks.declined }],
  updateOnboarding: vi.fn((patch: { declinedAutoApproveRules: string[] }) => { hooks.declined = patch.declinedAutoApproveRules }),
  flushOnboarding: vi.fn(async () => {}),
}))
vi.mock('@/lib/memory', async original => ({
  ...await original<typeof import('@/lib/memory')>(),
  createInstinct: vi.fn(),
  useMemory: () => ({ snapshot: { instincts: hooks.instincts, proposals: [], lastRun: null }, loaded: hooks.loaded }),
}))
type Props = { children?: ReactNode; onClick?: () => void }
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const rule = RULES[0]
const label = memoryRuleLabel(rule.id)
const close = vi.fn(), accept = vi.fn()
const render = () => { hooks.cursor = 0; return AutoApproveOffer({ ruleId: rule.id, count: 2, onAccept: accept, onDismiss: close }) }
const click = async () => {
  elements(render()).find(({ props }) => props.children === 'Not now')!.props.onClick!()
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
beforeEach(() => {
  hooks.slots = []; hooks.instincts = []; hooks.loaded = true; hooks.declined = []
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() })
  vi.mocked(createInstinct).mockResolvedValue({ id: 'instinct', kind: 'autonomy', source: 'user', text: `Approves ${label} by hand`, status: 'active', until: null, ruleId: rule.id, at: '2026-09-25T12:00:00Z' })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('existing automatic-approval offer', () => {
  it('records Not now as active autonomy and remembers that the offer was declined after reload or Forget', async () => {
    await click()
    expect(createInstinct).toHaveBeenCalledWith({ kind: 'autonomy', text: `Approves ${label} by hand`, source: 'user', status: 'active', ruleId: rule.id })
    expect(close).toHaveBeenCalledOnce()
    expect(updateOnboarding).toHaveBeenCalledWith({ declinedAutoApproveRules: [rule.id] })
    expect(flushOnboarding).toHaveBeenCalledOnce()
    expect(getOnboarding().declinedAutoApproveRules).toEqual([rule.id])
    hooks.slots = []
    expect(render()).toBeNull()
  })
  it('suppresses an offer already captured by the server and waits for initial memory to load', () => {
    hooks.loaded = false
    expect(render()).toBeNull()
    hooks.loaded = true
    hooks.instincts = [{ id: 'instinct', kind: 'autonomy', source: 'user', text: `Approves ${label} by hand`, status: 'active', until: null, ruleId: rule.id, at: '2026-09-25T12:00:00Z' }]
    expect(render()).toBeNull()
  })
  it('retains the offer and reports a failed save, but dismisses a known tombstone', async () => {
    vi.mocked(createInstinct).mockRejectedValueOnce(new Error('Connection interrupted'))
    await click()
    expect(close).not.toHaveBeenCalled()
    expect(elements(render()).some(({ props }) => props.children === 'Connection interrupted')).toBe(true)
    vi.mocked(createInstinct).mockRejectedValueOnce(new MemoryError(409, 'tombstone'))
    await click()
    expect(close).toHaveBeenCalledOnce()
    expect(render()).toBeNull()
  })
})
