import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Children, isValidElement, type EffectCallback, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authedFetch } from '@/lib/api'
import { forgetInstinct, type Instinct, type MemorySnapshot } from '@/lib/memory'
import type { ChatMessage, Onboarding } from '@/lib/onboarding'
import { RememberLine } from './RememberLine'
import { memoryHistory, type RememberReceipt } from './chatMemory'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as EffectCallback[] }))
const store = vi.hoisted(() => ({
  snapshot: { instincts: [], proposals: [], lastRun: null } as MemorySnapshot,
  loaded: true, readAt: 2, error: null as string | null, chat: [] as ChatMessage[], update: vi.fn(),
}))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot] as T, (next: T | ((previous: T) => T)) => {
      hooks.slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[slot] as T) : next
    }]
  },
  useEffect: (effect: EffectCallback) => { hooks.effects.push(effect) },
}))
vi.mock('@/lib/api', () => ({ authedFetch: vi.fn() }))
vi.mock('@/lib/viewerSession', () => ({ viewerSession: () => ({ email: 'memory-line-test@example.com' }) }))
vi.mock('@/lib/memory', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/memory')>(), useMemory: () => store,
}))
vi.mock('@/lib/onboarding', () => ({ getOnboarding: () => ({ chat: store.chat }), useOnboarding: () => [{ chat: store.chat }, store.update] }))

const instinct: Instinct = { id: 'i_abcdef0123456789', kind: 'context', text: 'Travis Reed signs off Lonestar.', source: 'chat', status: 'pending', until: null, ruleId: null, at: '2026-09-25T12:00:00Z' }
const receipt: RememberReceipt = { type: 'remember', kind: 'context', text: instinct.text, memory: { id: instinct.id, state: 'pending' } }
type Props = { children?: ReactNode; onClick?: () => void; className?: string; disabled?: boolean }
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const label = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<Props>(child) ? label(child.props.children) : String(child)).join('')
function render(value = receipt) {
  hooks.cursor = 0; hooks.effects = []
  return RememberLine({ receipt: value, messageId: 'agent-memory', at: 1 })
}
function click(tree: ReactNode, text: string) { elements(tree).find(node => node.type === 'button' && label(node.props.children) === text)!.props.onClick!() }

beforeEach(() => {
  vi.clearAllMocks()
  hooks.slots = []
  store.snapshot = { instincts: [instinct], proposals: [], lastRun: null }
  store.loaded = true; store.readAt = 2; store.error = null
  store.chat = [{ id: 'agent-memory', role: 'agent', text: 'Understood.', at: 1, actions: [receipt] }]
  store.update.mockImplementation((patch: Partial<Onboarding> | ((state: Onboarding) => Partial<Onboarding>)) => {
    const change = typeof patch === 'function' ? patch({ chat: store.chat } as Onboarding) : patch
    if (change.chat) store.chat = change.chat
  })
  vi.mocked(authedFetch).mockImplementation(async (path, init) => {
    const status = path.endsWith('/forget') ? 'forgotten' : JSON.parse(String(init?.body)).status
    const updated = { ...instinct, status }
    store.snapshot = { ...store.snapshot, instincts: status === 'forgotten' ? [] : [updated] }
    return Response.json({ instinct: updated })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('quiet chat memory line', () => {
  it.each([['duplicate', 'Already known'], ['tombstone', 'You asked me to forget this']] as const)('renders the 409 %s line without actions', (state, copy) => {
    const tree = render({ ...receipt, memory: { state } })
    expect(label(tree)).toBe(copy)
    expect(elements(tree).filter(node => node.type === 'button')).toEqual([])
    expect(renderToStaticMarkup(tree)).toContain('aria-label="Agent memory"')
  })

  it('keeps with PATCH status active and preserves the resolved state with its message', async () => {
    expect(label(render())).toContain(`I'll remember: ${instinct.text}`)
    click(render(), 'Keep')
    await vi.waitFor(() => expect(store.update).toHaveBeenCalledTimes(1))
    expect(authedFetch).toHaveBeenCalledExactlyOnceWith(`/memory/instincts/${instinct.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }),
    })
    expect(memoryHistory(store.chat)[0].actions).toEqual([{ ...receipt, memory: { id: instinct.id, state: 'active' } }])
    expect(label(render())).toContain('Kept')
    expect(elements(render()).filter(node => node.type === 'button').map(node => label(node.props.children))).toEqual(['Forget'])
  })

  it('requires inline confirmation before Forget, supports Cancel and writes the forget route once', async () => {
    const confirm = vi.fn()
    vi.stubGlobal('confirm', confirm)
    click(render(), 'Forget')
    expect(authedFetch).not.toHaveBeenCalled()
    expect(label(render())).toContain('Forget this?')
    click(render(), 'Cancel')
    expect(label(render())).not.toContain('Forget this?')
    expect(authedFetch).not.toHaveBeenCalled()
    click(render(), 'Forget')
    click(render(), 'Forget')
    await vi.waitFor(() => expect(store.update).toHaveBeenCalledTimes(1))
    expect(authedFetch).toHaveBeenCalledExactlyOnceWith(`/memory/instincts/${instinct.id}/forget`, { method: 'POST' })
    expect(memoryHistory(store.chat)[0].actions).toEqual([{ ...receipt, memory: { id: instinct.id, state: 'forgotten' } }])
    expect(label(render())).toBe(`Forgotten: ${instinct.text}`)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('keeps the saved state until a memory read succeeds, and never records a Forget the owner did not make', async () => {
    // Its own id: other tests in this file confirm a Forget of the shared one.
    const replaced = { ...receipt, memory: { id: 'i_fedcba9876543210', state: 'pending' as const } }
    store.chat = [{ id: 'agent-memory', role: 'agent', text: 'Understood.', at: 1, actions: [replaced] }]
    store.snapshot = { instincts: [], proposals: [], lastRun: null }
    store.loaded = false
    expect(label(render(replaced))).toContain("I'll remember:")
    hooks.effects.forEach(effect => effect())
    store.loaded = true; store.error = 'Offline'
    expect(label(render(replaced))).toContain("I'll remember:")
    hooks.effects.forEach(effect => effect())
    // A read issued before this message cannot know its row yet (another device's correction arriving on focus).
    store.error = null; store.readAt = 0
    expect(label(render(replaced))).toContain("I'll remember:")
    expect(elements(render(replaced)).filter(node => node.type === 'button').map(node => label(node.props.children))).toEqual(['Keep', 'Forget'])
    hooks.effects.forEach(effect => effect())
    // A newer read without the row: consolidation replaced it. That is not a Forget.
    store.readAt = 2
    expect(label(render(replaced))).toBe(`Changed since: ${instinct.text} · see Rules`)
    expect(elements(render(replaced)).filter(node => node.type === 'button')).toEqual([])
    hooks.effects.forEach(effect => effect())
    expect(store.update).not.toHaveBeenCalled()
    // Forget on Rules is confirmed by the server, so the line records it.
    vi.mocked(authedFetch).mockResolvedValueOnce(Response.json({ instinct: { ...instinct, id: replaced.memory.id, status: 'forgotten' } }))
    await forgetInstinct(replaced.memory.id)
    expect(label(render(replaced))).toBe(`Forgotten: ${instinct.text}`)
    hooks.effects.forEach(effect => effect())
    expect(memoryHistory(store.chat)[0].actions).toEqual([{ ...replaced, memory: { id: replaced.memory.id, state: 'forgotten' } }])
  })

  it('does not persist active when a Keep settles after Forget in another pane', async () => {
    vi.mocked(authedFetch).mockResolvedValueOnce(Response.json({ instinct: { ...instinct, status: 'forgotten' } }))
    click(render(), 'Keep')
    await vi.waitFor(() => expect(store.update).toHaveBeenCalledTimes(1))
    expect(memoryHistory(store.chat)[0].actions).toEqual([{ ...receipt, memory: { id: instinct.id, state: 'forgotten' } }])
  })

  it('retains the pending controls on a failed write and shows the error inline', async () => {
    vi.mocked(authedFetch).mockResolvedValueOnce(Response.json({}, { status: 503 }))
    click(render(), 'Keep')
    await vi.waitFor(() => expect(label(render())).toContain('Memory could not be updated. Try again.'))
    expect(store.update).not.toHaveBeenCalled()
    expect(elements(render()).filter(node => node.type === 'button').map(node => [label(node.props.children), node.props.disabled])).toEqual([['Keep', false], ['Forget', false]])
  })
})

describe('memory house rules', () => {
  it('uses outline memory buttons, including inline confirmation, with no black or primary button styles', () => {
    const initial = render()
    click(initial, 'Forget')
    const controls = [...elements(initial), ...elements(render())].filter(node => node.type === 'button')
    expect(controls.length).toBeGreaterThan(0)
    expect(controls.every(node => node.props.className?.split(' ').includes('memory-button') && !node.props.className?.split(' ').includes('primary'))).toBe(true)
    const css = readFileSync(new URL('./memory.css', import.meta.url), 'utf8')
    expect(css).not.toMatch(/(?:background(?:-color)?\s*:\s*(?:black|#000(?:000)?|#111(?:111)?|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))|\.primary\b)/i)
    const sources = readdirSync(new URL('.', import.meta.url)).filter(file => file.endsWith('.tsx')).map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n')
    expect(sources).not.toMatch(/(?:className=["'][^"']*\bprimary\b|variant=["'](?:default|primary)["']|\bwindow\.confirm\s*\()/)
  })

  it('has no Clear chat button anywhere in the client', () => {
    const root = new URL('../../', import.meta.url)
    const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith('.tsx') ? [join(directory, entry.name)] : [])
    const sources = files(root.pathname).map(file => readFileSync(file, 'utf8')).join('\n')
    expect(sources).not.toMatch(/(?:aria-label|title)=["']Clear(?:[- ]chat)?["']/i)
    expect(sources).not.toMatch(/>\s*Clear(?:[- ]chat)?\s*</i)
  })
})
