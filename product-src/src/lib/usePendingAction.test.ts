import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePendingAction } from './usePendingAction'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (next: unknown) => { hooks.slots[slot] = next }]
  },
  useRef(initial: unknown) {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
}))
const useTestAction = () => usePendingAction()
// The test harness retains hook slots without mounting a browser.
// eslint-disable-next-line react-hooks/rules-of-hooks
const renderAction = () => { hooks.cursor = 0; return useTestAction() }
afterEach(() => { hooks.cursor = 0; hooks.slots = [] })

describe('shared mutation feedback', () => {
  it('publishes pending immediately and prevents a double click before React renders', async () => {
    let finish!: () => void
    const operation = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const action = renderAction()
    const first = action.run(operation, 'approve')
    expect(renderAction()).toMatchObject({ pending: true, status: 'pending', key: 'approve', error: null })
    expect(await action.run(operation, 'approve')).toBe(false)
    expect(operation).toHaveBeenCalledOnce()
    finish()
    expect(await first).toBe(true)
    expect(renderAction()).toMatchObject({ pending: false, status: 'success', key: 'approve' })
    // A data refresh may rerender several times; success stays visible until the caller moves on.
    expect(renderAction().status).toBe('success')
    renderAction().reset()
    expect(renderAction().status).toBe('idle')
  })

  it('restores the control after error and Retry preserves the original operation', async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce(undefined)
    expect(await renderAction().run(operation, 'record-reply')).toBe(false)
    expect(renderAction()).toMatchObject({ pending: false, status: 'error', error: 'Connection interrupted', key: 'record-reply' })
    expect(await renderAction().retry()).toBe(true)
    expect(operation).toHaveBeenCalledTimes(2)
    expect(renderAction()).toMatchObject({ status: 'success', error: null })
  })
})


describe('optimistic mutation feedback', () => {
  it('shows Approved in the same turn, rolls back a 500, and Retry repeats the preserved operation', async () => {
    let reject!: (error: Error) => void
    let approved = false
    const rollback = vi.fn(() => { approved = false })
    const operation = vi.fn().mockImplementationOnce(() => {
      approved = true
      return new Promise((_resolve, fail) => { reject = fail })
    }).mockImplementationOnce(() => { approved = true })
    const first = renderAction().run(operation, 'approve', { optimistic: true, rollback })
    expect(approved).toBe(true)
    expect(renderAction()).toMatchObject({ status: 'success', pending: false, inFlight: true, key: 'approve' })
    expect(await renderAction().run(operation, 'approve', { optimistic: true })).toBe(false)
    reject(new Error('The decision could not be saved (500).'))
    expect(await first).toBe(false)
    expect(approved).toBe(false)
    expect(rollback).toHaveBeenCalledOnce()
    expect(renderAction()).toMatchObject({ status: 'error', inFlight: false, error: 'The decision could not be saved (500).' })
    expect(await renderAction().retry()).toBe(true)
    expect(approved).toBe(true)
    expect(operation).toHaveBeenCalledTimes(2)
    expect(renderAction()).toMatchObject({ status: 'success', pending: false, inFlight: false })
  })
})
