import { afterEach, describe, expect, it, vi } from 'vitest'
import { shellLayout, useWide, WIDE_QUERY } from './useWide'

const externalStore = vi.hoisted(() => ({
  subscribe: undefined as undefined | ((listener: () => void) => () => void),
  snapshot: undefined as undefined | (() => boolean),
  serverSnapshot: undefined as undefined | (() => boolean),
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, snapshot: () => boolean, serverSnapshot: () => boolean) => {
    Object.assign(externalStore, { subscribe, snapshot, serverSnapshot })
    return snapshot()
  },
}))
afterEach(() => vi.unstubAllGlobals())

describe('shell breakpoints', () => {
  it.each([
    [1440, 'full', 'docked'], [1280, 'full', 'docked'],
    [1279, 'rail', 'docked'], [1024, 'rail', 'docked'],
    [1023, 'drawer', 'drawer'], [601, 'drawer', 'drawer'],
    [600, 'drawer', 'sheet'], [390, 'drawer', 'sheet'],
  ] as const)('%ipx uses %s navigation and a %s agent', (width, sidebar, agent) => {
    expect(shellLayout(width)).toEqual({ sidebar, agent })
  })

  it('honors the saved rail only at desktop widths without overwriting the preference', () => {
    expect(shellLayout(1440, 'rail')).toEqual({ sidebar: 'rail', agent: 'docked' })
    expect(shellLayout(1280, 'rail')).toEqual({ sidebar: 'rail', agent: 'docked' })
    expect(shellLayout(1279, 'full')).toEqual({ sidebar: 'rail', agent: 'docked' })
    expect(shellLayout(1440, 'full')).toEqual({ sidebar: 'full', agent: 'docked' })
    expect(shellLayout(390, 'rail')).toEqual({ sidebar: 'drawer', agent: 'sheet' })
  })

  it('subscribes to matchMedia changes, reads the current mode, and releases the listener', () => {
    const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const matchMedia = vi.fn(() => media)
    vi.stubGlobal('window', { matchMedia })
    expect(useWide()).toBe(false)
    const listener = vi.fn()
    const cleanup = externalStore.subscribe!(listener)
    expect(matchMedia).toHaveBeenCalledWith(WIDE_QUERY)
    expect(media.addEventListener).toHaveBeenCalledWith('change', listener)
    media.matches = true
    media.addEventListener.mock.calls[0][1]()
    expect(listener).toHaveBeenCalledOnce()
    expect(externalStore.snapshot!()).toBe(true)
    expect(externalStore.serverSnapshot!()).toBe(false)
    cleanup()
    expect(media.removeEventListener).toHaveBeenCalledExactlyOnceWith('change', listener)
  })
})
