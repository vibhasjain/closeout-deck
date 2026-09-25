import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentPanel } from './AgentPanel'
import { ChatPane } from '@/components/chat/ChatPane'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const router = vi.hoisted(() => ({ params: new URLSearchParams('agent=1'), setParams: vi.fn() }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[index], (value: T) => { hooks.slots[index] = value }]
  },
  useRef: <T,>(initial: T) => { const index = hooks.cursor++; if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }; return hooks.slots[index] },
  useCallback: <T,>(callback: T) => callback,
  useEffect: () => {},
}))
vi.mock('react-router-dom', () => ({ useSearchParams: () => [router.params, router.setParams] }))
vi.mock('@/components/chat/ChatPane', () => ({ ChatPane: () => null }))

type Props = { children?: ReactNode; headerAction?: ReactNode; id?: string; className?: string; hidden?: boolean; inert?: boolean; disabled?: boolean; 'aria-label'?: string; onClick?(): void; onCallingChange?(calling: boolean): void }
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children), ...elements(child.props.headerAction)] : [])
const render = (suppressed = false) => { hooks.cursor = 0; return AgentPanel({ suppressed }) }
beforeEach(() => { hooks.slots = []; router.params = new URLSearchParams('agent=1'); vi.clearAllMocks() })

describe('drawer call controls', () => {
  it('keeps the drawer interactive and ignores close or scrim clicks during a call', () => {
    elements(render()).find(element => element.type === ChatPane)!.props.onCallingChange!(true)
    router.params = new URLSearchParams()
    const tree = elements(render(true))
    const drawer = tree.find(({ props }) => props.id === 'agent-panel')!
    expect(drawer.props.hidden).toBe(false)
    expect(drawer.props.inert).toBe(false)
    const close = tree.find(({ props }) => props['aria-label'] === 'Close agent')!
    expect(close.props.disabled).toBe(true)
    close.props.onClick!()
    tree.find(({ props }) => props.className?.includes('agent-scrim'))!.props.onClick!()
    expect(router.setParams).not.toHaveBeenCalled()
    tree.find(element => element.type === ChatPane)!.props.onCallingChange!(false)
    expect(elements(render(true)).find(({ props }) => props.id === 'agent-panel')!.props.hidden).toBe(true)
  })
})
