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
const desk = vi.hoisted(() => ({ cycles: [] as DeskCycle[] }))
const store = vi.hoisted(() => ({ current: undefined as Onboarding | undefined, update: vi.fn() }))
const overlay = vi.hoisted(() => ({ close: vi.fn(), toast: vi.fn() }))
const sample = vi.hoisted(() => ({ connectSource: vi.fn() }))

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
  useDesk: () => ({ cycles: desk.cycles, current: desk.cycles[0], byId: (id: string) => desk.cycles.find(cycle => cycle.id === id) }),
}))
vi.mock('@/components/shell/Overlay', () => ({ useOverlay: () => overlay }))
vi.mock('@/lib/data', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/data')>(), connectSource: sample.connectSource }))

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

// The cycle a connection loads: the closing (needs-review) week, never the one still in progress.
const closing = () => desk.cycles.find(cycle => cycle.status === 'needs-review')!

function mount(vendor: Vendor, loadSample = false, cycleId?: string) {
  const onDone = vi.fn()
  let tree: ReactNode
  const render = () => {
    hooks.cursor = 0
    tree = ConnectModal({ vendor, onDone, loadSample, cycleId })
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
  desk.cycles = buildCycles(DEFAULTS, now)
})
afterEach(() => {
  unmount()
  vi.useRealTimers()
})

describe('simulated browser connection', () => {
  it('starts the Sample request on click and shows a skeleton in the mounted frame until it resolves', async () => {
    let finish!: (result: { files: { entryCount: number }[]; cycles: string[] }) => void
    sample.connectSource.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const modal = mount({ ...ready, set: 2 }, true)
    expect(modal.render()).toContain('Connect UKG')
    modal.signIn()
    expect(sample.connectSource).toHaveBeenCalledWith({ set: 2, system: ready.name, site: ready.sites[0] })
    expect(vi.getTimerCount()).toBe(0)
    const pending = modal.render()
    expect(pending).toContain('Connect UKG')
    expect(pending).toContain('data-skeleton="card"')
    expect(pending).toContain('aria-busy="true"')
    expect(pending).not.toMatch(/Syncing|Signing in/)
    // The only spinner is the Sign In button's own Connecting… label.
    expect(pending).toContain('data-action-state="pending"')
    expect(pending.match(/class="spinner"/g)).toHaveLength(1)
    expect(pending).not.toContain('Connected ·')
    expect(store.update).not.toHaveBeenCalled()
    // Concurrent connections are retained when this network operation finishes.
    store.current = { ...store.current!, connections: { ...store.current!.connections, 'dest:other': { status: 'connected' } } }
    modal.render()
    finish({ files: [{ entryCount: 3000 }, { entryCount: 189 }], cycles: [closing().id] })
    await Promise.resolve()
    const connected = textContent(modal.render())
    expect(connected).toContain('3,189 time entries pulled')
    expect(connected).toContain(closing().label)
    expect(store.current!.connections[vendorKey(ready)]).toMatchObject({ status: 'connected', method: 'browser', sample: true })
    expect(store.current!.connections['source:existing']).toEqual({ status: 'connected', method: 'api' })
    expect(store.current!.connections['dest:other']).toEqual({ status: 'connected' })
    expect(modal.render()).not.toContain('data-skeleton')
    modal.advance(700)
    expect(overlay.close).toHaveBeenCalledOnce()
    expect(overlay.toast).toHaveBeenCalledWith(`${ready.name} connected · Sample`)
    expect(modal.onDone).toHaveBeenCalledOnce()
  })

  it('keeps a failed Sample connection retryable without recording Connected', async () => {
    sample.connectSource.mockRejectedValueOnce(new Error('Sample connection unavailable'))
    const modal = mount({ ...ready, set: 2 }, true)
    modal.render()
    modal.signIn()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    const html = modal.render()
    expect(html).toContain('Sample connection unavailable')
    expect(html).toContain('Sign In')
    expect(store.update).not.toHaveBeenCalled()
    expect(modal.onDone).not.toHaveBeenCalled()
    sample.connectSource.mockResolvedValueOnce({ files: [], cycles: [] })
    modal.signIn()
    await Promise.resolve()
    expect(store.update).toHaveBeenCalledOnce()
    expect(modal.render()).toContain('Connected')
  })

  it('shows an explicitly fake account with a vendor-derived URL before sign-in', () => {
    const modal = mount(ready)
    const html = modal.render()
    expect(html).toContain('ukg.com/auth/login')
    expect(html).toContain('Sign in to UKG')
    expect(html).toContain('payroll.ops@demo.hypertrack.com')
    expect(html).toContain('••••••••')
    expect(html).toContain('>Demo</span>')
    expect(html).toContain('Demo connection · use placeholder credentials')
    expect(html).toContain('primary')
    expect(html).not.toMatch(/<(input|textarea|form)\b|contenteditable/i)
    expect(store.update).not.toHaveBeenCalled()
  })

  it.each([
    { ...ready, status: 'available' },
    { ...ready, status: 'available', sites: [ready.sites[0], 'Mercy General'] },
    available,
  ])('shows cached cycle counts immediately without simulated progress for $sites', vendor => {
    const cycle = closing()
    const count = cycle.run.shifts.filter(({ shift }) => !vendor.sites.length || vendor.sites.includes(shift.fac.name)).length
    const sites = vendor.sites.length || new Set(cycle.week.map(shift => shift.fac.name)).size
    const modal = mount(vendor)
    modal.render()
    modal.signIn()
    const html = modal.render()
    expect(textContent(html)).toContain(`Connected · ${sites} ${sites === 1 ? 'site' : 'sites'} · ${count.toLocaleString()} time entries pulled`)
    expect(html).not.toContain('data-skeleton')
    expect(sample.connectSource).not.toHaveBeenCalled()
    expect(store.current!.connections[vendorKey(vendor)]).toEqual({ status: 'connected', method: 'browser', lastSync: now.toISOString() })
    expect(store.current!.connections[vendor.id]).toBeUndefined()
    expect(modal.onDone).not.toHaveBeenCalled()
    modal.advance(700)
    expect(overlay.toast).toHaveBeenCalledWith(`${vendor.name} connected`)
    expect(modal.onDone).toHaveBeenCalledOnce()
  })

  it('names the closing cycle by default and the explicitly selected cycle when given', () => {
    const [inProgress, needsReview] = desk.cycles
    let modal = mount(ready)
    modal.render()
    modal.signIn()
    expect(textContent(modal.render())).toContain(needsReview.label)
    expect(textContent(modal.render())).not.toContain(inProgress.label)
    unmount()
    hooks.slots = []
    modal = mount(ready, false, inProgress.id)
    modal.render()
    modal.signIn()
    expect(textContent(modal.render())).toContain(inProgress.label)
  })

  it('does not write connection state or completion callbacks after unmount during the request', async () => {
    let finish!: (result: { files: []; cycles: [] }) => void
    sample.connectSource.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const modal = mount(ready, true)
    modal.render()
    modal.signIn()
    expect(modal.render()).toContain('data-skeleton')
    unmount()
    finish({ files: [], cycles: [] })
    await Promise.resolve()
    vi.runAllTimers()
    expect(store.update).not.toHaveBeenCalled()
    expect(overlay.close).not.toHaveBeenCalled()
    expect(overlay.toast).not.toHaveBeenCalled()
    expect(modal.onDone).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the pending completion callback when unmounted after connecting', () => {
    const modal = mount(ready)
    modal.render()
    modal.signIn()
    expect(store.update).toHaveBeenCalledOnce()
    unmount()
    vi.runAllTimers()
    expect(overlay.close).not.toHaveBeenCalled()
    expect(overlay.toast).not.toHaveBeenCalled()
    expect(modal.onDone).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
