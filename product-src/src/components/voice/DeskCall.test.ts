import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallSnapshot } from '@/lib/live'
import { DeskCall } from './DeskCall'
import { CallScreen } from './CallScreen'
import { CallBar } from './CallBar'

const hooks = vi.hoisted(() => ({ minimized: false, width: 390 }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: () => [hooks.minimized, (value: boolean) => { hooks.minimized = value }],
  useRef: () => ({ current: null }),
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => boolean) => getSnapshot(),
}))

const snapshot: CallSnapshot = { status: 'active', orb: 'composing', stream: null, remoteStream: null, muted: false, seconds: 43, caption: '', transcript: [], level: 0 }
const controls = { snapshot, onMute: vi.fn(), onEnd: vi.fn(), onRetry: vi.fn(), onKeepTyping: vi.fn() }
type Surface = ReactElement<typeof controls & { purpose?: string; onMinimize?(): void; onExpand?(): void }>
const render = () => DeskCall(controls).props.children as Surface

beforeEach(() => {
  hooks.minimized = false
  hooks.width = 390
  vi.clearAllMocks()
  vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === '(max-width: 1023.98px)' && hooks.width < 1024 }) })
})
afterEach(() => vi.unstubAllGlobals())

describe('desk call presentation', () => {
  it.each([390, 768, 1023])('opens a full conversation at %ipx', (width) => {
    hooks.width = width
    expect(render().type).toBe(CallScreen)
    expect(render().props.purpose).toBe('desk')
  })

  it.each([1024, 1440])('keeps the captioned compact bar at %ipx', (width) => {
    hooks.width = width
    expect(render().type).toBe(CallBar)
    expect(render().props.onExpand).toBeUndefined()
  })

  it('minimizes and expands the same live session without invoking end or typing', () => {
    render().props.onMinimize!()
    expect(render().type).toBe(CallBar)
    expect(render().props.snapshot).toBe(snapshot)
    render().props.onExpand!()
    expect(render().type).toBe(CallScreen)
    expect(render().props.snapshot).toBe(snapshot)
    expect(controls.onEnd).not.toHaveBeenCalled()
    expect(controls.onKeepTyping).not.toHaveBeenCalled()
    render().props.onEnd()
    expect(controls.onEnd).toHaveBeenCalledOnce()
  })
})
