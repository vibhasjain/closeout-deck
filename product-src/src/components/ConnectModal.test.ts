import { Children, isValidElement, type DependencyList, type EffectCallback, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectModal } from '@/components/ConnectModal'
import { vendorKey, type Vendor } from '@/components/SourcesTable'
import { SOURCES } from '@/bench/vendors'
import { buildCycles, type DeskCycle } from '@/lib/desk'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'

// The suite runs in Node. Retain hook state and effect cleanups while exercising
// the component's actual button handler, timers, and rendered React elements.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  pending: [] as Array<() => void>,
  cleanups: new Set<() => void>(),
}))
const desk = vi.hoisted(() => ({ current: undefined as DeskCycle | undefined }))
const store = vi.hoisted(() => ({ current: undefined as Onboarding | undefined, update: vi.fn() }))
const overlay = vi.hoisted(() => ({ close: vi.fn(), toast: vi.fn() }))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T>(initial: T | (() => T)) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[slot] as T, (next: T | ((previous: T) => T)) => {
      hooks.slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[slot] as T) : next
    }]
  },
  useRef: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect: (effect: EffectCallback, dependencies?: DependencyList) => {
    const slot = hooks.cursor++
    const previous = hooks.slots[slot] as { dependencies?: DependencyList; cleanup?: () => void } | undefined
    if (previous && dependencies && previous.dependencies?.length === dependencies.length
      && dependencies.every((dependency, index) => Object.is(dependency, previous.dependencies![index]))) return
    hooks.pending.push(() => {
      previous?.cleanup?.()
      if (previous?.cleanup) hooks.cleanups.delete(previous.cleanup)
      const cleanup = effect() || undefined
      if (cleanup) hooks.cleanups.add(cleanup)
      hooks.slots[slot] = { dependencies, cleanup }
    })
  },
}))
vi.mock('@/lib/onboarding', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/onboarding')>(),
  useOnboarding: () => [store.current, store.update],
}))
vi.mock('@/lib/desk', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/desk')>(),
  useDesk: () => ({ current: desk.current }),
}))
vi.mock('@/components/shell/Overlay', () => ({ useOverlay: () => overlay }))

const now = new Date(2026, 8, 22, 12)
const ready = SOURCES.find((vendor) => vendor.id === 'ukg-ready')!
const available = SOURCES.find((vendor) => vendor.id === 'tempworks')!
const textContent = (html: string) => html.replace(/<[^>]*>/g, '')

function clickSignIn(node: ReactNode): boolean {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) continue
    if (child.props.children === 'Sign In' && child.props.onClick) {
      child.props.onClick()
      return true
    }
    if (clickSignIn(child.props.children)) return true
  }
  return false
}

function mount(vendor: Vendor) {
  const onDone = vi.fn()
  let tree: ReactNode
  const render = () => {
    hooks.cursor = 0
    tree = ConnectModal({ vendor, onDone })
    hooks.pending.splice(0).forEach((effect) => effect())
    return renderToStaticMarkup(tree)
  }
  return {
    onDone,
    render,
    signIn: () => { expect(clickSignIn(tree)).toBe(true) },
    advance: (milliseconds: number) => { vi.advanceTimersByTime(milliseconds); return render() },
  }
}

function unmount() {
  hooks.cleanups.forEach((cleanup) => cleanup())
  hooks.cleanups.clear()
}

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(now)
  vi.clearAllMocks()
  hooks.cursor = 0
  hooks.slots = []
  hooks.pending = []
  store.current = { ...DEFAULTS, connections: { 'source:existing': { status: 'connected', method: 'api' } } }
  store.update.mockImplementation((patch: Partial<Onboarding>) => { store.current = { ...store.current!, ...patch } })
  desk.current = buildCycles(DEFAULTS, now)[0]
})
afterEach(() => {
  unmount()
  vi.useRealTimers()
})

describe('simulated browser connection', () => {
  it('shows an explicitly fake, read-only account with a vendor-derived URL', () => {
    const modal = mount(ready)
    const html = modal.render()
    expect(html).toContain('ukg.com/auth/login')
    expect(html).toContain('Sign in to UKG')
    expect(html).toContain('payroll.ops@demo.hypertrack.com')
    expect(html).toContain('••••••••')
    expect(html).toContain('>Demo</span>')
    expect(html).toContain('Demo connection · use placeholder credentials')
    expect(html).toContain('class="btn primary"')
    expect(html).not.toMatch(/<(input|textarea|form)\b|contenteditable/i)
    expect(html).not.toContain('API key')
    expect(store.update).not.toHaveBeenCalled()
  })

  it.each([
    { ...ready, status: 'available' },
    { ...ready, status: 'available', sites: [ready.sites[0], 'Mercy General'] },
  ])('reveals real counts for $sites and saves the namespaced browser connection', (vendor) => {
    const cycle = desk.current!
    const count = cycle.run.shifts.filter(({ shift }) => vendor.sites.includes(shift.fac.name)).length
    expect(count).toBeGreaterThan(0)
    const modal = mount(vendor)
    modal.render()
    modal.signIn()
    let html = modal.render()
    expect(textContent(html)).toContain('Signing in as payroll.ops@demo.hypertrack.com')
    expect(html).toContain('class="tag blue">Syncing')
    expect(html).not.toContain('Granting read-only access')
    html = modal.advance(800)
    expect(html).toContain('Granting read-only access to time entries')
    expect(html).not.toContain('Discovering worksites')
    html = modal.advance(800)
    expect(textContent(html)).toContain(`Discovering worksites · ${vendor.sites.length} found`)
    expect(html).not.toContain('Pulling punches')
    html = modal.advance(800)
    expect(textContent(html)).toContain(`Pulling punches for ${cycle.label} · ${count} records`)
    expect(html.match(/class="spinner"/g)).toHaveLength(1)
    expect(html.match(/class="lucide lucide-check"/g)).toHaveLength(3)
    expect(store.update).not.toHaveBeenCalled()
    // Another connection can finish while this dialog is syncing.
    store.current = { ...store.current!, connections: { ...store.current!.connections, 'dest:other': { status: 'connected' } } }
    modal.render()
    html = modal.advance(800)
    expect(textContent(html)).toContain(`Connected · ${vendor.sites.length} ${vendor.sites.length === 1 ? 'site' : 'sites'} · ${count} punches pulled`)
    expect(store.update).toHaveBeenCalledTimes(1)
    expect(store.current!.connections[vendorKey(vendor)]).toEqual({
      status: 'connected', method: 'browser', lastSync: new Date(now.valueOf() + 3200).toISOString(),
    })
    expect(store.current!.connections['source:existing']).toEqual({ status: 'connected', method: 'api' })
    expect(store.current!.connections['dest:other']).toEqual({ status: 'connected' })
    expect(store.current!.connections[vendor.id]).toBeUndefined()
    expect(overlay.close).not.toHaveBeenCalled()
    expect(modal.onDone).not.toHaveBeenCalled()
    modal.advance(699)
    expect(modal.onDone).not.toHaveBeenCalled()
    modal.advance(1)
    expect(overlay.close).toHaveBeenCalledTimes(1)
    expect(overlay.toast).toHaveBeenCalledWith(`${vendor.name} connected`)
    expect(modal.onDone).toHaveBeenCalledTimes(1)
  })

  it('reports zero sites and records when an available vendor has no assigned sites', () => {
    const modal = mount(available)
    modal.render()
    modal.signIn()
    expect(textContent(modal.advance(1600))).toContain('Discovering worksites · 0 found')
    expect(textContent(modal.advance(800))).toContain(`Pulling punches for ${desk.current!.label} · 0 records`)
    expect(textContent(modal.advance(800))).toContain('Connected · 0 sites · 0 punches pulled')
    expect(store.current!.connections[vendorKey(available)]?.method).toBe('browser')
  })

  it('cancels connection writes and completion callbacks when unmounted during sync', () => {
    const modal = mount(ready)
    modal.render()
    modal.signIn()
    modal.advance(1600)
    unmount()
    vi.runAllTimers()
    expect(store.update).not.toHaveBeenCalled()
    expect(overlay.close).not.toHaveBeenCalled()
    expect(overlay.toast).not.toHaveBeenCalled()
    expect(modal.onDone).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the pending close and toast when unmounted after connecting', () => {
    const modal = mount(ready)
    modal.render()
    modal.signIn()
    modal.advance(3200)
    expect(store.update).toHaveBeenCalledTimes(1)
    unmount()
    vi.runAllTimers()
    expect(overlay.close).not.toHaveBeenCalled()
    expect(overlay.toast).not.toHaveBeenCalled()
    expect(modal.onDone).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
