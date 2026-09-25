import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JourneyThreadView } from '@/components/Thread'
import { recordMessage, type JourneyThread } from '@/lib/journey'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: T) => { hooks.slots[slot] = value }]
  },
  useRef: () => ({ current: null }),
}))
vi.mock('@/lib/journey', async (original) => ({
  ...await original<typeof import('@/lib/journey')>(),
  useJourneyThreads: () => ({ threads: [], loading: false, error: null }),
  recordMessage: vi.fn(),
}))

const thread: JourneyThread = { id: 'thread-1', cycleId: '2026-09-14', counterparty: { kind: 'worker', name: 'Jo Chen' }, status: 'waiting', createdAt: '2026-09-21T11:00:00Z',
  messages: [{ id: 'message-1', threadId: 'thread-1', dir: 'out', text: 'Please confirm your time entries.', status: 'not_sent_demo', at: '2026-09-21T11:00:00Z' }] }
type Props = { children?: ReactNode; className?: string; 'aria-label'?: string; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void; onSubmit?: (event: { preventDefault(): void }) => void }
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap((child) => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const text = (node: ReactNode): string => Children.toArray(node).map((child) => isValidElement<Props>(child) ? text(child.props.children) : String(child)).join('')
const render = () => { hooks.cursor = 0; return JourneyThreadView({ thread }) }
beforeEach(() => {
  hooks.slots = []
  vi.clearAllMocks()
  vi.mocked(recordMessage).mockResolvedValue({ message: { ...thread.messages[0], dir: 'in', status: 'recorded' } })
  vi.stubGlobal('requestAnimationFrame', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('persisted mediation conversation', () => {
  it('marks outgoing messages Not Sent · Demo and keeps thread actions outline', () => {
    const tree = render()
    expect(text(tree)).toContain('Not Sent · Demo')
    expect(text(tree)).toContain('Please confirm your time entries.')
    expect(elements(tree).some((element) => element.props.className?.split(' ').includes('primary'))).toBe(false)
  })
  it('Record reply adds an in message through the shared journey client', async () => {
    elements(render()).find(({ props }) => props['aria-label'] === 'Reply text')!.props.onChange!({ target: { value: '  I finished at 5 pm.  ' } })
    elements(render()).find(({ type }) => type === 'form')!.props.onSubmit!({ preventDefault() {} })
    await vi.waitFor(() => expect(recordMessage).toHaveBeenCalledWith('thread-1', { dir: 'in', text: 'I finished at 5 pm.' }))
  })
  it('saves an outgoing message as a demo through the same endpoint', async () => {
    elements(render()).find(({ props }) => props.children === 'Outgoing message')!.props.onClick!()
    elements(render()).find(({ props }) => props['aria-label'] === 'Outgoing message text')!.props.onChange!({ target: { value: 'Please confirm the end time.' } })
    elements(render()).find(({ type }) => type === 'form')!.props.onSubmit!({ preventDefault() {} })
    await vi.waitFor(() => expect(recordMessage).toHaveBeenCalledWith('thread-1', { dir: 'out', text: 'Please confirm the end time.' }))
  })
  it('keeps the reply and shows an error when recording fails', async () => {
    vi.mocked(recordMessage).mockRejectedValue(new Error('Reply could not be recorded'))
    elements(render()).find(({ props }) => props['aria-label'] === 'Reply text')!.props.onChange!({ target: { value: 'Confirmed' } })
    elements(render()).find(({ type }) => type === 'form')!.props.onSubmit!({ preventDefault() {} })
    await vi.waitFor(() => expect(text(render())).toContain('Reply could not be recorded'))
    expect(elements(render()).find(({ props }) => props['aria-label'] === 'Reply text')!.props).toHaveProperty('value', 'Confirmed')
  })
})
