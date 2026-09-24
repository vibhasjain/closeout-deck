import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runEngine } from '@/bench/engine.js'
import { buildCycles, cycleStats, discrepancies, effectiveResolutions, kinds, provenance, rowResolution, shortShiftId, topstats } from '@/lib/desk'
import { DEFAULTS } from '@/lib/onboarding'

const today = new Date(2026, 7, 25)
const calendar = { ...DEFAULTS, payDay: 'Thursday' as const, cutoffDays: 2 }

describe('reconcile cycle decisions', () => {
  it('keeps cycle-specific shift identities when dense rows display the same short id', () => {
    const cycles = buildCycles(calendar, new Date(2026, 8, 22))
    const current = cycles[0].week.find((shift) => shift.id.startsWith('W'))!
    const shortId = shortShiftId(current.id)
    const priorCycle = cycles.find((cycle) => cycle.id !== cycles[0].id && cycle.week.some((shift) => shortShiftId(shift.id) === shortId))!
    const prior = priorCycle.week.find((shift) => shortShiftId(shift.id) === shortId)!
    expect(shortId).toMatch(/^\d+$/)
    expect(current.id).not.toBe(prior.id)
    expect(cycles[0].week.find((shift) => shift.id === current.id)).toBe(current)
    expect(provenance(cycles[0], current, cycles[0].week.indexOf(current)).file)
      .not.toBe(provenance(priorCycle, prior, priorCycle.week.indexOf(prior)).file)
    expect(shortShiftId('4821')).toBe('4821')
    expect(shortShiftId('worker-4821')).toBe('worker-4821')
  })

  it('uses the actual bench cycle and its 310 discrepancies without doubling kind cases', () => {
    const cycle = buildCycles(calendar, today)[0]
    expect(cycle.label).toBe('Aug 24 to 30')
    expect(cycle.week).toHaveLength(6175)
    expect(cycle.cutoff.getDate()).toBe(1)
    expect(cycle.cutoff.getMonth()).toBe(8)
    expect(discrepancies(cycle, {})).toHaveLength(310)
    expect(cycle.run.totals.flags).toBe(78)
    expect(cycle.run.totals.held).toBe(5)
    for (const kind of kinds(cycle, {})) {
      expect(kind.cases.length).toBe(new Set(kind.cases.map((item) => item.shiftId)).size)
      expect(kind.whyStopped.length).toBeGreaterThan(0)
    }
    const span = kinds(cycle, {}).find((kind) => kind.ruleId === 'CS-16H')!
    expect(span.wouldDo).toBe('Pay 4h at time and a half and 4h 41m at double time')
    expect(span.whyStopped).toContain('17h 11m, longer than the 16h limit')
  })

  it('removes every rule for a decided shift and preserves its audit rows across JSON reload', () => {
    const cycle = buildCycles(calendar, today)[0]
    const shiftId = cycle.week.find((shift) => shift.id.endsWith('4826'))!.id
    const original = discrepancies(cycle, {})
    const stored = JSON.parse(JSON.stringify({
      ...calendar,
      resolutions: { [cycle.id]: { [shiftId]: 'dismissed' } },
      reasons: { [`${cycle.id}:${shiftId}`]: 'Supervisor confirmed the meal break.' },
    }))
    const items = discrepancies(buildCycles(stored, today)[0], stored.resolutions)
    expect(items.filter((item) => !item.decided)).toHaveLength(original.length - 3)
    expect(items.filter((item) => item.shiftId === shiftId).every((item) => item.decided === 'dismissed')).toBe(true)
    expect(kinds(cycle, stored.resolutions).flatMap((kind) => kind.cases).some((item) => item.shiftId === shiftId)).toBe(false)
    expect(stored.reasons[`${cycle.id}:${shiftId}`]).toBe('Supervisor confirmed the meal break.')
  })

  it('shows no review kinds after every discrepancy is decided', () => {
    const cycle = buildCycles(calendar, today)[0]
    const resolutions = { [cycle.id]: Object.fromEntries(discrepancies(cycle, {}).map((item) => [item.shiftId, 'applied' as const])) }
    expect(kinds(cycle, resolutions)).toEqual([])
    expect(discrepancies(cycle, resolutions).filter((item) => !item.decided)).toEqual([])
  })

  it('persists approval on the current cycle without changing its engine results', () => {
    const cycle = buildCycles(calendar, today)[0]
    const approved = buildCycles({ ...calendar, approvedCycles: [cycle.id] }, today)
    expect(approved[0].statusTag).toBe('Approved')
    expect(approved[0].run.totals).toEqual(cycle.run.totals)
    expect(approved).toHaveLength(26)
    expect(approved[1].statusTag).toBe('Pending')
    expect(approved.slice(2).every((item) => item.statusTag === 'Paid')).toBe(true)
  })

  it('counts payments, gross and discrepancies per shift, not per rule row', () => {
    const cycle = buildCycles(calendar, today)[0]
    const isOpen = (row: { status: string }) => row.status === 'flag' || row.status === 'held'
    const needs = cycle.run.shifts.filter((shift) => shift.rows.some(isOpen))
    const resolved = cycle.run.shifts.filter((shift) => !shift.rows.some(isOpen) && shift.rows.some((row) => row.status === 'applied' && row.effect))
    // Zero-effect applied rows (exact-minute rounding) exist and must not count.
    expect(cycle.run.shifts.some((shift) => shift.rows.some((row) => row.status === 'applied' && !row.effect))).toBe(true)
    const stats = cycleStats(cycle)
    expect(stats).toEqual({
      payments: new Set(cycle.run.shifts.map((shift) => shift.shift.worker)).size,
      gross: cycle.run.shifts.reduce((total, shift) => total + shift.pay, 0),
      total: needs.length + resolved.length,
      agentResolved: resolved.length,
      needsReview: needs.length,
    })
    expect(stats.total).toBeLessThanOrEqual(stats.payments)
  })

  it('moves an accepted shift to resolved and drops a dismissed one out of the count', () => {
    const cycle = buildCycles(calendar, today)[0]
    const isOpen = (row: { status: string }) => row.status === 'flag' || row.status === 'held'
    // Shifts with exactly one open finding and no other correction, so each decision is clean.
    const single = cycle.run.shifts.filter((shift) => shift.rows.filter(isOpen).length === 1 && !shift.rows.some((row) => row.status === 'applied' && row.effect))
    const [accepted, dismissed] = single
    const before = cycleStats(cycle)
    const after = cycleStats(cycle, { [cycle.id]: { [accepted.shift.id]: 'applied', [dismissed.shift.id]: 'dismissed' } })
    expect(after.needsReview).toBe(before.needsReview - 2)
    expect(after.agentResolved).toBe(before.agentResolved + 1)
    expect(after.total).toBe(before.total - 1)
    expect(after.gross).toBe(before.gross)
  })

  it('gives every review kind a recommendation from its own rule and a deduplicated impact', () => {
    const cycles = buildCycles(calendar, today)
    const groups = cycles.flatMap((cycle) => kinds(cycle, {}, cycles))
    expect(groups.length).toBeGreaterThan(0)
    for (const kind of groups) {
      expect(kind.label.trim()).not.toBe('')
      expect(kind.recommendation.trim()).not.toBe('')
      expect(kind.cases.every((item) => item.status === 'flag' || item.status === 'held')).toBe(true)
      expect(kind.needsReview).toBeGreaterThanOrEqual(kind.cases.length)
      expect(kind.impact).toBeCloseTo(kind.cases.reduce((sum, item) => sum + item.effect, 0))
      expect(kind.insight ?? '').not.toContain('rate card')
    }
    const held = groups.find((kind) => kind.ruleId === 'CS-16H')!
    expect(held.recommendation).toBe('Hold the affected payments for review')
    expect(held.recommendation).not.toContain('1.5')
    expect(groups.some((kind) => kind.ruleId === 'CA-OT-8')).toBe(false)
  })

  it('derives insights from evidence and bounds first-occurrence claims to available cycles', () => {
    const cycles = buildCycles(calendar, today)
    const groups = kinds(cycles[0], {}, cycles)
    expect(groups.find((kind) => kind.ruleId === 'TS-COMPLETE')?.insight).toContain('location evidence and a recorded human confirmation')
    expect(groups.find((kind) => kind.ruleId === 'FAC-AUTODED-01')?.insight).toContain('no meal punch')
    expect(groups.find((kind) => kind.ruleId === 'CON-SUTTER-01')?.insight).toContain('$18.00/h')
    expect(groups.find((kind) => kind.ruleId === 'CS-16H')?.insight).toContain(`previous ${cycles.length - 1} available cycles`)
    expect(kinds(cycles[0], {}).find((kind) => kind.ruleId === 'CS-16H')?.insight).toBeUndefined()
  })

  it('counts a flag plus a hold as two pending rows but one actionable payment', () => {
    const raw = buildCycles(calendar, today)[0]
    const week = raw.week.map((shift) => shift.id.endsWith('4821') ? { ...shift, resolution: null } : shift)
    const cycle = { ...raw, week, run: runEngine(week) }
    const kind = kinds(cycle, {}).find((item) => item.ruleId === 'TS-COMPLETE')!
    expect(kind.cases).toHaveLength(1)
    expect(kind.needsReview).toBe(2)
    const decisions = { [cycle.id]: { [kind.cases[0].shiftId]: 'applied' as const } }
    const pending = cycle.run.shifts.flatMap((shift) => shift.rows.filter((row) => !rowResolution(cycle, shift.shift.id, row.ruleId, decisions)))
    expect(topstats(cycle, decisions)).toContain(`${pending.filter((row) => row.status === 'flag').length} flagged`)
    expect(topstats(cycle, decisions)).toContain(`${pending.filter((row) => row.status === 'held').length} held`)
    expect(topstats(cycle, decisions).split(' · ').slice(-1)).toEqual(topstats(cycle).split(' · ').slice(-1))
  })

  it('does not treat a remembered rule as permission to resolve unrelated flags', () => {
    const raw = buildCycles(calendar, today)[0]
    const cycle = { ...raw, rememberedRuleIds: ['FAC-AUTODED-01'] }
    const shift = cycle.run.shifts.find((item) => item.shift.id.endsWith('4826'))!
    expect(rowResolution(cycle, shift.shift.id, 'FAC-AUTODED-01', {})).toBe('applied')
    expect(rowResolution(cycle, shift.shift.id, 'CA-MB-01', {})).toBeUndefined()
    expect(effectiveResolutions(cycle, {})[cycle.id]?.[shift.shift.id]).toBeUndefined()
    expect(kinds(cycle, {}).some((kind) => kind.ruleId === 'FAC-AUTODED-01')).toBe(false)
    expect(kinds(cycle, {}).find((kind) => kind.ruleId === 'CA-MB-01')?.cases.some((item) => item.shiftId === shift.shift.id)).toBe(true)
  })
})

describe('persisted bucket decisions', () => {
  const storage = new Map<string, string>()
  const setItem = vi.fn((key: string, value: string) => storage.set(key, value))
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(today)
    storage.clear()
    setItem.mockClear()
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('bulk applies in one write, drops all affected counts and survives a store reload', async () => {
    const desk = await import('@/lib/desk')
    const store = await import('@/lib/onboarding')
    const state = store.getOnboarding()
    const cycle = desk.buildCycles(state)[0]
    const kind = desk.kinds(cycle, state.resolutions).find((item) => item.ruleId === 'CA-MB-01')!
    store.updateOnboarding({
      resolutions: { older: { previous: 'dismissed' } },
      decisionTimes: { 'older:previous': '2026-01-01T00:00:00.000Z' },
      reasons: { 'older:previous': 'Confirmed' },
    })
    setItem.mockClear()
    const before = desk.cycleStats(cycle)
    const affectedIds = new Set(kind.cases.map((item) => item.shiftId))
    // Decisions are recorded per shift, so every shift in the kind leaves Needs review.
    const affectedRows = affectedIds.size
    expect(desk.applyKind(cycle.id, kind.ruleId)).toBe(kind.cases.length)
    expect(setItem).toHaveBeenCalledTimes(1)
    const saved = store.getOnboarding()
    expect(desk.kinds(cycle, saved.resolutions).some((item) => item.ruleId === kind.ruleId)).toBe(false)
    expect(desk.cycleStats(cycle, saved.resolutions).needsReview).toBe(before.needsReview - affectedRows)
    expect(desk.cycleStats(cycle, saved.resolutions).agentResolved).toBe(before.agentResolved + affectedRows)
    expect(saved.resolutions.older.previous).toBe('dismissed')
    expect(saved.decisionTimes['older:previous']).toBe('2026-01-01T00:00:00.000Z')
    expect(saved.reasons['older:previous']).toBe('Confirmed')
    for (const item of kind.cases) {
      expect(saved.resolutions[cycle.id][item.shiftId]).toBe('applied')
      expect(saved.decisionTimes[`${cycle.id}:${item.shiftId}`]).toBe(today.toISOString())
    }
    vi.resetModules()
    const reloadedStore = await import('@/lib/onboarding')
    const reloadedDesk = await import('@/lib/desk')
    const reloaded = reloadedStore.getOnboarding()
    expect(reloaded.resolutions).toEqual(saved.resolutions)
    expect(reloadedDesk.cycleStats(reloadedDesk.buildCycles(reloaded)[0], reloaded.resolutions))
      .toEqual(desk.cycleStats(cycle, saved.resolutions))
    expect(reloadedDesk.applyKind(cycle.id, kind.ruleId)).toBe(0)
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('remembers accepted source rules for future open cycles without rewriting paid history', async () => {
    const desk = await import('@/lib/desk')
    const store = await import('@/lib/onboarding')
    const initial = store.getOnboarding()
    const originalCycles = desk.buildCycles(initial)
    const cycle = originalCycles[0]
    const ruleId = 'CA-MB-01'
    desk.applyKind(cycle.id, ruleId)
    desk.rememberKind(ruleId)
    desk.rememberKind(ruleId)
    expect(store.getOnboarding().customRules).toHaveLength(1)
    expect(store.getOnboarding().customRules[0]).toMatchObject({ sourceRuleId: ruleId, autoApply: true, draft: false })
    vi.resetModules()
    const reloaded = (await import('@/lib/onboarding')).getOnboarding()
    const futureCycles = desk.buildCycles(reloaded, new Date(2026, 8, 1))
    const future = futureCycles[0]
    expect(future.rememberedRuleIds).toContain(ruleId)
    expect(future.run.shifts.some((shift) => shift.rows.some((row) => row.ruleId === ruleId && row.status === 'flag'))).toBe(true)
    expect(desk.kinds(future, reloaded.resolutions).some((kind) => kind.ruleId === ruleId)).toBe(false)
    expect(desk.cycleStats(future, reloaded.resolutions).needsReview)
      .toBeLessThan(desk.cycleStats({ ...future, rememberedRuleIds: [] }, reloaded.resolutions).needsReview)
    expect(futureCycles[1].rememberedRuleIds).toContain(ruleId)
    expect(futureCycles.slice(2).every((item) => item.rememberedRuleIds?.length === 0)).toBe(true)
    const approvedFuture = desk.buildCycles({ ...reloaded, approvedCycles: [future.id] }, new Date(2026, 8, 1))[0]
    expect(approvedFuture.statusTag).toBe('Approved')
    expect(approvedFuture.rememberedRuleIds).toContain(ruleId)
    expect(desk.cycleStats(approvedFuture, reloaded.resolutions)).toEqual(desk.cycleStats(future, reloaded.resolutions))
    const earlier = desk.buildCycles(reloaded, new Date(2026, 7, 18))[0]
    expect(earlier.rememberedRuleIds).toEqual([])
    const paid = desk.buildCycles(reloaded)[1]
    expect(paid.run.totals).toEqual(originalCycles[1].run.totals)
  })
})
