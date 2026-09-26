import { Children, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { RuleComposer } from './Rules'

const hooks = vi.hoisted(() => ({ cursor: 0, state: [] as unknown[] }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.state)) hooks.state[slot] = initial
    return [hooks.state[slot], (next: T) => { hooks.state[slot] = next }]
  },
}))

type Props = { children?: ReactNode; disabled?: boolean; 'aria-label'?: string; onClick?(): void; onChange?(event: ChangeEvent<HTMLTextAreaElement>): void }
const elements = (tree: ReactNode): ReactElement<Props>[] => Children.toArray(tree).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const text = (tree: ReactNode): string => Children.toArray(tree).map(child => isValidElement<Props>(child) ? text(child.props.children) : String(child)).join('')
const button = (tree: ReactNode, label: string) => elements(tree).find(child => child.props.onClick && text(child.props.children) === label)!

beforeEach(() => { hooks.cursor = 0; hooks.state = [] })

it('shows the compiled rule immediately because compilation is local, with no simulated loading interval', () => {
  const save = vi.fn()
  const render = () => { hooks.cursor = 0; return RuleComposer({ onSave: save, onCancel: vi.fn() }) }
  const first = render()
  expect(text(first)).toContain('Add a Rule')
  expect(button(first, 'Compile').props.disabled).toBe(true)
  elements(first).find(child => child.props['aria-label'] === 'Write the rule')!.props.onChange!({ target: { value: 'Fix gaps up to 15 minutes.' } } as ChangeEvent<HTMLTextAreaElement>)
  button(render(), 'Compile').props.onClick!()
  const compiled = render()
  expect(text(compiled)).toContain('Fix gaps up to 15 minutes')
  expect(text(compiled)).not.toMatch(/Compiling|Loading/)
  button(compiled, 'Add Rule').props.onClick!()
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ sentence: 'Fix gaps up to 15 minutes.' }))
})
