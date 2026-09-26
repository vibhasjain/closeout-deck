import { Children, createElement, isValidElement, type DependencyList, type EffectCallback, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batchPreview, ConnectForm, connectTarget, DisputeForm, disputePrefill, FormCard, gapRows, GapsForm, SendForm, waitingPaidAsReported } from './FormCard'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import type { CyclePayload, CycleSummary } from '@/lib/data'
import type { JourneyDispute, JourneyThread } from '@/lib/journey'
import fixture from '@/lib/fixtures/server-cycle.json'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], pending: [] as Array<() => void> }))
const store = vi.hoisted(() => ({ state: undefined as Onboarding | undefined, threads: [] as JourneyThread[] }))
const api = vi.hoisted(() => ({ askGaps: vi.fn(), sendPayroll: vi.fn(), downloadBatch: vi.fn(), getDisputes: vi.fn(), getThreads: vi.fn(), createDispute: vi.fn(), simulateDispute: vi.fn(), resolveDispute: vi.fn(), useJourneyCycle: vi.fn() }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T,>(initial: T | (() => T)) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[slot], (next: T | ((previous: T) => T)) => { hooks.slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[slot] as T) : next }]
  },
  useEffect: (effect: EffectCallback, dependencies?: DependencyList) => {
    const slot = hooks.cursor++
    const previous = hooks.slots[slot] as { dependencies?: DependencyList; cleanup?: () => void } | undefined
    if (previous && dependencies?.length === previous.dependencies?.length && dependencies?.every((value, index) => Object.is(value, previous.dependencies![index]))) return
    hooks.slots[slot] = { dependencies }
    hooks.pending.push(() => { previous?.cleanup?.(); (hooks.slots[slot] as { cleanup?: () => void }).cleanup = effect() || undefined })
  },
}))
vi.mock('@/lib/onboarding', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/onboarding')>(), useOnboarding: () => [store.state, vi.fn()] }))
const chat = vi.hoisted(() => ({ postToChat: vi.fn() }))
vi.mock('@/lib/chatBus', () => chat)
vi.mock('@/lib/journey', () => ({ ...api, refreshThreads: vi.fn(), useJourneyThreads: () => ({ threads: store.threads, loaded: true, loading: false, error: null }) }))
vi.mock('@/components/ConnectMethod', () => ({ ConnectMethod: ({ vendor }: { vendor: { set: number; name: string; sites: string[] } }) => createElement('div', { 'data-set': vendor.set, 'data-site': vendor.sites[0] ?? '', 'data-system': vendor.name }, 'How do you want to connect?') }))
vi.mock('@/components/Thread', () => ({ JourneyThreadView: ({ thread }: { thread: JourneyThread }) => createElement('div', { 'aria-label': 'Dispute conversation' }, thread.counterparty.name) }))

const next = (kind: NonNullable<CyclePayload['nextStep']>['kind']): NonNullable<CyclePayload['nextStep']> => ({ kind, label: kind, detail: 'Review open time entries', counts: { missingSets: 0, gaps: 0, openGroups: kind === 'review' ? 2 : 0 } })
const payload = (): CyclePayload => ({ ...structuredClone(fixture.payload) as CyclePayload, decisions: [], batch: null, nextStep: next('send') })
const gapsPayload = (): CyclePayload => { const cycle = { ...payload(), nextStep: next('chase_missing') }; cycle.intake.expected = [{ worker: 'Cam Li', client: 'Pacific Cold Storage', day: 0, source: cycle.intake.sources[0].id, onSite: 480 }]; cycle.intake.received = []; return cycle }
const batch = { id: 'batch-1', cycleId: fixture.payload.cycle.id, destination: 'ADP', workers: 10, gross: 1200, held: 1, createdAt: '2026-09-25T12:00:00Z' }
const thread: JourneyThread = { id: 'thread-1', cycleId: fixture.payload.cycle.id, counterparty: { kind: 'worker', name: 'Ana Peña' }, status: 'open', createdAt: '2026-09-25T12:00:00Z',
  messages: [{ id: 'message-1', threadId: 'thread-1', dir: 'out', text: 'Please confirm the missing time.', status: 'not_sent_demo', at: '2026-09-25T12:00:00Z' }] }
const dispute: JourneyDispute = { id: 'dispute-1', cycleId: fixture.payload.cycle.id, worker: 'Ana Peña', description: 'Two missing hours', source: 'simulated', status: 'open', createdAt: '2026-09-25T12:00:00Z' }

interface Props { children?: ReactNode; onClick?: (event?: { preventDefault(): void }) => unknown; onChange?: (event: { target: { value: string; checked?: boolean; files?: File[] } }) => unknown; 'aria-label'?: string; disabled?: boolean; className?: string }
function elements(node: ReactNode): Array<{ props: Props }> {
  return Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
}
function mount(render: () => ReactNode) {
  let tree: ReactNode
  const draw = () => { hooks.cursor = 0; tree = render(); const html = renderToStaticMarkup(tree); hooks.pending.splice(0).forEach(effect => effect()); return html }
  draw()
  return {
    draw,
    ready: async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); return draw() },
    click: async (label: string) => {
      await Promise.resolve(); await Promise.resolve(); draw()
      const target = elements(tree).find(element => element.props.children === label && element.props.onClick)
      expect(target, `button ${label}`).toBeDefined()
      expect(target!.props.disabled).not.toBe(true)
      await target!.props.onClick!({ preventDefault: vi.fn() })
      // Event wrappers intentionally return void; finish their async mutation before rerendering.
      await Promise.resolve(); await Promise.resolve()
      return draw()
    },
    change: (label: string, value: string) => {
      const target = elements(tree).find(element => element.props['aria-label'] === label)
      expect(target).toBeDefined()
      target!.props.onChange!({ target: { value } })
      return draw()
    },
    upload: async (file: File) => {
      const target = elements(tree).find(element => element.props['aria-label'] === 'Upload dispute source')
      expect(target).toBeDefined()
      await target!.props.onChange!({ target: { value: file.name, files: [file] } })
      await Promise.resolve(); await Promise.resolve()
      return draw()
    },
    fields: () => elements(tree),
  }
}
const primaryCount = (html: string) => (html.match(/class="btn primary"/g) ?? []).length

beforeEach(() => {
  vi.clearAllMocks(); hooks.cursor = 0; hooks.slots = []; hooks.pending = []
  api.getDisputes.mockResolvedValue({ disputes: [] }); api.getThreads.mockResolvedValue({ threads: [] })
  store.state = { ...DEFAULTS, discovery: { ...DEFAULTS.discovery, payroll: 'ADP' } }
  store.threads = []
})

describe('journey connect form', () => {
  it('renders before a cycle has a run and selects the first missing set from the list row', () => {
    const row: CycleSummary = { ...payload().cycle, sample: false, runAt: null, totals: null, findings: 0, counts: { set1: 4, set2: 0, set3: 0 } }
    api.useJourneyCycle.mockReturnValue({ row, cycle: undefined, loading: false, error: null })
    const html = renderToStaticMarkup(FormCard({ form: 'connect', cycleId: row.id }))
    expect(html).toContain('How do you want to connect?')
    expect(html).toContain('data-set="2"')
    expect(html).not.toContain('Cycle unavailable')
    expect(renderToStaticMarkup(ConnectForm({}))).toContain('data-set="1"')
  })

  it('a used connect card keeps the set it loaded while the data refreshes, so it can confirm the load', () => {
    const cycle = payload()
    cycle.counts = { set1: 0, set2: 0, set3: 0 }
    let current = cycle
    const card = mount(() => ConnectForm({ cycle: current }))
    expect(card.draw()).toContain('data-set="1"')
    const method = (tree: ReturnType<typeof ConnectForm>) => elements(tree).find(element => 'onConnect' in element.props) as unknown as { props: { onConnect(): void } }
    hooks.cursor = 0
    method(ConnectForm({ cycle: current })).props.onConnect()
    current = { ...cycle, counts: { set1: 6282, set2: 0, set3: 0 } }
    expect(card.draw()).toContain('data-set="1"')
    // A fresh card (a later next-step reply) targets the next missing set.
    hooks.slots = []
    expect(renderToStaticMarkup(ConnectForm({ cycle: current }))).toContain('data-set="2"')
  })
  it("ConnectForm's set choice when set 3 is loaded targets the client still missing a set, not set 3 again (D2)", () => {
    const cycle = payload()
    cycle.counts = { set1: 3189, set2: 3240, set3: 6290 }
    cycle.sites = [...cycle.sites, { ...cycle.sites[0], key: 'lonestar packaging', name: 'Lonestar Packaging' }]
    cycle.gaps = [{ id: 'set_missing:lonestar packaging|2', kind: 'set_missing', key: 'lonestar packaging|2', count: 3189, blocks: ['SRC-VMS-01'], ask: "Can you send Lonestar Packaging's client-approved hours?" }]
    const html = renderToStaticMarkup(ConnectForm({ cycle }))
    expect(html).toContain('data-set="2"')
    expect(html).toContain('data-site="Lonestar Packaging"')
    expect(html).toContain('data-system="ADP"')
    expect(connectTarget(cycle)).toEqual({ set: 2, site: 'Lonestar Packaging' })
    // Nothing missing: re-offer client-approved, never a generic "Time entries" system.
    cycle.gaps = []
    expect(connectTarget(cycle)).toEqual({ set: 2, site: '' })
    expect(renderToStaticMarkup(ConnectForm({ cycle }))).not.toContain('data-system="Time entries"')
    // An explicit worker or client ask still wins; with every set in, location is never the default (D2v).
    expect(connectTarget(cycle, undefined, { set: 1 })).toEqual({ set: 1, site: '' })
    expect(connectTarget(cycle, undefined, { set: 3 })).toEqual({ set: 2, site: '' })
    const picker = renderToStaticMarkup(ConnectForm({ cycle, prefill: { set: 3 } }))
    expect(picker).toContain('All three sets are in for this cycle. Pick one to load again.')
    expect(picker).toContain('data-set="2"')
    for (const label of ['Worker-reported', 'Client-approved', 'Location']) expect(picker).toContain(`>${label}</button>`)
    // While a set is still empty, an asked location stays the target.
    expect(connectTarget({ ...cycle, counts: { ...cycle.counts, set3: 0 } }, undefined, { set: 3 })).toEqual({ set: 3, site: '' })
  })
})

describe('journey send form', () => {
  it('previews only payable workers and gross, excluding partially paid held entries', () => {
    const cycle = payload()
    cycle.results.find(row => row.held)!.pay = 90
    const approved = cycle.results.filter(row => !row.held)
    expect(batchPreview(cycle)).toEqual({ workers: new Set(cycle.week.map(row => row.worker)).size,
      gross: approved.reduce((sum, row) => sum + row.pay, 0), held: cycle.results.filter(row => row.held).length })
    expect(cycle.results.some(row => row.held && row.pay > 0)).toBe(true)
  })

  it('recomputes dismissed premiums, retains held-only workers and adds rounded next-cycle adjustments', () => {
    const cycle = payload()
    cycle.week = cycle.week.slice(0, 2)
    cycle.results = [{ ...cycle.results[0], held: false, pay: 180, rate: 20, rows: [{ ruleId: 'CA-MB-01', status: 'flag', note: 'Missing meal', effect: { premiumHours: 1 } }] },
      { ...cycle.results[1], held: true, pay: 0, rows: [{ ruleId: 'CS-OVLP', status: 'held', note: 'Overlapping time', effect: { holdAll: true } }] }]
    cycle.decisions = [{ id: 'd1', cycleId: cycle.cycle.id, groupId: 'CA-MB-01', shiftIds: [], decision: 'dismissed', reason: 'Confirmed meal', by: 'user', at: '2026-09-25T12:00:00Z' }]
    const adjustment = { ...dispute, worker: 'New worker', status: 'adjusted' as const, adjustment: { hours: 2, amount: 40.005, next_cycle_id: cycle.cycle.id } }
    expect(batchPreview(cycle, [adjustment])).toEqual({ workers: 3, gross: 200.01, held: 1 })
    cycle.adjustments = [{ id: adjustment.id, cycleId: adjustment.cycleId, worker: adjustment.worker, hours: 2, amount: 40.005 }]
    expect(batchPreview(cycle)).toEqual({ workers: 3, gross: 200.01, held: 1 })
    // A separate history fetch must not count the same adjustment twice.
    expect(batchPreview(cycle, [adjustment])).toEqual({ workers: 3, gross: 200.01, held: 1 })
    cycle.adjustments = []
    expect(batchPreview(cycle, [adjustment])).toEqual({ workers: 2, gross: 160, held: 1 })
  })

  it('renders scoped adjustment totals immediately without requesting unrelated dispute history', () => {
    const cycle = payload()
    const base = batchPreview(cycle)
    cycle.adjustments = [{ id: 'adjustment-only-worker', cycleId: 'paid-cycle', worker: 'Adjustment-only worker', hours: 2, amount: 40.005 }]
    const form = mount(() => SendForm({ cycle }))
    const html = form.draw()
    expect(html).toContain((base.gross + 40.01).toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
    expect(html).toContain(`<dd class="mono tabular-nums">${base.workers + 1}</dd>`)
    expect(html).not.toContain('data-skeleton="number"')
    expect(form.fields().find(element => element.props.children === 'Send to Payroll' && element.props.onClick)?.props.disabled).toBe(false)
    expect(api.getDisputes).not.toHaveBeenCalled()
  })

  it('retains the dispute-history loading and retry path only for legacy payloads', async () => {
    api.getDisputes.mockRejectedValueOnce(new Error('Preview history unavailable'))
    const cycle = payload()
    const form = mount(() => SendForm({ cycle }))
    expect(form.draw()).toContain('data-skeleton="number"')
    expect(await form.ready()).toContain('Preview history unavailable')
    expect(form.fields().find(element => element.props.children === 'Send to Payroll' && element.props.onClick)?.props.disabled).toBe(true)
    await form.click('Retry preview')
    expect(await form.ready()).not.toContain('Preview history unavailable')
    expect(form.fields().find(element => element.props.children === 'Send to Payroll' && element.props.onClick)?.props.disabled).toBe(false)
  })

  it.each(['get_timesheets', 'chase_missing', 'review', 'send', 'done'] as const)('is black only when nextStep is send: %s', kind => {
    const cycle = { ...payload(), nextStep: next(kind) }
    const form = mount(() => SendForm({ cycle }))
    const html = form.draw()
    expect(primaryCount(html)).toBe(kind === 'send' ? 1 : 0)
    expect(html).toContain('Send to Payroll')
    if (kind === 'review') expect(html).toContain('2 issues to review')
  })

  it('N7: says plainly that entries still waiting for evidence are paid as reported, without blocking Send', () => {
    const cycle = payload()
    const vms = { ruleId: 'SRC-VMS-01', status: 'flag' as const, kindDefault: 'det' as const, note: 'The ATS has 8h, but the client approved 7h in their own timekeeping.' }
    cycle.results = cycle.results.map((result, index) => index === 0 ? { ...result, rows: [...result.rows, vms], flagged: true }
      : index === 1 ? { ...result, rows: [...result.rows, vms], flagged: true, held: true } : result)
    // The held entry is waiting too, but it is excluded from pay, so only one is paid as reported.
    const waiting = waitingPaidAsReported(cycle, store.state!)
    expect(waiting).toBe(1)
    const html = mount(() => SendForm({ cycle })).draw()
    expect(html).toContain(`${waiting} time ${waiting === 1 ? 'entry' : 'entries'} still waiting for evidence ${waiting === 1 ? 'is' : 'are'} paid as reported; any correction lands as an adjustment next pay run.`)
    expect(primaryCount(html)).toBe(1)
    expect(mount(() => SendForm({ cycle: { ...cycle, batch } })).draw()).not.toContain('still waiting for evidence')
  })
  it('posts the destination and gives the authenticated CSV download after 201', async () => {
    api.sendPayroll.mockResolvedValueOnce({ status: 201, batch, csvUrl: '/data/batches/batch-1/csv' })
    const cycle = payload()
    const form = mount(() => SendForm({ cycle }))
    form.change('Payroll destination', 'ADP')
    const html = await form.click('Send to Payroll')
    expect(api.sendPayroll).toHaveBeenCalledWith(cycle.cycle.id, { destination: 'ADP' })
    expect(html).toContain('Sent to ADP')
    expect(html).toContain('>Demo</span>')
    expect(html).toContain('Download CSV')
    expect(primaryCount(html)).toBe(0)
    await form.click('Download CSV')
    expect(api.downloadBatch).toHaveBeenCalledWith(batch.id, '/data/batches/batch-1/csv')
  })

  it('shows the existing batch on 409 and removes the send action', async () => {
    api.sendPayroll.mockResolvedValueOnce({ status: 409, batch })
    const form = mount(() => SendForm({ cycle: payload() }))
    const html = await form.click('Send to Payroll')
    expect(html).toContain('This batch already exists.')
    expect(html).toContain('Sent to ADP')
    expect(html).toContain('Download CSV')
    expect(form.fields().some(element => element.props.children === 'Send to Payroll' && element.props.onClick)).toBe(false)
    expect(api.sendPayroll).toHaveBeenCalledTimes(1)
  })

  it('lists 422 reasons and open items without adding force to the request', async () => {
    api.sendPayroll.mockResolvedValueOnce({ status: 422, reason: 'Review is still open', nextStep: next('review'), open: { missingSets: [2], gaps: ['Pacific Cold Storage|Cam Li|0'], groups: ['CA-MB-01'] } })
    const cycle = { ...payload(), nextStep: next('review') }
    const form = mount(() => SendForm({ cycle }))
    const html = await form.click('Send to Payroll')
    expect(html).toContain('Review is still open')
    expect(html).toContain('Missing time: Pacific Cold Storage · Cam Li · 0')
    expect(html).toContain('Missing set 2')
    expect(html).toContain('Review CA-MB-01')
    expect(api.sendPayroll).toHaveBeenCalledWith(cycle.cycle.id, {})
    expect(primaryCount(html)).toBe(0)
  })

  it('uses the latest shared cycle after a 422 so resolved items make Send black', async () => {
    api.sendPayroll.mockResolvedValueOnce({ status: 422, reason: 'Review is still open', nextStep: next('review'), open: { missingSets: [], gaps: [], groups: ['CA-MB-01'] } })
    let cycle = { ...payload(), nextStep: next('review') }
    const form = mount(() => SendForm({ cycle }))
    expect(primaryCount(await form.click('Send to Payroll'))).toBe(0)
    cycle = { ...cycle, nextStep: next('send') }
    const updated = form.draw()
    expect(primaryCount(updated)).toBe(1)
    expect(updated).not.toContain('Review is still open')
    expect(updated).not.toContain('Review CA-MB-01')
  })

  it('retains the 422 reason and specific open items when the send refresh replaces the cycle object', async () => {
    let cycle = { ...payload(), nextStep: next('review') }
    api.sendPayroll.mockImplementationOnce(async () => {
      cycle = structuredClone(cycle)
      return { status: 422, reason: 'Review is still open', nextStep: next('review'), open: { missingSets: [2], gaps: ['Pacific Cold Storage|Cam Li|0'], groups: ['CA-MB-01', 'FED-RR-01'] } }
    })
    const form = mount(() => SendForm({ cycle }))
    const html = await form.click('Send to Payroll')
    for (const item of ['Review is still open', 'Missing set 2', 'Missing time: Pacific Cold Storage · Cam Li · 0', 'Review CA-MB-01', 'Review FED-RR-01']) expect(html).toContain(item)
    cycle = structuredClone(cycle)
    expect(form.draw()).toContain('Review FED-RR-01')
  })
})

describe('journey gaps form', () => {
  it('disables never-contact recipients and preserves server gap IDs', () => {
    const cycle = gapsPayload()
    store.state = { ...store.state!, neverContact: [' maria castillo '] }
    expect(gapRows(cycle, store.state.neverContact!)).toEqual([{ id: 'Pacific Cold Storage|Cam Li|0', worker: 'Cam Li', site: 'Pacific Cold Storage', day: 0, kind: 'site', name: 'Maria Castillo', blocked: true }])
    const form = mount(() => GapsForm({ cycle }))
    const checkbox = form.fields().find(element => element.props['aria-label'] === 'Ask Maria Castillo about Cam Li · Pacific Cold Storage · Day 1')
    expect(checkbox?.props.disabled).toBe(true)
    expect(form.draw()).toContain('Never Contact')
    // N6: nobody askable is explained, never a black "Ask 0 people".
    expect(form.draw()).toContain('Everyone left to ask is on your never-contact list.')
    expect(form.draw()).not.toContain('Ask 0 people')
    expect(primaryCount(form.draw())).toBe(0)
  })
  it('N6: a cycle with no missing time says there is nobody to ask, with no button', () => {
    const cycle = gapsPayload()
    cycle.intake.received = cycle.intake.expected.map(entry => `${entry.client}|${entry.worker}|${entry.day}`)
    const html = mount(() => GapsForm({ cycle })).draw()
    expect(html).toContain('No time entries are missing client-approved hours, so there is nobody to ask.')
    expect(html).not.toMatch(/Ask \d+ (person|people)/)
    expect(primaryCount(html)).toBe(0)
  })
  it('N13: a chase card from an earlier step stays usable in outline with a quiet note', () => {
    const cycle = { ...gapsPayload(), nextStep: next('review') }
    const html = mount(() => GapsForm({ cycle })).draw()
    expect(html).toContain('Ask 1 person')
    expect(primaryCount(html)).toBe(0)
    expect(html).toContain('This cycle has moved on: the next step is review.')
  })

  it('posts selected gap IDs and displays skipped people returned by the server', async () => {
    const cycle = gapsPayload()
    api.askGaps.mockResolvedValueOnce({ threads: [thread], skipped: ['Maria Castillo'] })
    const form = mount(() => GapsForm({ cycle }))
    const html = await form.click('Ask 1 person')
    expect(api.askGaps).toHaveBeenCalledWith(cycle.cycle.id, { gapIds: ['Pacific Cold Storage|Cam Li|0'] })
    expect(html).toContain('Not Sent · Demo')
    expect(html).toContain('Skipped: Maria Castillo')
    expect(html).toContain('Never Contact')
    expect(primaryCount(html)).toBe(0)
  })

  it('matches server recipient rules and only removes reconciled or explicitly closed gaps', () => {
    const cycle = gapsPayload()
    const id = 'Pacific Cold Storage|Cam Li|0'
    expect(gapRows(cycle, ['Pacific Cold Storage'])[0].blocked).toBe(true)
    expect(gapRows(cycle, ['Cam Li'])[0].blocked).toBe(false)
    expect(gapRows(cycle, [], { [`${cycle.cycle.id}:${id}`]: { reason: 'Confirmed', at: '2026-09-25T12:00:00Z' } })).toEqual([])
    expect(gapRows(cycle, [], { [`${cycle.cycle.id}:${id}`]: { reason: '  ', at: '2026-09-25T12:00:00Z' } })).toEqual([expect.objectContaining({ id })])
    for (const status of ['open', 'waiting', 'resolved'] as const) {
      expect(gapRows(cycle, [], {}, [{ ...thread, status, counterparty: { ...thread.counterparty, gapIds: [id] } }])).toEqual([
        expect.objectContaining({ id, asked: true }),
      ])
    }
    cycle.intake.expected[0].onSite = undefined
    expect(gapRows(cycle, ['Cam Li'])[0]).toMatchObject({ name: 'Cam Li', kind: 'worker', blocked: true })
  })

  it('limits each ask to 200 gaps, explains the remaining entry and can ask it next', async () => {
    const cycle = gapsPayload()
    const original = cycle.intake.expected[0]
    cycle.intake.expected = Array.from({ length: 201 }, (_, index) => ({ ...original, worker: `Worker ${index}` }))
    const ids = cycle.intake.expected.map(gap => `${gap.client}|${gap.worker}|${gap.day}`)
    const asked = { ...thread, counterparty: { kind: 'site' as const, name: 'Maria Castillo', gapIds: ids.slice(0, 200) } }
    api.askGaps.mockResolvedValueOnce({ threads: [asked], skipped: [] })
    api.askGaps.mockResolvedValueOnce({ threads: [{ ...asked, counterparty: { ...asked.counterparty, gapIds: ids } }], skipped: [] })
    const form = mount(() => GapsForm({ cycle }))
    expect(form.draw()).toContain('Ask about up to 200 time entries at a time. 1 more remain.')
    const checkboxes = form.fields().filter(element => element.props['aria-label']?.startsWith('Ask Maria Castillo about '))
    expect(checkboxes).toHaveLength(201)
    expect(checkboxes[200].props.disabled).toBe(true)
    await form.click('Ask 1 person')
    expect(api.askGaps.mock.calls[0][1]).toEqual({ gapIds: ids.slice(0, 200) })
    expect(form.draw()).toContain('Worker 200')
    await form.click('Ask 1 person')
    expect(api.askGaps.mock.calls[1][1]).toEqual({ gapIds: ids.slice(200) })
    expect(form.draw()).toContain('Asked · Still missing')
    expect(form.draw()).not.toContain('No missing time entries.')
    expect(form.fields().filter(element => element.props['aria-label']?.startsWith('Ask Maria Castillo about '))).toHaveLength(201)
    expect(primaryCount(form.draw())).toBe(0)
  })

  it('gives gaps for the same worker distinct labels with the site and day', () => {
    const cycle = gapsPayload()
    cycle.intake.expected.push({ ...cycle.intake.expected[0], day: 1 })
    const form = mount(() => GapsForm({ cycle }))
    const labels = form.fields().map(element => element.props['aria-label']).filter(label => label?.startsWith('Ask '))
    expect(labels).toEqual(['Ask Maria Castillo about Cam Li · Pacific Cold Storage · Day 1', 'Ask Maria Castillo about Cam Li · Pacific Cold Storage · Day 2'])
  })

  it('shows the asked state from persisted threads after a reload, with no local ask result (D18)', () => {
    const cycle = gapsPayload()
    cycle.intake.expected = Array.from({ length: 7 }, (_, index) => ({ ...cycle.intake.expected[0], worker: `Worker ${index}`, onSite: undefined }))
    const ids = cycle.intake.expected.map(gap => `${gap.client}|${gap.worker}|${gap.day}`)
    store.threads = ids.map((id, index) => ({ ...thread, id: `thread-${index}`, counterparty: { kind: 'worker' as const, name: `Worker ${index}`, gapIds: [id] },
      messages: [{ ...thread.messages[0], id: `message-${index}`, threadId: `thread-${index}` }] }))
    const html = mount(() => GapsForm({ cycle })).draw()
    expect(html).toContain('7 conversations created')
    expect(html).toContain('Not Sent · Demo')
    expect(html).toContain('Asked Worker 0')
    expect(html).toContain('Asked Worker 4')
    expect(html).not.toContain('Asked Worker 5')
    expect(html).toContain('and 2 more')
    // Every gap was asked: no new ask is offered as the next action.
    expect(primaryCount(html)).toBe(0)
  })

  it('gives a superseded chase card outline buttons only (H3)', () => {
    const cycle = gapsPayload()
    expect(primaryCount(mount(() => GapsForm({ cycle })).draw())).toBe(1)
    hooks.slots = []
    const stale = mount(() => GapsForm({ cycle, live: false })).draw()
    expect(stale).toContain('Ask 1 person')
    expect(primaryCount(stale)).toBe(0)
    expect(stale).toContain('A newer card below has the current step.')
  })

  it('marks a gap asked only from a real outbound message to a permitted recipient', () => {
    const cycle = gapsPayload()
    const conversation = { ...thread, counterparty: { kind: 'site' as const, name: 'Maria Castillo', gapIds: ['Pacific Cold Storage|Cam Li|0'] } }
    for (const messages of [[], [{ ...thread.messages[0], dir: 'in' as const }], [{ ...thread.messages[0], status: 'draft' as const }], [{ ...thread.messages[0], text: ' ' }]]) {
      expect(gapRows(cycle, [], {}, [{ ...conversation, messages }])[0].asked).toBeUndefined()
    }
    expect(gapRows(cycle, [], {}, [conversation])[0].asked).toBe(true)
    expect(gapRows(cycle, ['Maria Castillo'], {}, [conversation])[0].asked).toBeUndefined()
    expect(gapRows(cycle, ['Pacific Cold Storage'], {}, [conversation])[0].asked).toBeUndefined()
  })
})

describe('journey dispute form', () => {
  it('requires a sent batch independently of the next step', () => {
    const form = mount(() => DisputeForm({ cycle: payload() }))
    expect(form.draw()).toContain('Send this cycle to Payroll before opening a dispute.')
    expect(form.fields().some(element => element.props.children === 'Simulate a dispute')).toBe(false)
    expect(api.createDispute).not.toHaveBeenCalled()
    expect(api.simulateDispute).not.toHaveBeenCalled()
  })

  it('uses uploaded text as the real dispute description and marks the source upload', async () => {
    const cycle = { ...payload(), batch }
    const form = mount(() => DisputeForm({ cycle }))
    await form.ready()
    form.change('Worker', 'Ana Peña')
    await form.upload(new File(['Two missing hours'], 'worker-note.txt', { type: 'text/plain' }))
    api.createDispute.mockResolvedValueOnce({ dispute: { ...dispute, source: 'upload' }, thread })
    await form.click('Open dispute')
    expect(api.createDispute).toHaveBeenCalledWith({ cycleId: cycle.cycle.id, worker: 'Ana Peña', description: 'Two missing hours', source: 'upload' })
  })

  it('keeps one black action while switching between simulation and a pasted dispute', async () => {
    const cycle = { ...payload(), batch }
    const form = mount(() => DisputeForm({ cycle }))
    await form.ready()
    expect(primaryCount(form.draw())).toBe(1)
    form.change('Worker', 'Ana Peña')
    const ready = form.change('Dispute description', 'Two missing hours')
    expect(primaryCount(ready)).toBe(1)
    api.createDispute.mockResolvedValueOnce({ dispute: { ...dispute, source: 'paste' }, thread })
    const html = await form.click('Open dispute')
    expect(api.createDispute).toHaveBeenCalledWith({ cycleId: cycle.cycle.id, worker: 'Ana Peña', description: 'Two missing hours', source: 'paste' })
    expect(html).toContain('Dispute conversation')
    expect(primaryCount(html)).toBe(1)
  })

  it('simulates then resolves an adjustment through the contract', async () => {
    chat.postToChat.mockClear()
    api.simulateDispute.mockResolvedValueOnce({ dispute, thread })
    api.resolveDispute.mockResolvedValueOnce({ dispute: { ...dispute, status: 'adjusted' } })
    const cycle = { ...payload(), batch }
    const form = mount(() => DisputeForm({ cycle }))
    await form.click('Simulate a dispute')
    form.change('Adjustment hours', '2')
    form.change('Adjustment amount', '40')
    form.change('Resolution note', 'Location confirms the interval')
    const html = await form.click('Adjust')
    expect(api.simulateDispute).toHaveBeenCalledWith(cycle.cycle.id)
    expect(api.resolveDispute).toHaveBeenCalledWith(dispute.id, { decision: 'adjust', hours: 2, amount: 40, note: 'Location confirms the interval' })
    expect(html).toContain('Adjustment recorded for the next cycle’s export.')
    // N14: logging the dispute asks the agent for its recommendation in a visible, chipped turn.
    expect(chat.postToChat).toHaveBeenCalledOnce()
    expect(chat.postToChat.mock.calls[0][0]).toMatchObject({ contextChip: `Dispute from ${dispute.worker} · Sep 14 to 20`, context: { cycle: { id: cycle.cycle.id }, selection: { disputeId: dispute.id } } })
    expect(html).not.toContain('role="alert"')
    expect(primaryCount(html)).toBe(0)
  })

  it('disables zero-only adjustments and rejects without sending invalid adjustment fields', async () => {
    api.simulateDispute.mockResolvedValueOnce({ dispute, thread })
    api.resolveDispute.mockResolvedValueOnce({ dispute: { ...dispute, status: 'rejected' } })
    const cycle = { ...payload(), batch }
    const form = mount(() => DisputeForm({ cycle }))
    await form.click('Simulate a dispute')
    form.change('Resolution note', 'No adjustment warranted')
    form.change('Adjustment hours', '0')
    form.change('Adjustment amount', '0')
    expect(form.fields().find(element => element.props.children === 'Adjust')?.props.disabled).toBe(true)
    form.change('Adjustment hours', '101')
    form.change('Adjustment amount', '-10001')
    const html = await form.click('Reject')
    expect(api.resolveDispute).toHaveBeenCalledWith(dispute.id, { decision: 'reject', note: 'No adjustment warranted' })
    expect(html).toContain('Dispute rejected.')
  })

  it.each(['open', 'adjusted', 'rejected'] as const)('rehydrates the existing %s dispute and its conversation after remount', async status => {
    const cycle = { ...payload(), batch }
    api.getDisputes.mockResolvedValue({ disputes: [{ ...dispute, status }, { ...dispute, id: 'other', cycleId: 'other-cycle', createdAt: '2026-09-26T12:00:00Z' }] })
    api.getThreads.mockResolvedValue({ threads: [{ ...thread, disputeId: dispute.id }] })
    const form = mount(() => DisputeForm({ cycle }))
    expect(form.draw()).toContain('data-skeleton="card"')
    const html = await form.ready()
    expect(api.getThreads).toHaveBeenCalledWith(cycle.cycle.id)
    expect(html).toContain('Two missing hours')
    expect(html).toContain('Dispute conversation')
    expect(html).not.toContain('Simulate a dispute')
    expect(html).not.toContain('Open dispute</button>')
    expect(api.simulateDispute).not.toHaveBeenCalled()
    expect(api.createDispute).not.toHaveBeenCalled()
    if (status === 'open') expect(html).toContain('Resolution note')
    else expect(html).toContain(status === 'adjusted' ? 'Adjustment recorded' : 'Dispute rejected')
  })

  it('does not offer creation until dispute history loads successfully and supports retry', async () => {
    api.getDisputes.mockRejectedValueOnce(new Error('Dispute history unavailable'))
    const form = mount(() => DisputeForm({ cycle: { ...payload(), batch } }))
    const html = await form.ready()
    expect(html).toContain('Dispute history unavailable')
    expect(html).not.toContain('Simulate a dispute')
    await form.click('Retry disputes')
    expect(await form.ready()).toContain('Simulate a dispute')
  })

  it('keeps the agent recommendation after history loads and submits its minutes as hours with the note', async () => {
    const cycle = { ...payload(), batch }
    api.getDisputes.mockResolvedValue({ disputes: [dispute] })
    api.getThreads.mockResolvedValue({ threads: [{ ...thread, disputeId: dispute.id }] })
    api.resolveDispute.mockResolvedValue({ dispute: { ...dispute, status: 'adjusted' }, thread })
    const form = mount(() => DisputeForm({ cycle, prefill: { disputeId: dispute.id, worker: dispute.worker, minutes: 6, note: 'Six minutes supported by the clock-out.' } }))
    const html = await form.ready()
    expect(html).toContain('value="0.1"')
    expect(html).toContain('value="Six minutes supported by the clock-out."')
    await form.click('Adjust')
    expect(api.resolveDispute).toHaveBeenCalledWith(dispute.id, { decision: 'adjust', hours: 0.1, note: 'Six minutes supported by the clock-out.' })
  })

  it('updates a later recommendation without resetting edits during ordinary rerenders', async () => {
    const cycle = { ...payload(), batch }
    api.getDisputes.mockResolvedValue({ disputes: [dispute] })
    let prefill = { worker: dispute.worker, minutes: 6, note: 'Six supported minutes.' }
    const form = mount(() => DisputeForm({ cycle, prefill }))
    await form.ready()
    form.change('Resolution note', 'Reviewed the original source.')
    expect(await form.ready()).toContain('value="Reviewed the original source."')
    prefill = { ...prefill, minutes: 12, note: 'Twelve supported minutes.' }
    form.draw()
    const html = await form.ready()
    expect(html).toContain('value="0.2"')
    expect(html).toContain('value="Twelve supported minutes."')
  })

  it('ignores invalid or out-of-range adjustment prefills', () => {
    expect(disputePrefill({ minutes: '6', amount: '2', note: 'Evidence checked.' })).toEqual({ hours: '0.1', amount: '2', note: 'Evidence checked.' })
    expect(disputePrefill({ hours: Infinity, minutes: -1, amount: 10001, note: null })).toEqual({ hours: '', amount: '', note: '' })
    expect(disputePrefill({ hours: 0.5, minutes: 6 }).hours).toBe('0.5')
  })

  it('blocks stale creation controls when the cycle or prefilled worker changes during history loading', async () => {
    let cycle = { ...payload(), batch }
    let prefill = { worker: 'New worker' }
    const form = mount(() => DisputeForm({ cycle, prefill }))
    expect(await form.ready()).toContain('Simulate a dispute')
    let finish!: (value: { disputes: JourneyDispute[] }) => void
    api.getDisputes.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    prefill = { worker: dispute.worker }
    expect(form.draw()).toContain('data-skeleton="card"')
    expect(form.draw()).not.toContain('Simulate a dispute')
    finish({ disputes: [dispute] })
    expect(await form.ready()).toContain('Two missing hours')
    cycle = { ...cycle, cycle: { ...cycle.cycle, id: 'next-paid-cycle' }, batch: { ...batch, id: 'next-batch', cycleId: 'next-paid-cycle' } }
    expect(form.draw()).toContain('data-skeleton="card"')
    expect(form.draw()).not.toContain('Resolution note')
    expect(await form.ready()).toContain('Simulate a dispute')
    expect(api.simulateDispute).not.toHaveBeenCalled()
    expect(api.createDispute).not.toHaveBeenCalled()
  })

  it('does not replace a newly loaded cycle dispute with an old in-flight simulation result', async () => {
    let cycle = { ...payload(), batch }
    let finish!: (value: { dispute: JourneyDispute; thread: JourneyThread }) => void
    api.simulateDispute.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const form = mount(() => DisputeForm({ cycle }))
    await form.click('Simulate a dispute')
    const other = { ...dispute, id: 'next-dispute', cycleId: 'next-paid-cycle', description: 'Another paid-cycle dispute' }
    api.getDisputes.mockResolvedValue({ disputes: [other] })
    cycle = { ...cycle, cycle: { ...cycle.cycle, id: other.cycleId }, batch: { ...batch, id: 'next-batch', cycleId: other.cycleId } }
    form.draw()
    expect(await form.ready()).toContain(other.description)
    finish({ dispute, thread })
    const html = await form.ready()
    expect(html).toContain(other.description)
    expect(html).not.toContain(dispute.description)
  })
})


describe('polished form action hierarchy', () => {
  it.each(['connect', 'gaps', 'send', 'dispute'] as const)('keeps at most one black next step in the %s form', async form => {
    const cycle = form === 'gaps' ? gapsPayload() : form === 'dispute' ? { ...payload(), batch } : payload()
    const render = form === 'connect' ? () => ConnectForm({ cycle }) : form === 'gaps' ? () => GapsForm({ cycle }) : form === 'send' ? () => SendForm({ cycle }) : () => DisputeForm({ cycle })
    const screen = mount(render)
    const html = await screen.ready()
    expect(html).toContain('journey-form')
    // Connection methods are equal-weight choices; all other ready forms have one next step.
    expect(primaryCount(html)).toBe(form === 'connect' ? 0 : 1)
    expect(html).not.toContain('Approve cycle')
  })
})
