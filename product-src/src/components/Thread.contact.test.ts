import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JourneyThreadView } from './Thread'
import { blockedCounterparty, threadErrorText } from '@/lib/contactPolicy'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import { JourneyError, type JourneyThread } from '@/lib/journey'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const store = vi.hoisted(() => ({ state: undefined as Onboarding | undefined, recordMessage: vi.fn() }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T,>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: T) => { hooks.slots[slot] = value }]
  },
  useRef: <T,>(current: T) => ({ current }),
}))
vi.mock('@/lib/onboarding', async original => ({ ...await original<typeof import('@/lib/onboarding')>(), useOnboarding: () => [store.state, vi.fn()] }))
vi.mock('@/lib/data', async original => ({ ...await original<typeof import('@/lib/data')>(), useData: () => ({ payloads: [] }) }))
vi.mock('@/lib/journey', async original => ({ ...await original<typeof import('@/lib/journey')>(), useJourneyThreads: () => ({ threads: [], error: null }), recordMessage: store.recordMessage }))

const thread: JourneyThread = { id: 'thread-test', cycleId: '2026-09-20', counterparty: { kind: 'worker', name: 'Abel Alvarez' }, status: 'open', createdAt: '', messages: [] }
type Props = { children?: ReactNode; 'aria-label'?: string; disabled?: boolean; onClick?(): void; onChange?(event: { target: { value: string } }): void; onSubmit?(event: { preventDefault(): void }): void }
const elements = (tree: ReactNode): ReactElement<Props>[] => Children.toArray(tree).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const textOf = (tree: ReactNode): string => Children.toArray(tree).map(child => isValidElement<Props>(child) ? textOf(child.props.children) : String(child)).join('')

function mount() {
  let tree: ReactNode
  const draw = () => { hooks.cursor = 0; tree = JourneyThreadView({ thread }); return renderToStaticMarkup(tree) }
  draw()
  return {
    draw,
    click: (label: string) => { elements(tree).find(element => !!element.props.onClick && textOf(element.props.children) === label)!.props.onClick!(); return draw() },
    change: (value: string) => { elements(tree).find(element => element.type === 'textarea')!.props.onChange!({ target: { value } }); return draw() },
    input: () => elements(tree).find(element => element.type === 'textarea')!,
    submit: async () => { elements(tree).find(element => element.type === 'form')!.props.onSubmit!({ preventDefault() {} }); await Promise.resolve(); await Promise.resolve(); return draw() },
  }
}

beforeEach(() => {
  hooks.cursor = 0; hooks.slots = []
  store.state = { ...DEFAULTS, neverContact: [] }
  store.recordMessage.mockReset()
})

describe('never-contact thread controls', () => {
  it('disables the outgoing composer before sending while retaining inbound reply recording', async () => {
    store.state!.neverContact = [' Ábel   Álvaréz ']
    const form = mount()
    expect(form.draw()).toContain('Abel Alvarez is on your never-contact list.')
    expect(form.input().props.disabled).toBe(false)
    form.click('Outgoing message')
    expect(form.input().props.disabled).toBe(true)
    // Even an event from a stale control cannot bypass the send boundary.
    form.change('Please confirm these hours.')
    await form.submit()
    expect(store.recordMessage).not.toHaveBeenCalled()
  })

  it('humanises a server never-contact rejection when local permissions are stale', async () => {
    store.recordMessage.mockRejectedValue(new JourneyError(403, 'never_contact'))
    const form = mount()
    form.click('Outgoing message'); form.change('Please confirm these hours.')
    const html = await form.submit()
    expect(html).toContain('Abel Alvarez is on your never-contact list.')
    expect(html).not.toContain('never_contact')
    expect(store.recordMessage).toHaveBeenCalledOnce()
  })

  it('matches never-contact sites from both persisted and legacy thread references', () => {
    const site = { ...thread, counterparty: { kind: 'site' as const, name: 'Maria Castillo', siteNames: ['Pacific Cold Storage'] } }
    expect(blockedCounterparty(site, ['Pacific Cold Storage'])).toBe(true)
    expect(blockedCounterparty({ ...site, counterparty: { ...site.counterparty, siteNames: undefined, gapIds: ['Pacific Cold Storage|Worker|0'] } }, ['Pacific Cold Storage'])).toBe(true)
    expect(blockedCounterparty(site, ['Someone else'])).toBe(false)
  })

  it('keeps diagnostic codes out of visible error copy', () => {
    expect(threadErrorText(new Error('not_found'), 'Abel Alvarez')).toBe('The message could not be recorded. Try again.')
    expect(new JourneyError(404, 'not_found').message).not.toContain('not_found')
  })
})
