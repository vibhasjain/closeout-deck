import { afterEach, describe, expect, it, vi } from 'vitest'
import { useActionRetention } from './useActionRetention'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], cleanups: [] as Array<() => void> }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (next: unknown) => { hooks.slots[slot] = typeof next === 'function' ? next(hooks.slots[slot]) : next }]
  },
  useRef(initial: unknown) {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect(effect: () => (() => void)) { const slot = hooks.cursor++; if (!(slot in hooks.slots)) { hooks.slots[slot] = true; hooks.cleanups.push(effect()) } },
}))
// The lightweight test dispatcher is external to React by design.
// eslint-disable-next-line react-hooks/immutability
const useRows = (items: Array<{ id: string; label: string }>) => { hooks.cursor = 0; return useActionRetention(items, item => item.id) }
afterEach(() => { hooks.cleanups.forEach(cleanup => cleanup()); hooks.cursor = 0; hooks.slots = []; hooks.cleanups = []; vi.useRealTimers() })

describe('mutation row retention', () => {
  it('keeps a removed control in its original position through refreshed data and the success beat', () => {
    vi.useFakeTimers()
    const first = { id: 'first', label: 'First' }, removed = { id: 'second', label: 'Second' }, third = { id: 'third', label: 'Third' }
    const release = useRows([first, removed, third]).retain(removed)
    const refreshed = [first, third]
    expect(useRows(refreshed).items).toEqual([first, removed, third])
    expect(refreshed).toEqual([first, third])
    release()
    vi.advanceTimersByTime(899)
    expect(useRows(refreshed).items).toEqual([first, removed, third])
    vi.advanceTimersByTime(1)
    expect(useRows(refreshed).items).toEqual(refreshed)
  })

  it('prefers updated data for a retained row instead of restoring its obsolete state', () => {
    vi.useFakeTimers()
    const before = { id: 'memory', label: 'Pending' }, after = { id: 'memory', label: 'Kept' }
    useRows([before]).retain(before)
    expect(useRows([after]).items).toEqual([after])
  })
})
