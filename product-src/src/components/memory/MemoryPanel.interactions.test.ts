import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddMemory, MemoryRow, MemorySuggestion } from './MemoryPanel'
import { Btn } from '@/components/ui'
import { createInstinct, dismissProposal, editInstinct, forgetInstinct, keepInstinct, type Instinct } from '@/lib/memory'

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const index = hooks.index++
    if (!(index in hooks.slots)) hooks.slots[index] = initial
    return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = next }]
  },
  useRef(initial: unknown) {
    const index = hooks.index++
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }
    return hooks.slots[index]
  },
}))
vi.mock('@/components/chat/ChatPane', () => ({ applyAction: vi.fn() }))
vi.mock('@/lib/memory', async original => ({ ...await original<typeof import('@/lib/memory')>(),
  createInstinct: vi.fn(async () => row), editInstinct: vi.fn(async () => row), forgetInstinct: vi.fn(async () => row),
  keepInstinct: vi.fn(async () => row), dismissProposal: vi.fn(async () => row),
}))

const row: Instinct = { id: 'i_0123456789abcdef', kind: 'context', text: 'Travis Reed signs off Lonestar', source: 'chat', status: 'pending', until: null, ruleId: null, at: '2026-09-25T16:00:00Z' }
type Props = { children?: ReactNode; 'aria-label'?: string; onClick?: () => Promise<void> | void; onBlur?: () => Promise<void> | void; onChange?: (event: { target: { value: string } }) => void; onSubmit?: (event: { preventDefault(): void }) => Promise<void> }
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const button = (node: ReactNode, text: string) => elements(node).find(element => element.type === Btn && Children.toArray(element.props.children).includes(text))!
const input = (node: ReactNode) => elements(node).find(element => element.type === 'input' || element.type === 'textarea')!
const render = <T,>(component: () => T): T => { hooks.index = 0; return component() }
afterEach(() => { hooks.slots = []; hooks.index = 0; vi.clearAllMocks() })

describe('memory row controls', () => {
  it('keeps a pending memory and saves trimmed edits on blur', async () => {
    const component = () => MemoryRow({ instinct: row })
    await button(render(component), 'Keep').props.onClick!()
    expect(keepInstinct).toHaveBeenCalledWith(row.id)
    input(render(component)).props.onChange!({ target: { value: '  Travis Reed approves Lonestar time entries  ' } })
    await input(render(component)).props.onBlur!()
    expect(editInstinct).toHaveBeenCalledWith(row.id, { text: 'Travis Reed approves Lonestar time entries' })
  })

  it('waits for inline confirmation before forgetting, and Cancel does not forget', async () => {
    const component = () => MemoryRow({ instinct: row })
    elements(render(component)).find(element => element.props['aria-label']?.startsWith('Forget '))!.props.onClick!()
    expect(forgetInstinct).not.toHaveBeenCalled()
    button(render(component), 'Cancel').props.onClick!()
    expect(button(render(component), 'Forget')).toBeUndefined()
    expect(forgetInstinct).not.toHaveBeenCalled()
    elements(render(component)).find(element => element.props['aria-label']?.startsWith('Forget '))!.props.onClick!()
    await button(render(component), 'Forget').props.onClick!()
    expect(forgetInstinct).toHaveBeenCalledWith(row.id)
  })

  it('does not rewrite server text merely because display replaced a rule id', async () => {
    const tree = render(() => MemoryRow({ instinct: { ...row, source: 'decisions', text: 'Usually dismisses CA-MB-01 findings' } }))
    await input(tree).props.onBlur!()
    expect(editInstinct).not.toHaveBeenCalled()
  })

  it('adds user memory with the selected kind', async () => {
    const component = () => AddMemory()
    button(render(component), 'Add').props.onClick!()
    const tree = render(component)
    elements(tree).find(element => element.type === 'select')!.props.onChange!({ target: { value: 'style' } })
    input(tree).props.onChange!({ target: { value: '  Keep replies short  ' } })
    await render(component).props.onSubmit!({ preventDefault: vi.fn() })
    expect(createInstinct).toHaveBeenCalledWith({ kind: 'style', text: 'Keep replies short', source: 'user' })
  })

  it('dismisses suggestions through their permanent Forget route', async () => {
    const makeRule = vi.fn(async () => {})
    const component = () => MemorySuggestion({ proposal: { ruleId: 'CA-MB-01', count: 3, cycles: 2, topReason: 'Already paid' }, onMakeRule: makeRule })
    await button(render(component), 'Forget').props.onClick!()
    expect(dismissProposal).toHaveBeenCalledWith('CA-MB-01')
    expect(makeRule).not.toHaveBeenCalled()
  })
})
