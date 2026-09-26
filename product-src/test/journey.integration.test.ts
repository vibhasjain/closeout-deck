import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from '../server/src/index.ts'
import { createMemoryDataStore } from '../server/src/datastore.ts'
import { createMemoryJourneyStore } from '../server/src/journeyStore.ts'
import { conditionalState, type StateRow, type StateStore } from '../server/src/state.ts'
import { payTotals } from '../src/lib/payroll'
import { cycleStats } from '../src/lib/desk'
import { journeyAdjustmentLine, journeyShiftPay } from '../src/lib/journeyPay'
import { applyAction } from '../src/lib/chatActions'
import { authedFetch } from '../src/lib/api'
import { connectSource, getCycle, getDataSnapshot, hydrate, seedSample, uploadFile, type CyclePayload } from '../src/lib/data'
import { askGaps, createDispute, decide, getDisputes, getThreads, recordMessage, resolveDispute, sendPayroll, simulateDispute } from '../src/lib/journey'
import { flushOnboarding, getOnboarding, updateOnboarding } from '../src/lib/onboarding'
import { batchPreview, gapRows } from '../src/components/journey/FormCard'

// Only the signed-in browser boundary is substituted. All client state sync, data/journey
// functions, HTTP requests, server routes, ingestion and engine execution are real.
vi.mock('@/lib/viewerSession', () => ({ viewerSession: () => ({ email: 'dev@hypertrack.io' }), signOut: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const us = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`
const bullhorn = (worker: string, date: string) => [
  'Candidate,Placement ID,Client,Job Title,Date,Start,End,Break (min),Hours,Pay Rate,Bill Rate,Entered Via,Status,Approved By,Comment',
  `${worker},991,Pacific Cold Storage,Warehouse,${us(date)},8:00 AM,4:30 PM,30,8,20,30,Web time entry,Approved,Supervisor,`,
].join('\r\n')

/** Independent worker-level cent rounding used for the initial engine baseline. */
function originalGross(cycle: CyclePayload, dismissMeals = false) {
  const workers = new Map<string, number>()
  cycle.results.forEach((row, index) => {
    const worker = cycle.week[index].worker
    const meals = dismissMeals ? row.rows.filter(rule => rule.ruleId === 'CA-MB-01' && rule.status === 'flag')
      .reduce((total, rule) => total + (rule.effect?.premiumHours ?? 0) * row.rate, 0) : 0
    workers.set(worker, (workers.get(worker) ?? 0) + (row.held ? 0 : row.pay - meals))
  })
  return cents([...workers.values()].reduce((total, amount) => total + cents(amount), 0))
}

/** The ledger rows, sidebar totals and agent context use the same outgoing amounts. */
function expectUiGross(cycle: CyclePayload, gross: number) {
  const desk = hydrate(cycle, getOnboarding())
  expect(payTotals(desk).gross).toBe(gross)
  expect(cycleStats(desk).gross).toBe(gross)
  if (!cycle.batch) {
    const ledger = new Map<string, number>()
    for (const result of desk.run.shifts) ledger.set(result.shift.worker, (ledger.get(result.shift.worker) ?? 0) + journeyShiftPay(result))
    const adjustments = (cycle.adjustments ?? []).reduce((total, adjustment) => total + journeyAdjustmentLine(adjustment).gross, 0)
    expect(cents([...ledger.values()].reduce((total, amount) => total + cents(amount), adjustments))).toBe(gross)
    expect(batchPreview(cycle).gross).toBe(gross)
  }
}

it('real client journey + server: sample, decisions, unresolved asks, send once, paid dispute and next-export money', async () => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-client-journey-'))
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  let state: StateRow | null = { doc: { neverContact: [], profile: { payrollRunBy: 'I run it in ADP' } }, updated_at: '2026-09-25T00:00:00.000Z' }
  const stateStore: StateStore = {
    async get() { return structuredClone(state) },
    async put(_email, doc, version) {
      const result = conditionalState(state, doc, version)
      if (result.kind === 'conflict') return { status: 409, row: structuredClone(result.row) }
      state = structuredClone(result.row)
      return { status: 200, row: structuredClone(state) }
    },
  }
  const server = createServer({ dataStore: createMemoryDataStore(), journeyStore: createMemoryJourneyStore(), stateStore,
    env: { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: 'dev@hypertrack.io', ALLOWED_DOMAINS: 'hypertrack.io', CLOSEOUT_DATA_DIR: root, SESSION_SECRET: 'integration-test-secret-at-least-32-bytes' }, claudeVersion: async () => 'test',
    runAgent: async options => { options.onEvent({ done: true, sessionId: 'offline-fixture', final: '```memory\n{"ops":[]}\n```' }) } })
  const networkFetch = globalThis.fetch.bind(globalThis)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input)
    if (!path.startsWith('/api/')) throw new Error(`Unexpected external request: ${path}`)
    return networkFetch(origin + path.slice('/api'.length), init)
  })
  try {
    const sample = await seedSample()
    const id = sample.cycleId, nextId = addDays(id, 7)
    const initial = await getCycle(id)
    expect(initial.week).toHaveLength(6283)
    expect(initial.nextStep?.kind).toBe('review')
    const initialGross = originalGross(initial)
    const dismissedGross = originalGross(initial, true)
    expect(initialGross).toBeGreaterThan(dismissedGross)
    expect(batchPreview(initial).gross).toBe(initialGross)
    expectUiGross(initial, initialGross)

    // A legacy shift-level action must never decide this worker's entire rule group.
    const mealShifts = initial.week.filter((_shift, index) => initial.results[index].rows.some(row => row.ruleId === 'CA-MB-01' && row.status === 'flag'))
    expect(mealShifts.length).toBeGreaterThan(1)
    expect(getOnboarding().dataSource).toBe('server')
    for (const shiftId of [mealShifts[0].id, 'nonexistent-shift']) {
      expect(() => applyAction({ type: 'decide', cycleId: id, shiftId, decision: 'dismissed', reason: 'Took her meal' }, vi.fn(), vi.fn(), new URLSearchParams()))
        .toThrow('use approve/dismiss for a group')
    }
    const afterLegacy = await getCycle(id)
    expect(afterLegacy.decisions).toEqual(initial.decisions)
    expect(afterLegacy.results).toEqual(initial.results)
    expect(batchPreview(afterLegacy).gross).toBe(initialGross)

    // The UI's numeric alias and rule ID must update the same canonical decision.
    const meal = initial.groups.find(group => group.ruleId === 'CA-MB-01')!
    const dismissed = await decide(id, { groupId: String(meal.id), decision: 'dismissed', reason: 'Signed meal waivers verified' })
    expect(dismissed.decision.groupId).toBe('CA-MB-01')
    expect(batchPreview(dismissed.cycle).gross).toBe(dismissedGross)
    expectUiGross(dismissed.cycle, dismissedGross)
    const approved = await decide(id, { groupId: 'CA-MB-01', decision: 'approved' })
    expect(approved.decision.id).toBe(dismissed.decision.id)
    expect(approved.cycle.decisions).toHaveLength(1)
    expect(batchPreview(approved.cycle).gross).toBe(initialGross)
    await decide(id, { groupId: 'CA-MB-01', decision: 'dismissed', reason: 'Signed meal waivers verified' })

    const beforeSendDispute = { cycleId: id, worker: initial.week[0].worker, description: 'Missing paid time', source: 'paste' as const }
    await expect(createDispute(beforeSendDispute)).rejects.toMatchObject({ status: 422 })
    await expect(simulateDispute(id)).rejects.toMatchObject({ status: 422 })
    expect((await getDisputes()).disputes).toEqual([])
    expect(batchPreview(await getCycle(id)).gross).toBe(dismissedGross)

    // Upload real worker time to create an intake gap in the sample's cycle.
    await uploadFile(new File([bullhorn('Integration Worker', addDays(id, -4))], 'bullhorn_integration.csv', { type: 'text/csv' }), { set: 1 })
    const withGap = await getCycle(id)
    const gap = 'Pacific Cold Storage|Integration Worker|2'
    const grossWithGap = cents(dismissedGross + 160)
    expect(withGap.nextStep).toMatchObject({ kind: 'chase_missing', counts: { gaps: 1 } })
    expect(batchPreview(withGap).gross).toBe(grossWithGap)
    const asked = await askGaps(id, { gapIds: [gap] })
    expect(asked.threads).toHaveLength(1)
    expect(asked.threads[0]).toMatchObject({ cycleId: id, status: 'waiting', counterparty: { gapIds: [gap] }, messages: [{ dir: 'out', status: 'not_sent_demo' }] })
    const afterAsk = await getCycle(id)
    expect(afterAsk.nextStep).toMatchObject({ kind: 'chase_missing', counts: { gaps: 1 } })
    expect(gapRows(afterAsk, [], {}, asked.threads)).toEqual([expect.objectContaining({ id: gap, asked: true })])
    expect(batchPreview(afterAsk).gross).toBe(grossWithGap)
    await recordMessage(asked.threads[0].id, { dir: 'in', text: 'I worked 8 to 4:30 with a 30-minute meal.' })
    expect((await getCycle(id)).nextStep?.counts.gaps).toBe(1)
    expect((await getThreads(id)).threads[0].messages).toHaveLength(2)
    expect(batchPreview(await getCycle(id)).gross).toBe(grossWithGap)

    // An explicit desk close is persisted through the actual client state sync before sending.
    updateOnboarding({ acceptedGaps: { ...getOnboarding().acceptedGaps, [`${id}:${gap}`]: { reason: 'Supervisor verified the worker-reported time by phone', at: new Date().toISOString() } } })
    await flushOnboarding()
    let ready = await getCycle(id)
    const early = await sendPayroll(id)
    expect(early.status).toBe(422)
    if (early.status !== 422) throw new Error('Review must block the first send')
    expect(early.open?.gaps).toEqual([])
    const groupsToReview = early.open?.groups ?? []
    expect(groupsToReview.length).toBeGreaterThan(0)
    for (const [index, groupId] of groupsToReview.entries()) {
      ready = (await decide(id, { groupId, decision: index === 0 ? 'escalated' : 'approved' })).cycle
      expectUiGross(ready, grossWithGap)
    }
    expect(ready.decisions?.some(decision => decision.decision === 'escalated')).toBe(true)
    expect(ready.nextStep?.kind).toBe('send')
    const sent = await sendPayroll(id)
    expect(sent.status).toBe(201)
    if (sent.status !== 201) throw new Error('Reviewed cycle did not send')
    expect(sent.batch).toMatchObject({ gross: grossWithGap, destination: 'ADP' })
    const firstCsv = await (await authedFetch(sent.csvUrl)).text()
    const firstLines = firstCsv.trim().split('\r\n')
    expect(firstLines[0]).toBe('worker,regular_hours,ot_hours,premium_hours,gross,held_entries')
    expect(cents(firstLines.slice(1).reduce((total, line) => total + Number(line.split(',')[4]), 0))).toBe(grossWithGap)
    expect(firstLines.slice(1).every(line => line.split(',')[3] === '0.00')).toBe(true)
    const resend = await sendPayroll(id)
    expect(resend).toMatchObject({ status: 409, batch: { id: sent.batch.id, gross: grossWithGap } })
    const paid = await getCycle(id)
    expect(paid.nextStep?.kind).toBe('done')
    expectUiGross(paid, sent.batch.gross)
    expect(payTotals(hydrate(paid, getOnboarding())).workerCount).toBe(sent.batch.workers)

    const { dispute } = await simulateDispute(id)
    expect(dispute.status).toBe('open')
    const resolved = await resolveDispute(dispute.id, { decision: 'adjust', hours: 1, amount: 20, note: 'Verified an additional hour against the source time entry' })
    expect(resolved.dispute).toMatchObject({ status: 'adjusted', adjustment: { hours: 1, amount: 20, next_cycle_id: nextId } })
    expect((await getCycle(id)).batch?.gross).toBe(grossWithGap)
    expect(await (await authedFetch(sent.csvUrl)).text()).toBe(firstCsv)

    // A real next-cycle worker/client/location match: 8 payable hours at $20, no premium.
    const day = addDays(id, 2)
    await uploadFile(new File([bullhorn('Integration Worker', day)], 'bullhorn_next.csv', { type: 'text/csv' }), { set: 1 })
    const ukg = ['Employee,ID,Date,Schedule,Absence,In,Out,Transfer,Paycode,Amount,Shift,Daily,Period',
      `Integration Worker,991,${us(day)},8:00 AM to 4:30 PM,,8:00 AM,12:00 PM,,,,,,`,
      ',,,,,12:30 PM,4:30 PM,,,,8,8,8'].join('\r\n')
    await uploadFile(new File([ukg], 'ukg_next.csv', { type: 'text/csv' }), { set: 2 })
    const location = await connectSource({ set: 3, system: 'HyperTrack', site: 'Pacific Cold Storage' })
    expect(location.files.every(file => file.status === 'normalized')).toBe(true)
    let next = await getCycle(nextId)
    const disputes = (await getDisputes()).disputes
    expect(next.adjustments).toEqual([{ id: dispute.id, cycleId: id, worker: dispute.worker, hours: 1, amount: 20 }])
    expect(batchPreview(next).gross).toBe(180)
    expect(batchPreview(next, disputes).gross).toBe(180)
    expectUiGross(next, 180)
    const remaining = await sendPayroll(nextId)
    if (remaining.status === 422) {
      expect(remaining.open?.missingSets).toEqual([])
      expect(remaining.open?.gaps).toEqual([])
      for (const groupId of remaining.open?.groups ?? []) next = (await decide(nextId, { groupId, decision: 'approved' })).cycle
    }
    const nextSent = remaining.status === 201 ? remaining : await sendPayroll(nextId)
    expect(nextSent.status).toBe(201)
    if (nextSent.status !== 201) throw new Error('Next cycle did not send')
    expect(nextSent.batch.gross).toBe(180)
    expect(batchPreview(next, disputes).gross).toBe(nextSent.batch.gross)
    const nextCsv = await (await authedFetch(nextSent.csvUrl)).text()
    expect(nextCsv).toContain('Integration Worker,8.00,0.00,0.00,160.00,0\r\n')
    expect(nextCsv).toContain(`${dispute.worker} · Adjustment for ${id},1.00,0.00,0.00,20.00,0\r\n`)
    expect(getDataSnapshot().error).toBeNull()
    const paidNext = getDataSnapshot().payloads.find(cycle => cycle.cycle.id === nextId)!
    expect(paidNext.batch?.gross).toBe(180)
    expectUiGross(paidNext, 180)
    expect(payTotals(hydrate(paidNext, getOnboarding())).workerCount).toBe(nextSent.batch.workers)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
