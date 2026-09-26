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
  it('waits for the real Sample pipeline before showing Connected in the journey', async () => {
    let finish!: (result: { files: { entryCount: number }[]; cycles: string[] }) => void
    sample.connectSource.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const modal = mount({ ...ready, set: 2 }, true)
    expect(modal.render()).toContain('>Sample</span>')
    modal.signIn()
    expect(modal.advance(3200)).toContain('Syncing')
    expect(store.update).not.toHaveBeenCalled()
    expect(sample.connectSource).toHaveBeenCalledWith({ set: 2, system: ready.name, site: ready.sites[0] })
    finish({ files: [{ entryCount: 3000 }, { entryCount: 189 }], cycles: [closing().id] })
    await Promise.resolve()
    const connected = textContent(modal.render())
    expect(connected).toContain('Connected')
    expect(connected).toContain('3,189 time entries pulled')
    expect(store.current!.connections[vendorKey(ready)]?.sample).toBe(true)
    modal.advance(700)
    expect(overlay.toast).toHaveBeenCalledWith(`${ready.name} connected · Sample`)
    expect(modal.onDone).toHaveBeenCalledOnce()
  })

  it('keeps a failed Sample connection retryable and does not save Connected', async () => {
    sample.connectSource.mockRejectedValueOnce(new Error('Sample connection unavailable'))
    const modal = mount({ ...ready, set: 2 }, true)
    modal.render()
    modal.signIn()
    modal.advance(3200)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    const html = modal.render()
    expect(html).toContain('Sample connection unavailable')
    expect(html).toContain('Sign In')
    expect(store.update).not.toHaveBeenCalled()
    expect(modal.onDone).not.toHaveBeenCalled()
  })

  it('shows an explicitly fake, read-only account with a vendor-derived URL', () => {
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
    expect(html).not.toContain('API key')
    expect(store.update).not.toHaveBeenCalled()
  })

  it.each([
    { ...ready, status: 'available' },
    { ...ready, status: 'available', sites: [ready.sites[0], 'Mercy General'] },
  ])('reveals real counts for $sites and saves the namespaced browser connection', (vendor) => {
    const cycle = closing()
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
    expect(textContent(html)).toContain('Discovering worksites')
    expect(textContent(html)).not.toMatch(/Discovering worksites ·/)
    expect(html).not.toContain('Pulling time entries')
    html = modal.advance(800)
    expect(textContent(html)).toContain(`Pulling time entries for ${cycle.label}`)
    expect(textContent(html)).not.toMatch(/records|punches/)
    expect(html.match(/class="spinner"/g)).toHaveLength(2)
    expect(html.match(/class="lucide lucide-check"/g)).toHaveLength(3)
    expect(store.update).not.toHaveBeenCalled()
    // Another connection can finish while this dialog is syncing.
    store.current = { ...store.current!, connections: { ...store.current!.connections, 'dest:other': { status: 'connected' } } }
    modal.render()
    html = modal.advance(800)
    expect(textContent(html)).toContain(`Connected · ${vendor.sites.length} ${vendor.sites.length === 1 ? 'site' : 'sites'} · ${count.toLocaleString()} time entries pulled`)
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

  it('counts every worksite and record when a vendor has no assigned sites (the sample brings its own clients)', () => {
    const modal = mount(available)
    const sites = new Set(closing().week.map(shift => shift.fac.name)).size
    const records = closing().run.shifts.length
    modal.render()
    modal.signIn()
    expect(textContent(modal.advance(1600))).toContain('Discovering worksites')
    expect(textContent(modal.advance(800))).toContain(`Pulling time entries for ${closing().label}`)
    expect(textContent(modal.advance(800))).toContain(`Connected · ${sites} sites · ${records.toLocaleString()} time entries pulled`)
    expect(store.current!.connections[vendorKey(available)]?.method).toBe('browser')
  })

  it('names the week the connection loads (D11): the closing cycle by default, or the card\'s own cycle', () => {
    const [inProgress, needsReview] = desk.cycles
    expect(inProgress.status).toBe('in-progress')
    let modal = mount(ready)
    modal.render()
    modal.signIn()
    let text = textContent(modal.advance(2400))
    expect(text).toContain(`Pulling time entries for ${needsReview.label}`)
    expect(text).not.toContain(inProgress.label)
    unmount()
    hooks.slots = []
    modal = mount(ready, false, inProgress.id)
    modal.render()
    modal.signIn()
    text = textContent(modal.advance(2400))
    expect(text).toContain(`Pulling time entries for ${inProgress.label}`)
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
