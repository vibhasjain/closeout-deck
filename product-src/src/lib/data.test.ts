import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShiftTable } from '@/components/ShiftTable'
import { PayrollSummary } from '@/components/PayrollSummary'
import { PayRuns } from '@/components/shell/PayRuns'
import { Intake } from '@/components/Intake'
import { OverlayProvider } from '@/components/shell/Overlay'
import { AuxProvider } from '@/components/shell/Aux'
import * as api from '@/lib/api'
import * as onboarding from '@/lib/onboarding'
import * as sessions from '@/lib/viewerSession'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import { activeCycles, applyKind, cycleStats, discrepancies, kinds, provenance, useDesk } from '@/lib/desk'
import { cycleIntake } from '@/lib/intake'
import { payTotals } from '@/lib/payroll'
import { resolutionGroups } from '@/lib/resolution'
import { getCycle, getEntries, getFindings, getDataSnapshot, hydrate, invalidate, publishCycle, refreshCycle, removeFile, seedSample, serverCycles, setFact, uploadFile, type CyclePayload, type FileRecord, type SourceRecord } from '@/lib/data'
import recorded from '@/lib/fixtures/server-cycle.json'

const payload = recorded.payload as unknown as CyclePayload
const files = recorded.files as FileRecord[]
const sources = recorded.sources as SourceRecord[]
let state: Onboarding
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const summary = { ...payload.cycle, runAt: payload.runAt, sample: payload.sample, totals: payload.totals, counts: payload.counts, findings: payload.groups.length }
const request = (path: string) => {
  if (path === '/data/cycles') return Promise.resolve(response({ cycles: [summary], sources }))
  if (path === '/files') return Promise.resolve(response({ files }))
  if (path === `/data/cycles/${payload.cycle.id}`) return Promise.resolve(response(payload))
  throw new Error(`Unexpected test request ${path}`)
}
beforeEach(() => {
  state = { ...structuredClone(DEFAULTS) }
  vi.spyOn(onboarding, 'getOnboarding').mockImplementation(() => state)
  vi.spyOn(onboarding, 'useOnboarding').mockImplementation(() => [state, patch => { state = { ...state, ...patch } }])
  vi.spyOn(onboarding, 'updateOnboarding').mockImplementation(patch => { state = { ...state, ...patch } })
  vi.spyOn(onboarding, 'flushOnboarding').mockResolvedValue()
  vi.spyOn(api, 'authedFetch').mockImplementation(request)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('recorded server cycle', () => {
  it('does not claim no data before the first list response or after a failed initial load', async () => {
    vi.spyOn(sessions, 'viewerSession').mockReturnValue({ email: 'loading@example.com', sessionToken: 'loading', exp: 9999999999 })
    let answer!: (value: Response) => void
    vi.mocked(api.authedFetch).mockImplementation(path => path === '/files' ? Promise.resolve(response({ files: [] })) : new Promise(resolve => { answer = resolve }))
    const loading = invalidate()
    expect(serverCycles(state).every(cycle => cycle.nextStep === undefined)).toBe(true)
    const rail = () => renderToStaticMarkup(h(MemoryRouter, null, h(PayRuns)))
    expect(rail()).toContain('data-skeleton="rail"')
    expect(rail()).not.toMatch(/No time entries|missing sets|Get timesheets/)
    answer(new Response('{}', { status: 503 }))
    await loading
    expect(rail()).toContain('Retry')
    expect(rail()).not.toContain('No time entries')
    expect(serverCycles(state).every(cycle => cycle.nextStep === undefined)).toBe(true)
    vi.mocked(api.authedFetch).mockImplementation(request)
    await invalidate()
    expect(rail()).not.toContain('data-skeleton')
    expect(serverCycles(state).some(cycle => cycle.week.length > 0)).toBe(true)
  })

  it('keeps an adjustment-only cycle pending when its detail fails after the list answers', async () => {
    vi.spyOn(sessions, 'viewerSession').mockReturnValue({ email: 'adjustment-read@example.com', sessionToken: 'adjustment-read', exp: 9999999999 })
    let answer!: (value: Response) => void
    vi.mocked(api.authedFetch).mockImplementation(path => path === '/files' ? Promise.resolve(response({ files: [] }))
      : path === '/data/cycles' ? Promise.resolve(response({ cycles: [{ ...summary, runAt: null, adjustments: { count: 1, amount: 2 } }], sources: [] }))
      : new Promise(resolve => { answer = resolve }))
    const loading = invalidate()
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
    expect(serverCycles(state).every(cycle => !cycle.nextStep)).toBe(true)
    answer(new Response('{}', { status: 503 }))
    await loading
    expect(getDataSnapshot().cycleErrors[payload.cycle.id]).toBeTruthy()
    expect(serverCycles(state).find(cycle => cycle.id === payload.cycle.id)?.nextStep).toBeUndefined()
  })
  it('D6: a signed-in account with no data gets the calendar with honest empty states, never the synthetic generator', async () => {
    vi.spyOn(sessions, 'viewerSession').mockReturnValue({ email: 'fresh@example.com', sessionToken: 'fresh', exp: 9999999999 })
    vi.mocked(api.authedFetch).mockImplementation(path => Promise.resolve(response(path === '/files' ? { files: [] } : { cycles: [], sources: [] })))
    await invalidate()
    for (const cal of [state, { ...state, dataSource: 'synthetic' as const }]) {
      const cycles = activeCycles(cal)
      expect(cycles.length).toBeGreaterThan(0)
      expect(cycles.every(cycle => cycle.server && cycle.week.length === 0 && cycle.status !== 'reviewed')).toBe(true)
      expect(cycles.every(cycle => cycle.nextStep?.kind === 'get_timesheets' && cycle.nextStep.detail === 'No time entries yet')).toBe(true)
    }
    const rail = renderToStaticMarkup(h(MemoryRouter, null, h(PayRuns)))
    expect(rail).toContain('No time entries yet')
    expect(rail).not.toMatch(/\$[\d,]+\.\d\d|Paid|Bayview/)
    const summary = renderToStaticMarkup(h(MemoryRouter, null, h(OverlayProvider, null, h(AuxProvider, null, h(Intake, { cycle: activeCycles(state)[0], intake: cycleIntake(activeCycles(state)[0], state) })))))
    expect(summary).toContain(`No time entries yet for ${activeCycles(state)[0].label}.`)
    expect(summary).not.toMatch(/Bayview|Jensen|Alvarez|Ask Site|Mark No-Show/)
  })
  it('D19: a card publishing one cycle before the list loads never shrinks the pay-runs rail to that cycle', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 25, 17), toFake: ['Date'] })
    vi.spyOn(sessions, 'viewerSession').mockReturnValue({ email: 'reload@example.com', sessionToken: 'reload', exp: 9999999999 })
    publishCycle(payload)
    expect(getDataSnapshot()).toMatchObject({ owner: 'reload@example.com', loaded: false, list: [{ id: payload.cycle.id }] })
    const cycles = serverCycles(state)
    expect(cycles.map(cycle => [cycle.id, cycle.statusTag])).toEqual([['2026-09-27', 'In Progress'], ['2026-09-20', 'Pending']])
    expect(cycles[1].week).toHaveLength(11)
    vi.useRealTimers()
  })
  it('keeps the synthetic demo only for an explicitly synthetic, signed-out store', () => {
    const cycles = activeCycles({ ...state, dataSource: 'synthetic' })
    expect(cycles.length).toBe(26)
    expect(cycles.some(cycle => cycle.server)).toBe(false)
  })
  it('restores dates, facilities, every result and callable context without recomputing server pay', () => {
    const before = JSON.stringify(payload)
    const cycle = hydrate(payload, state, files)
    expect(cycle.server).toBe(true)
    expect(cycle.sample).toBe(true)
    expect(cycle.week).toHaveLength(11)
    expect(cycle.run.totals).toEqual(payload.totals)
    expect(cycle.run.shifts.map(result => Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'shift')))).toEqual(payload.results)
    expect(cycle.run.shifts[0].shift).toBe(cycle.week[0])
    expect(cycle.week[0].fac.name).toBe('Pacific Cold Storage')
    expect(cycle.start).toBeInstanceOf(Date)
    expect(cycle.groups).toEqual(payload.groups)
    expect(cycle.extraGroups).toEqual(payload.extraGroups)
    expect(cycleStats(cycle)).toMatchObject({ payments: 11, gross: 1600, needsReview: 2 })
    expect(payTotals(cycle)).toMatchObject({ gross: 1600, naive: 1760 })
    expect(kinds(cycle, {}).map(kind => kind.ruleId)).toEqual(expect.arrayContaining(['CS-01', 'TS-COMPLETE']))
    expect(resolutionGroups(cycle, {}).map(group => group.ruleId)).toContain('CS-01')
    expect(cycle.run.ctx.workedMin(cycle.week[0])).toBe(480)
    expect(cycle.run.ctx.dupGap(cycle.week[0])).toBeNull()
    expect(cycle.run.ctx.byWorker.get(cycle.week[0].worker)?.[0]).toBe(cycle.week[0])
    expect(cycle.run.ctx.overlap(cycle.week[0])).toBeNull()
    expect(provenance(cycle, cycle.week[0], 999)).toMatchObject({ system: 'Bullhorn', file: 'bullhorn_2026-09-20.csv', fileId: payload.week[0].prov.file, row: payload.week[0].prov.row, sample: true })
    expect(JSON.stringify(payload)).toBe(before)
  })
  it('shows effective decision money and hours in the shared Payroll desk without changing its source payload', () => {
    const wire = structuredClone(payload)
    wire.week = [{ ...wire.week[0], rate: 23, punches: [{ in: 480, out: 577 }], meal: null, vms: undefined }]
    wire.results = [{ ...wire.results[0], rate: 23, payableMin: 383, pay: 383 / 60 * 23, naive: 97 / 60 * 23, rows: [
      { ruleId: 'CA-RT-01', status: 'flag', note: 'Reporting minimum', effect: { topUpMin: 143 } },
      { ruleId: 'CON-MIN-4H', status: 'flag', note: 'Contract minimum', effect: { topUpMin: 143 } },
    ] }]
    wire.decisions = ['CA-RT-01', 'CON-MIN-4H'].map(groupId => ({ id: groupId, cycleId: wire.cycle.id, groupId, shiftIds: [wire.week[0].id], decision: 'dismissed' as const, reason: 'Verified actual time', by: 'user' as const, at: '2026-09-25T12:00:00Z' }))
    const original = JSON.stringify(wire)
    const cycle = hydrate(wire, state, files)
    expect(cycle.run.shifts[0].payableMin).toBe(97)
    expect(payTotals(cycle).gross).toBeCloseTo(37.1833333333)
    expect(cycle.run.shifts[0].rows.map(row => row.ruleId)).toEqual(['CA-RT-01', 'CON-MIN-4H'])
    expect(JSON.stringify(wire)).toBe(original)
  })
  it('reuses the effective run for approvals and escalations but reprices dismissals and changed inputs', () => {
    const wire = structuredClone(payload)
    wire.week = [{ ...wire.week[0], rate: 23, punches: [{ in: 480, out: 577 }], meal: null, vms: undefined }]
    wire.results = [{ ...wire.results[0], rate: 23, payableMin: 240, pay: 92, naive: 97 / 60 * 23, rows: [
      { ruleId: 'CON-MIN-4H', status: 'flag', note: 'Contract minimum', effect: { topUpMin: 143 } },
    ] }]
    wire.groups = [{ ...wire.groups[0], id: 73, ruleId: 'CON-MIN-4H' }]
    wire.decisions = []
    const first = hydrate(wire, state, files)
    const decision = { id: 'first', cycleId: wire.cycle.id, groupId: '73', shiftIds: [wire.week[0].id], decision: 'approved' as const, reason: null, by: 'user' as const, at: '2026-09-25T12:00:00Z' }
    const approved = hydrate({ ...wire, decisions: [decision] }, state, files)
    const escalated = hydrate({ ...wire, decisions: [{ ...decision, decision: 'escalated' }] }, state, files)
    expect(approved.run).toBe(first.run)
    expect(escalated.run).toBe(first.run)
    expect(approved.decisions).toEqual([decision])
    const dismissed = hydrate({ ...wire, decisions: [{ ...decision, decision: 'dismissed' }] }, state, files)
    expect(dismissed.run).not.toBe(first.run)
    expect(dismissed.run.shifts[0].payableMin).toBe(97)
    expect(dismissed.run.totals).toMatchObject({ gross: 37.18 })
    const latestApproval = hydrate({ ...wire, decisions: [{ ...decision, decision: 'dismissed' }, { ...decision, id: 'later', at: '2026-09-25T13:00:00Z' }] }, state, files)
    expect(latestApproval.run.shifts[0].payableMin).toBe(240)
    expect(latestApproval.run.totals).toMatchObject({ gross: 92 })
    const adjusted = hydrate({ ...wire, adjustments: [{ id: 'adjustment', cycleId: wire.cycle.id, worker: wire.week[0].worker, hours: 0, amount: 4 }] }, state, files)
    expect(adjusted.run.totals).toMatchObject({ gross: 96 })
    const changed = hydrate({ ...wire, results: [{ ...wire.results[0], pay: 80 }] }, state, files)
    expect(changed.run.totals).toMatchObject({ gross: 80 })
  })
  it('always excludes partial held pay and rounds gross per worker before any decisions', () => {
    const wire = structuredClone(payload)
    wire.week = wire.week.slice(0, 2)
    wire.results = [{ ...wire.results[0], pay: 160.005 }, { ...wire.results[1], held: true, pay: 99.99 }]
    wire.decisions = []
    wire.totals.gross = 259.995
    expect(hydrate(wire, state, files).run.totals).toMatchObject({ gross: 160.01 })
    expect(wire.totals.gross).toBe(259.995)
  })
  it('keeps an applied wrong-week correction beside overtime extras without inventing effects or counting pay twice', () => {
    const wire = structuredClone(payload)
    wire.week = wire.week.slice(0, 1)
    const wrongWeek = { ruleId: 'SRC-WEEK-01', status: 'applied' as const, note: 'Location confirms the overnight belongs in this week' }
    wire.results = [{ ...wire.results[0], rows: [
      { ruleId: 'FED-OT-40', status: 'applied', note: 'Weekly overtime restored', effect: { otPremiumMin: 60 } },
      { ruleId: 'FED-RR-01', status: 'applied', note: 'Differential restored', effect: { premiumAmt: 4.5 } },
      wrongWeek, wrongWeek,
    ] }]
    wire.groups = [{ ...wire.groups[0], ruleId: wrongWeek.ruleId, cases: 1 }]
    wire.extraGroups = ['FED-OT-40', 'FED-RR-01'].map(ruleId => ({ ...wire.groups[0], ruleId }))
    const cycle = hydrate(wire, state, files)
    const groups = resolutionGroups(cycle, {})
    expect(groups.map(group => group.ruleId)).toEqual(expect.arrayContaining(['SRC-WEEK-01', 'FED-OT-40', 'FED-RR-01']))
    expect(groups.every(group => group.cases.length === 1)).toBe(true)
    expect(cycleStats(cycle)).toMatchObject({ total: 1, agentResolved: 1, needsReview: 0, gross: wire.results[0].pay })
    expect(payTotals(cycle).gross).toBe(wire.results[0].pay)
    expect(discrepancies(cycle, {}).some(item => item.ruleId === 'SRC-WEEK-01')).toBe(true)
    expect(cycle.run.shifts[0].rows.find(row => row.ruleId === wrongWeek.ruleId)?.effect).toBeUndefined()
    const html = renderToStaticMarkup(h(MemoryRouter, null, h(OverlayProvider, null, h(AuxProvider, null, h(PayrollSummary, { cycle })))))
    expect(html).toContain('data-rule="SRC-WEEK-01"')
    expect(html).toContain('data-rule="FED-OT-40"')
    // Local undo markers cannot rewrite a server-owned decision/run.
    expect(resolutionGroups(cycle, {}, ['SRC-WEEK-01']).find(group => group.ruleId === wrongWeek.ruleId)?.state).toBe('fixed')
    expect(cycleStats(cycle, {}, ['SRC-WEEK-01'])).toMatchObject({ total: 1, agentResolved: 1, needsReview: 0 })

    // A source correction remains visible even without an accompanying engine premium.
    cycle.run.shifts[0].rows = [wrongWeek]
    expect(cycleStats(cycle)).toMatchObject({ total: 1, agentResolved: 1 })
    const table = renderToStaticMarkup(h(MemoryRouter, null, h(ShiftTable, { cycle, filterMode: 'discrepancies', defaultFilter: 'agent-resolved', onSelect: () => {} })))
    expect(table).toContain('Ana Peña')
    const synthetic = { ...cycle, server: false }
    expect(cycleStats(synthetic).total).toBe(0)
    expect(resolutionGroups(synthetic, {})).toEqual([])
  })
  it('uses server intake and source ids without planted gaps or a synthetic wall clock', () => {
    const cycle = hydrate(payload, state, files)
    const intake = cycleIntake(cycle, state, new Date('2026-09-22T12:00:00Z'))
    expect(intake.expected).toBe(payload.intake.expected.length)
    expect(intake.received).toBe(payload.intake.received.length)
    expect(intake.clients.map(client => client.name)).toEqual(['Pacific Cold Storage'])
    expect(intake.clients.flatMap(client => client.sources).every(row => sources.some(source => source.id === row.source.id))).toBe(true)
    expect(intake.clients.flatMap(client => client.sources).every(row => row.source.sample)).toBe(true)
  })
  it('switches the desk on discovered data and applies decisions to the server shift ids', async () => {
    await invalidate()
    expect(state.dataSource).toBe('server')
    const cycles = activeCycles(state)
    expect(cycles.map(cycle => cycle.id)).toEqual(['2026-09-20'])
    expect(cycles[0].week.map(shift => shift.id)).toEqual(payload.week.map(shift => shift.id))
    const targets = kinds(cycles[0], {}).find(kind => kind.ruleId === 'CS-01')!.cases
    expect(applyKind(cycles[0].id, 'CS-01')).toBe(targets.length)
    expect(state.resolutions[cycles[0].id][targets[0].shiftId]).toBe('applied')
  })
  it('renders the server groups, workers, totals and Sample tag in the desk and pay-run sidebar', async () => {
    await invalidate()
    function DeskFixture() {
      const { current } = useDesk()
      return h('div', null, h(PayRuns), h(PayrollSummary, { cycle: current }))
    }
    const html = renderToStaticMarkup(h(MemoryRouter, null, h(OverlayProvider, null, h(AuxProvider, null, h(DeskFixture)))))
    expect(html).toContain('data-rule="CS-01"')
    expect(html).toContain('data-rule="TS-COMPLETE"')
    expect(html).toContain('Pacific Cold Storage')
    expect(html).toContain('11 payouts, $1,600')
    expect(html).toContain('Sample')
    expect(html).not.toContain('Bayview Warehouse')
    expect(html).not.toContain('6,278')
  })
  it('keeps server data on a failed refresh and exposes the retry error', async () => {
    await invalidate()
    vi.mocked(api.authedFetch).mockRejectedValue(new Error('Network unavailable'))
    await invalidate()
    expect(getDataSnapshot().error).toBe('Network unavailable')
    expect(activeCycles(state)[0].week).toHaveLength(11)
  })
  it('waits for a fresh pass when another invalidation arrives during an in-flight read', async () => {
    let release!: (response: Response) => void
    let reads = 0
    vi.mocked(api.authedFetch).mockImplementation(path => {
      if (path === '/data/cycles' && ++reads === 1) return new Promise<Response>(resolve => { release = resolve })
      return request(path)
    })
    const first = invalidate()
    const second = invalidate()
    release(response({ cycles: [], sources: [] }))
    await second
    expect(getDataSnapshot().payloads).toHaveLength(1)
    expect(getDataSnapshot().loading).toBe(false)
    await first
  })
  it('never returns a cached cycle belonging to another signed-in account', async () => {
    await invalidate()
    const previous = activeCycles(state)
    expect(previous[0].week).toHaveLength(11)
    vi.spyOn(sessions, 'viewerSession').mockReturnValue({ email: 'another@example.com', sessionToken: 'new-account', exp: 9999999999 })
    const next = activeCycles(state)
    expect(next).not.toBe(previous)
    expect(next.every(cycle => cycle.week.length === 0)).toBe(true)
  })
  it('does not fall back to generated rows when server mode has no runs', async () => {
    vi.mocked(api.authedFetch).mockImplementation(path => Promise.resolve(response(path === '/files' ? { files: [] } : { cycles: [], sources: [] })))
    state.dataSource = 'server'
    await invalidate()
    const cycles = activeCycles(state)
    expect(cycles.length).toBeGreaterThan(0)
    expect(cycles.every(cycle => cycle.server && cycle.week.length === 0)).toBe(true)
    expect(cycles.every(cycle => cycleIntake(cycle, state).expected === 0)).toBe(true)
  })
})

describe('typed data requests', () => {
  it('does not let an older task poll overwrite a completed decision or batch', async () => {
    let release!: (response: Response) => void
    vi.mocked(api.authedFetch).mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve }))
    const pending = refreshCycle(payload.cycle.id)
    const batch = { id: 'b_new', cycleId: payload.cycle.id, workers: 11, gross: 1000, held: 1, destination: 'ADP', createdAt: '2026-09-25T12:00:00Z' }
    publishCycle({ ...payload, batch })
    release(response({ ...payload, batch: null }))
    await pending
    expect(getDataSnapshot().payloads.find(cycle => cycle.cycle.id === payload.cycle.id)?.batch).toEqual(batch)
  })
  it('does not let an older task poll replace a newer complete refresh', async () => {
    let release!: (response: Response) => void
    vi.mocked(api.authedFetch).mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve }))
    const pending = refreshCycle(payload.cycle.id)
    await invalidate()
    release(response({ ...payload, runAt: null, counts: { set1: 0, set2: 0, set3: 0 } }))
    await pending
    expect(getDataSnapshot().payloads.find(cycle => cycle.cycle.id === payload.cycle.id)?.runAt).toBe(payload.runAt)
  })
  it('keeps another pending decision through confirmed cache publication and background revalidation without persisting it', async () => {
    const local = { id: 'local:still-pending', cycleId: payload.cycle.id, groupId: 'CS-01', shiftIds: [], decision: 'approved' as const, reason: null, by: 'user' as const, at: '2026-09-26T12:00:00Z' }
    publishCycle({ ...payload, decisions: [local] })
    api.cacheResponse(`/data/cycles/${payload.cycle.id}`, { ...payload, decisions: [] })
    expect(getDataSnapshot().payloads.find(item => item.cycle.id === payload.cycle.id)?.decisions).toContainEqual(local)
    await refreshCycle(payload.cycle.id)
    expect(getDataSnapshot().payloads.find(item => item.cycle.id === payload.cycle.id)?.decisions).toContainEqual(local)
    expect((await getCycle(payload.cycle.id)).decisions ?? []).not.toContainEqual(local)
    // Settle the local overlay so subsequent fixtures model a confirmed account.
    publishCycle({ ...payload, decisions: [] })
  })
  it('uses the cycle, entries and findings routes with encoded query fields', async () => {
    vi.mocked(api.authedFetch).mockImplementation(async () => response({ entries: [], groups: [], cases: [] }))
    await getCycle('2026-09-20', 'network-first')
    await getEntries('2026-09-20', { shift: 's/a b', offset: 2000 })
    await getFindings('2026-09-20')
    expect(api.authedFetch).toHaveBeenCalledWith('/data/cycles/2026-09-20', undefined)
    expect(api.authedFetch).toHaveBeenCalledWith('/data/entries?cycle=2026-09-20&shift=s%2Fa+b&offset=2000', undefined)
    expect(api.authedFetch).toHaveBeenCalledWith('/data/findings?cycle=2026-09-20', undefined)
  })
  it('flushes the calendar before raw uploads, activates server mode and refreshes data', async () => {
    const file = new File(['Staff,Start\nAna,6:00 AM\n'], 'export (new).csv', { type: 'text/csv' })
    const uploaded = { ...files[0], rows: 1, entries: 1, cycles: ['2026-09-20'], gaps: [], replaced: 0 }
    vi.mocked(api.authedFetch).mockImplementation((path, init) => init?.method === 'POST' ? Promise.resolve(response({ file: uploaded })) : request(path))
    expect((await uploadFile(file, { set: 2, system: 'UKG', site: 'Pacific Cold Storage' })).file).toMatchObject({ rows: 1, entries: 1 })
    const init = vi.mocked(api.authedFetch).mock.calls.find(([, init]) => init?.method === 'POST')![1]!
    expect(init.body).toBe(file)
    expect(new Headers(init.headers).get('X-Set')).toBe('2')
    expect(new Headers(init.headers).get('X-Site')).toBe('Pacific%20Cold%20Storage')
    expect(new Headers(init.headers).get('X-File-Name')).toBe('export%20(new).csv')
    expect(onboarding.flushOnboarding).toHaveBeenCalledOnce()
    expect(state.dataSource).toBe('server')
    expect(getDataSnapshot().payloads).toHaveLength(1)
  })
  it('seeds sample data and saves a fact through the same refresh path', async () => {
    vi.mocked(api.authedFetch).mockImplementation((path, init) => init?.method === 'POST' ? Promise.resolve(response(path === '/data/sample' ? { cycleId: payload.cycle.id, files: [], entries: 16, groups: payload.groups } : { ok: true, cycles: [payload.cycle.id] })) : request(path))
    expect((await seedSample()).cycleId).toBe('2026-09-20')
    await setFact({ kind: 'site', key: 'pacific cold storage', value: { state: 'CA' } })
    expect(api.authedFetch).toHaveBeenCalledWith('/data/facts', expect.objectContaining({ method: 'POST', body: JSON.stringify({ kind: 'site', key: 'pacific cold storage', value: { state: 'CA' } }) }))
    expect(state.dataSource).toBe('server')
  })
  it('removes a file with DELETE and refreshes the desk before it resolves; a file already gone refreshes too; a failure refreshes nothing', async () => {
    let listed = [...files, { ...files[0], id: 'f_wrong', name: 'wrong.csv', sample: false }]
    const calls: string[] = []
    vi.mocked(api.authedFetch).mockImplementation((path, init) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`)
      if (init?.method !== 'DELETE') return path === '/files' ? Promise.resolve(response({ files: listed })) : request(path)
      if (path !== '/files/f_wrong') return Promise.resolve(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }))
      listed = listed.filter(file => file.id !== 'f_wrong')
      return Promise.resolve(response({ ok: true, cycles: [payload.cycle.id] }))
    })
    await invalidate()
    expect(getDataSnapshot().files.map(file => file.id)).toContain('f_wrong')
    calls.length = 0
    expect(await removeFile('f_wrong')).toEqual({ ok: true, cycles: [payload.cycle.id] })
    expect(api.authedFetch).toHaveBeenCalledWith('/files/f_wrong', { method: 'DELETE' })
    expect(calls.indexOf('GET /files')).toBeGreaterThan(calls.indexOf('DELETE /files/f_wrong'))
    expect(getDataSnapshot().files.map(file => file.id)).not.toContain('f_wrong')
    calls.length = 0
    expect(await removeFile('f_other_tab')).toEqual({ ok: true, cycles: [] })
    expect(calls).toContain('GET /files')
    calls.length = 0
    vi.mocked(api.authedFetch).mockImplementation((path, init) => { calls.push(`${init?.method ?? 'GET'} ${path}`); return Promise.resolve(new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 })) })
    await expect(removeFile('f_x')).rejects.toThrow()
    expect(calls).toEqual(['DELETE /files/f_x'])
  })
  it('reports duplicate uploads without activating or replacing data', async () => {
    vi.mocked(api.authedFetch).mockResolvedValue(new Response(JSON.stringify({ error: 'duplicate_file' }), { status: 409 }))
    await expect(uploadFile(new File(['a'], 'a.csv'), { set: 1 })).rejects.toThrow('already been uploaded')
    expect(onboarding.updateOnboarding).not.toHaveBeenCalled()
  })
})
