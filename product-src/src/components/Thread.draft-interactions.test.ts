import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ActionFeedback } from '@/components/ActionButton'
import { DraftCard, PartyThread } from './Thread'
import { buildCycles } from '@/lib/desk'
import { DEFAULTS, flushOnboarding, type Onboarding } from '@/lib/onboarding'
import { defaultThreadParty, generateThread, threadFor, type ThreadAction } from '@/lib/threads'
import { Btn } from '@/components/ui'
import type { PendingAction } from '@/lib/usePendingAction'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], state: {} as Onboarding }))
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
  useEffect: vi.fn(), useLayoutEffect: vi.fn(),
}))
vi.mock('@/components/shell/Overlay', () => ({ useOverlay: () => ({ toast: vi.fn() }) }))
vi.mock('@/lib/onboarding', async original => ({ ...await original<typeof import('@/lib/onboarding')>(),
  getOnboarding: () => hooks.state,
  useOnboarding: () => [hooks.state, (patch: Partial<Onboarding>) => { hooks.state = { ...hooks.state, ...patch } }],
  flushOnboarding: vi.fn(),
}))

const cycle = buildCycles(DEFAULTS, new Date(2026, 8, 22, 12))[0]
const rs = cycle.run.shifts.find(payment => generateThread(cycle, payment).draft)!
const party = defaultThreadParty(cycle, rs)
const original = generateThread(cycle, rs, party)
const key = `${cycle.id}:${rs.shift.id}:${party}`
type Props = { children?: ReactNode; action?: PendingAction; onAction?: (action: ThreadAction) => void; onClick?: () => void; disabled?: boolean; onKeyDown?: (event: { key: string; preventDefault(): void; stopPropagation(): void }) => void }
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const render = () => { hooks.cursor = 0; return PartyThread({ cycle, rs, party, legacyParty: party, switcher: null }) }
const draft = () => elements(render()).find(node => !!node.props.onAction)!

beforeEach(() => { hooks.cursor = 0; hooks.slots = []; hooks.state = { ...DEFAULTS, mediation: {} }; vi.clearAllMocks() })
afterEach(() => vi.unstubAllGlobals())

it.each(['edit', 'send', 'dismiss'] as const)('applies a draft %s and its real trail instantly, then restores the draft with Retry after failure', async type => {
  let reject!: (cause: Error) => void
  vi.mocked(flushOnboarding).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  const action: ThreadAction = type === 'dismiss' ? { type, at: '2026-09-26T12:00:00Z' }
    : type === 'send' ? { type, text: original.draft!.text, draft: true, at: '2026-09-26T12:00:00Z' }
    : { type, text: 'Preserve my exact draft edit.', at: '2026-09-26T12:00:00Z' }
  draft().props.onAction!(action)
  expect(draft().props.action).toMatchObject({ status: 'success', inFlight: true, optimistic: true })
  const optimistic = threadFor(cycle, rs, hooks.state.mediation[key], party)
  if (type === 'edit') expect(optimistic.draft?.text).toBe('Preserve my exact draft edit.')
  else expect(optimistic.draft).toBeNull()
  expect(optimistic.trail.some(entry => entry.at === action.at)).toBe(true)
  reject(new Error('Draft could not be saved'))
  await vi.waitFor(() => expect(draft().props.action).toMatchObject({ status: 'error', error: 'Draft could not be saved' }))
  expect(threadFor(cycle, rs, hooks.state.mediation[key], party).draft).toEqual(original.draft)
  const feedback = elements(render()).find(node => node.type === ActionFeedback)!
  vi.mocked(flushOnboarding).mockResolvedValueOnce(undefined)
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  expect(await feedback.props.action!.retry()).toBe(true)
  expect(threadFor(cycle, rs, hooks.state.mediation[key], party).trail.some(entry => entry.at === action.at)).toBe(true)
})


it('locks retained draft editing while Save message is in flight so a new edit cannot be discarded', () => {
  const action: PendingAction = { status: 'success', key: 'send', inFlight: true, optimistic: true, pending: false, error: null, run: async () => true, retry: async () => true, reset: vi.fn() }
  const renderDraft = () => { hooks.cursor = 0; return DraftCard({ draft: original.draft!, action, onAction: vi.fn() }) }
  const edit = elements(renderDraft()).find(node => node.type === Btn && node.props.children === 'Edit')!
  expect(edit.props.disabled).toBe(true)
  edit.props.onClick!()
  expect(elements(renderDraft()).some(node => node.type === 'textarea')).toBe(false)
})

it.each(['Cancel', 'Escape'])('%s exits a failed draft edit and clears its previous retry', method => {
  const action: PendingAction = { status: 'error', key: 'edit', inFlight: false, optimistic: true, pending: false, error: 'Failed', run: async () => true, retry: async () => true,
    reset: vi.fn(() => { action.status = 'idle'; action.error = null }) }
  const renderDraft = () => { hooks.cursor = 0; return DraftCard({ draft: original.draft!, action, onAction: vi.fn() }) }
  const tree = renderDraft()
  expect(elements(tree).some(node => node.type === 'textarea')).toBe(true)
  if (method === 'Cancel') elements(tree).find(node => node.type === Btn && node.props.children === 'Cancel')!.props.onClick!()
  else elements(tree).find(node => node.type === 'textarea')!.props.onKeyDown!({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
  expect(action.reset).toHaveBeenCalledOnce()
  expect(elements(renderDraft()).some(node => node.type === 'textarea')).toBe(false)
})
