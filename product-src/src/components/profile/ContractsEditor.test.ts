import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContractsEditor } from './RulebookModal'
import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { SkeletonRegion } from '@/components/Skeleton'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import type { PendingAction } from '@/lib/usePendingAction'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const store = vi.hoisted(() => ({ state: null as Onboarding | null }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T>(initial: T | (() => T)) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[slot], (next: T | ((previous: T) => T)) => { hooks.slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[slot] as T) : next }]
  },
  useRef: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect: () => {},
}))
vi.mock('@/lib/onboarding', async original => ({
  ...await original<typeof import('@/lib/onboarding')>(),
  getOnboarding: () => store.state!,
  useOnboarding: () => [store.state!, (patch: Partial<Onboarding>) => { store.state = { ...store.state!, ...patch } }],
}))
type Props = { children?: ReactNode; action?: PendingAction; onClick?(): void; onChange?(event: { target: { files: FileList; value: string } }): void }
const elements = (tree: ReactNode): ReactElement<Props>[] => Children.toArray(tree).flatMap(node => isValidElement<Props>(node)
  ? node.type === ActionFeedback ? elements(ActionFeedback({ action: node.props.action! })) : [node, ...elements(node.props.children)] : [])
const text = (tree: ReactNode): string => Children.toArray(tree).map(node => isValidElement<Props>(node) ? text(node.props.children) : String(node)).join(' ')
const render = () => { hooks.cursor = 0; return ContractsEditor() }
const control = () => elements(render()).find(({ type }) => type === ActionButton)!
const choose = (file: File) => {
  const target = { files: [file] as unknown as FileList, value: 'selected' }
  elements(render()).find(({ type }) => type === 'input')!.props.onChange!({ target })
  expect(target.value).toBe('')
}

beforeEach(() => { hooks.slots = []; store.state = structuredClone(DEFAULTS) })

describe('contract document action', () => {
  it('keeps the upload control and existing rules visible while new proposals have immediate skeletons', async () => {
    store.state!.rules = [{ id: 'old', text: 'Keep this existing rule', source: 'Client handbook', scope: null, cite: null, effective: null }]
    let release!: (text: string) => void
    const file = new File([], 'private_contract.txt', { type: 'text/plain' })
    vi.spyOn(file, 'text').mockImplementation(() => new Promise(resolve => { release = resolve }))
    choose(file)
    expect(control().props.action).toMatchObject({ status: 'pending', pending: true, key: 'contracts' })
    expect(elements(render()).some(({ type }) => type === SkeletonRegion)).toBe(true)
    expect(text(render())).toContain('Keep this existing rule')
    release('2.1 Pay overtime after 8 hours.')
    await vi.waitFor(() => expect(control().props.action?.status).toBe('success'))
    expect(store.state!.proposals[0].source).toBe('private_contract.txt')
    expect(text(render())).toContain('Pay overtime after 8 hours')
    expect(text(render())).toContain('Uploaded document')
    expect(text(render())).not.toContain('private_contract.txt')
  })

  it('retries the retained document after a read failure without asking the user to select it again', async () => {
    const file = new File([], 'private_contract.txt', { type: 'text/plain' })
    const read = vi.spyOn(file, 'text').mockRejectedValueOnce(new Error('Read interrupted')).mockResolvedValueOnce('2.1 Pay overtime after 8 hours.')
    choose(file)
    await vi.waitFor(() => expect(control().props.action?.status).toBe('error'))
    expect(control().props.action?.error).toContain('Those contracts could not be read')
    elements(render()).find(({ props }) => props.children === 'Retry')!.props.onClick!()
    await vi.waitFor(() => expect(control().props.action?.status).toBe('success'))
    expect(read).toHaveBeenCalledTimes(2)
    expect(store.state!.proposals).toHaveLength(1)
    expect(store.state!.proposals[0].source).toBe(file.name)
  })
})
