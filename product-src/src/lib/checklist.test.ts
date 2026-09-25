import { describe, expect, it } from 'vitest'
import { checklist as progressOf } from '@/lib/checklist'
import { recentCycles } from '@/lib/cycles'
import { runEngine } from '@/bench/engine.js'
import { NO_DATA_STEP } from '@/lib/data'
import { buildCycles, type DeskCycle } from '@/lib/desk'
import type { NextStep } from '@/lib/journey'
import { cycleIntake, gapId, gapKey, PLANTED } from '@/lib/intake'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'

const now = new Date(2026, 8, 25, 10)
const fresh = (): Onboarding => ({ ...structuredClone(DEFAULTS), dataSource: 'synthetic' })
// The local demo cycles opt in explicitly; the app always passes the desk's own cycles.
const checklist = (state: Onboarding, at: Date, cycles = buildCycles(state, at)) => progressOf(state, at, cycles)

describe('getting started checklist', () => {
  it('starts at 0/4 with the first item expanded', () => {
    const progress = checklist(fresh(), now)
    expect(progress).toMatchObject({ done: 0, total: 4, dismissed: false, pendingCycleId: recentCycles(DEFAULTS, 2, now)[1].id })
    expect(progress.items.map((item) => item.done)).toEqual([false, false, false, false])
    expect(progress.items.filter((item) => item.expanded).map((item) => item.id)).toEqual(['agent'])
    expect(progress.items[0].href).toBe('/setup/agent')
  })

  it('marks forwarded setup done and expands collecting time entries at 1/4', () => {
    const progress = checklist({ ...fresh(), forwarded: true }, now)
    expect(progress.done).toBe(1)
    expect(progress.items.map((item) => [item.id, item.done, item.expanded])).toEqual([
      ['agent', true, false], ['intake', false, true], ['review', false, false], ['send', false, false],
    ])
    expect(progress.items[1]).toMatchObject({ hint: "Collect what's missing from each client.", href: `/payroll?cycle=${progress.pendingCycleId}&step=intake` })
  })

  it('marks intake done only after every pending-cycle gap is closed or received', () => {
    const state = { ...fresh(), forwarded: true }
    const pendingCycleId = recentCycles(state, 2, now)[1].id
    const pending = buildCycles(state, now).find((cycle) => cycle.id === pendingCycleId)!
    expect(cycleIntake(pending, state, now).open).toBeGreaterThan(0)
    state.acceptedGaps = Object.fromEntries(PLANTED.map((gap) => [gapKey(pendingCycleId, gapId(gap)), { reason: 'Not worked', at: now.toISOString() }]))
    expect(checklist(state, now).items[1].done).toBe(false)
    state.uploads[gapKey(pendingCycleId, 'wallclock')] = { files: ['time-entries.csv'], entries: 10 }
    expect(cycleIntake(pending, state, now).open).toBe(0)
    const progress = checklist(state, now)
    expect(progress.done).toBe(2)
    expect(progress.items[1]).toMatchObject({ id: 'intake', done: true })
  })

  it('never ticks review before intake: approving every group while time entries are still missing stays 1/4', () => {
    const state = { ...fresh(), forwarded: true }
    const pendingCycleId = recentCycles(state, 2, now)[1].id
    const pending = buildCycles(state, now).find((cycle) => cycle.id === pendingCycleId)!
    state.resolutions[pendingCycleId] = Object.fromEntries(pending.run.shifts.map((shift) => [shift.shift.id, 'applied' as const]))
    const progress = checklist(state, now)
    expect(progress.items.map((item) => item.done)).toEqual([true, false, false, false])
    expect(progress.done).toBe(1)
    expect(progress.items[2].href).toBe(`/payroll?cycle=${pendingCycleId}&step=review`)
  })

  it('stays 1/4 on the QA server state: both groups approved, set 3 still missing', () => {
    const state = { ...fresh(), forwarded: true }
    const cycle = { ...buildCycles(state, now)[1], server: true, batch: null,
      nextStep: { kind: 'get_timesheets' as const, label: 'Get timesheets', detail: 'No location yet', counts: { missingSets: 1, gaps: 3189, openGroups: 0 } } }
    const progress = checklist(state, now, [cycle])
    expect(progress.items.map((item) => item.done)).toEqual([true, false, false, false])
    expect(progress.items.find((item) => item.expanded)?.id).toBe('intake')
  })

  it('does not count an empty server cycle as collected', () => {
    const state = { ...fresh(), dataSource: 'server' as const, forwarded: true }
    const cycle = { ...buildCycles(state, now)[1], week: [], server: true,
      nextStep: { kind: 'get_timesheets' as const, label: 'Get timesheets', detail: 'No time entries yet', counts: { missingSets: 3, gaps: 0, openGroups: 0 } } }
    expect(checklist(state, now, [cycle]).done).toBe(1)
  })

  it('N1: right after a sample reset (no entries, the detail 404s) nothing past the agent is done, even with a stale list row', () => {
    const state = { ...fresh(), dataSource: 'server' as const, forwarded: true }
    const period = buildCycles(state, now)[1]
    // A 404'd or not-yet-loaded server cycle has no next step and no rows: the local counts would read it as all clear.
    const stale = { ...period, week: [], run: runEngine([]), server: true, batch: null, nextStep: undefined }
    expect(checklist(state, now, [stale]).items.map((item) => item.done)).toEqual([true, false, false, false])
    expect(checklist(state, now, [{ ...stale, nextStep: NO_DATA_STEP }]).items.map((item) => item.done)).toEqual([true, false, false, false])
  })

  it('N1: intake completes when all three sets are loaded, review when no groups are open, send with a batch', () => {
    const state = { ...fresh(), dataSource: 'server' as const, forwarded: true }
    const step = (kind: NextStep['kind'], missingSets: number, openGroups: number): NextStep => ({ kind, label: kind, detail: '', counts: { missingSets, gaps: 5, openGroups } })
    const cycle = (nextStep: NextStep, batch: DeskCycle['batch'] = null) => ({ ...buildCycles(state, now)[1], server: true, nextStep, batch })
    expect(checklist(state, now, [cycle(step('chase_missing', 0, 2))]).done).toBe(2)
    expect(checklist(state, now, [cycle(step('chase_missing', 0, 0))]).done).toBe(3)
    expect(checklist(state, now, [cycle(step('done', 0, 0), { id: 'b_1', cycleId: 'x', destination: 'ADP', workers: 1, gross: 1, held: 0, createdAt: '' })]).done).toBe(4)
  })

  it('reports dismissal without changing saved progress', () => {
    const state = { ...fresh(), forwarded: true, checklistDismissed: true }
    const before = structuredClone(state)
    expect(checklist(state, now)).toMatchObject({ dismissed: true, done: 1, total: 4 })
    expect(state).toEqual(before)
  })

  it('counts Send to Payroll only when the pending cycle has a batch', () => {
    const state = fresh()
    const [current, pending] = recentCycles(state, 2, now)
    state.batches[current.id] = { status: 'sent', id: 'OTHER', workers: 5, gross: 100 }
    expect(checklist(state, now).items[3].done).toBe(false)
    state.batches[pending.id] = { status: 'sending', id: 'PENDING', workers: 5, gross: 100 }
    expect(checklist(state, now).items[3].done).toBe(false)
    state.batches[pending.id].status = 'sent'
    expect(checklist(state, now).items[3].done).toBe(true)
  })

  it('reads the server batch and finishes the journey at 4/4 without a local batch', () => {
    const state = fresh()
    const cycle = buildCycles(state, now)[1]
    const server = { ...cycle, server: true, batch: { id: 'batch-1', cycleId: cycle.id, destination: 'ADP', workers: 3, gross: 1200, held: 1, createdAt: now.toISOString() },
      nextStep: { kind: 'done' as const, label: 'Disputes', detail: 'Sent to ADP', counts: { missingSets: 0, gaps: 0, openGroups: 0 } } }
    const progress = checklist(state, now, [server])
    expect(progress).toMatchObject({ done: 4, total: 4, pendingCycleId: cycle.id })
    expect(progress.items.every((item) => item.done && !item.expanded)).toBe(true)
    expect(state.batches).toEqual({})
  })

  it('uses server next-step counts instead of synthetic intake and review counts', () => {
    const state = { ...fresh(), forwarded: true }
    const cycle = { ...buildCycles(state, now)[1], server: true, batch: null,
      nextStep: { kind: 'send' as const, label: 'Send to Payroll', detail: 'Ready', counts: { missingSets: 0, gaps: 0, openGroups: 0 } } }
    const progress = checklist(state, now, [cycle])
    expect(progress.done).toBe(3)
    expect(progress.items[3]).toMatchObject({ done: false, expanded: true })
  })

  it('keeps Getting started at 4/4 after sending a sample cycle outside the calendar pending period', () => {
    const state = fresh()
    const cycles = buildCycles(state, now)
    const pending = { ...cycles[1], server: true, batch: null,
      nextStep: { kind: 'get_timesheets' as const, label: 'Get timesheets', detail: 'Collect time entries', counts: { missingSets: 3, gaps: 0, openGroups: 0 } } }
    const sample = { ...cycles[2], server: true, sample: true,
      batch: { id: 'batch-sample', cycleId: cycles[2].id, destination: 'ADP', workers: 3, gross: 1200, held: 0, createdAt: now.toISOString() },
      nextStep: { kind: 'done' as const, label: 'Done', detail: 'Sent to ADP · Demo', counts: { missingSets: 0, gaps: 0, openGroups: 0 } } }
    const progress = checklist(state, now, [pending, sample])
    expect(progress).toMatchObject({ done: 4, total: 4, pendingCycleId: sample.id })
    expect(progress.items.every((item) => item.done)).toBe(true)
  })

  it('uses the configured calendar when deriving the pending cycle', () => {
    const state = { ...fresh(), frequency: 'Monthly' as const }
    const progress = checklist(state, now)
    expect(progress.pendingCycleId).toBe(recentCycles(state, 2, now)[1].id)
    expect(progress.items[1].href).toContain(`cycle=${progress.pendingCycleId}`)
    expect(progress.pendingCycleId).not.toBe(checklist(fresh(), now).pendingCycleId)
  })
})
