import { type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OverlayProvider } from './Overlay'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T,>(initial: T) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = initial
    return [hooks.slots[index], (next: T) => { hooks.slots[index] = next }]
  },
  useRef: <T,>(initial: T) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }
    return hooks.slots[index]
  },
  useCallback: <T,>(fn: T) => fn,
  useMemo: <T,>(fn: () => T) => fn(),
  useEffect: () => {},
}))
const render = () => { hooks.cursor = 0; return OverlayProvider({ children: null }) }
beforeEach(() => {
  hooks.slots = []
  vi.useFakeTimers()
  vi.stubGlobal('HTMLElement', class {})
  vi.stubGlobal('document', { activeElement: null })
  vi.stubGlobal('requestAnimationFrame', vi.fn())
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('instant overlay frames', () => {
  it.each(['modal', 'drawer'] as const)('mounts a visible %s in the click, before data resolves', kind => {
    const pendingContent = { type: 'div', props: { 'data-skeleton': 'profile' } } as unknown as ReactElement
    const first = render()
    const actions = first.props.value
    if (kind === 'modal') actions.openModal(pendingContent)
    else actions.openDrawer(pendingContent, 'Time entries')
    const state = render().props.children.props.value
    expect(state.surface).toMatchObject({ kind, node: pendingContent })
    expect(state.phase).toBe('open')
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
