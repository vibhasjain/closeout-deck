import { describe, expect, it } from 'vitest'
import { hydrate, type CyclePayload } from '../src/lib/data'
import { DEFAULTS } from '../src/lib/onboarding'
import { payTotals } from '../src/lib/payroll'
import { journeyAdjustments, journeyPayroll } from '../src/lib/journeyPay'
import { buildExport, toCsv, type Dispute } from '../server/src/journey'
import type { CyclePayload as ServerCyclePayload } from '../server/src/pipeline'
import fixture from '../src/lib/fixtures/server-cycle.json'

describe('pending adjustments shared across UI and export', () => {
  it('includes rounded adjustment lines and adjustment-only workers before send with the actual export calculation', () => {
    const payload = structuredClone(fixture.payload) as CyclePayload
    payload.week = payload.week.slice(0, 2)
    payload.results = [{ ...payload.results[0], pay: 160, held: false }, { ...payload.results[1], pay: 90, held: true }]
    payload.decisions = []
    const target = payload.cycle.id
    const dispute = (id: string, worker: string, amount: number, next = target): Dispute => ({ id, cycleId: '2026-09-13', worker, status: 'adjusted', source: 'paste', description: 'Verified missing time', createdAt: '', adjustment: { hours: 1.234, amount, next_cycle_id: next } })
    const disputes = [dispute('one', payload.week[0].worker, 20.005), dispute('two', 'Adjustment Only Worker', 30.005),
      dispute('other-cycle', 'Not In This Cycle', 200, '2026-09-27'), { ...dispute('open', 'Unresolved Worker', 900), status: 'open' as const }]
    payload.adjustments = journeyAdjustments(target, disputes)
    const cycle = hydrate(payload, DEFAULTS), totals = payTotals(cycle)
    const exported = buildExport(payload as unknown as ServerCyclePayload, [], disputes)
    expect(exported).toMatchObject({ workers: 3, gross: 210.02, held: 1 })
    expect(cycle.run.totals.gross).toBe(exported.gross)
    expect(totals).toMatchObject({ workerCount: exported.workers, gross: exported.gross })
    expect(totals.workers.find(worker => worker.name === payload.week[0].worker)).toMatchObject({ gross: 180.01, reg: 480 + 1.23 * 60 })
    expect(totals.workers.find(worker => worker.name === 'Adjustment Only Worker')).toMatchObject({ approved: [], held: [], gross: 30.01, reg: 1.23 * 60 })
    expect(journeyPayroll(cycle.week, cycle.run.shifts, [], new Map(), cycle.adjustments)).toEqual(exported)
    const csv = toCsv(exported.lines)
    expect(csv).toContain('Adjustment Only Worker · Adjustment for 2026-09-13,1.23,0.00,0.00,30.01,0')
    expect(csv).not.toContain('Not In This Cycle')
    expect(csv).not.toContain('Unresolved Worker')
  })
  it('keeps sent batch totals authoritative even if current time entries or adjustments later change', () => {
    const payload = structuredClone(fixture.payload) as CyclePayload
    payload.adjustments = [{ id: 'adjustment-new', cycleId: '2026-09-13', worker: 'Another Worker', hours: 10, amount: 200 }]
    payload.batch = { id: 'batch-fixed', cycleId: payload.cycle.id, workers: 3, gross: 180, held: 1, destination: 'ADP', createdAt: '' }
    expect(payTotals(hydrate(payload, DEFAULTS))).toMatchObject({ workerCount: 3, gross: 180 })
  })
})
