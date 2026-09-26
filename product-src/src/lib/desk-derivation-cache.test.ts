import { describe, expect, it } from 'vitest'
import { discrepancies, effectiveResolutions, groupCaseIds, topstats } from './desk'
import { hydrate, type CyclePayload } from './data'
import { DEFAULTS, type Onboarding } from './onboarding'
import fixture from './fixtures/server-cycle.json'

const fresh = () => hydrate(structuredClone(fixture.payload) as CyclePayload, DEFAULTS)

describe('immutable desk derivations', () => {
  it('reuses every full-cycle review derivation during a control-only render without scanning rows', () => {
    const initial = fresh()
    let scans = 0
    const cycle = { ...initial, run: { ...initial.run, shifts: initial.run.shifts.map(shift => ({ ...shift, get rows() { scans++; return shift.rows } })) } }
    const res: Onboarding['resolutions'] = {}
    const items = discrepancies(cycle, res), decisions = effectiveResolutions(cycle, res), stats = topstats(cycle, res)
    const cases = groupCaseIds(cycle.run.shifts)
    const initialScans = scans
    expect(initialScans).toBeGreaterThan(0)
    for (let render = 0; render < 5; render++) {
      expect(discrepancies(cycle, res)).toBe(items)
      expect(effectiveResolutions(cycle, res)).toBe(decisions)
      expect(topstats(cycle, res)).toBe(stats)
      expect(groupCaseIds(cycle.run.shifts)).toBe(cases)
    }
    expect(scans).toBe(initialScans)
    const unrelated = { otherCycle: { otherEntry: 'dismissed' as const } }
    expect(discrepancies(cycle, unrelated)).toBe(items)
    expect(effectiveResolutions(cycle, unrelated)).toEqual({ ...unrelated, [cycle.id]: decisions[cycle.id] })
    expect(scans).toBe(initialScans)
  })

  it('invalidates an immutable decision replacement immediately while preserving all audit rows', () => {
    const cycle = fresh()
    const shift = cycle.run.shifts.find(item => !item.held && item.rows.some(row => row.status === 'flag'))!
    const before = discrepancies(cycle, {}), beforeStats = topstats(cycle, {})
    const beforeResolutions = effectiveResolutions(cycle, {})[cycle.id]
    const ruleIds = [...new Set(shift.rows.filter(row => row.status === 'flag' || row.status === 'held').map(row => row.ruleId))]
    cycle.decisions = ruleIds.map((ruleId, index) => ({ id: `local:${index}`, cycleId: cycle.id, groupId: ruleId, shiftIds: [shift.shift.id], decision: 'approved', reason: null, by: 'user', at: '2026-09-26T12:00:00Z' }))
    const after = discrepancies(cycle, {})
    expect(after).not.toBe(before)
    expect(after).toHaveLength(before.length)
    expect(after.find(row => row.shiftId === shift.shift.id && row.ruleId === ruleIds[0])).toMatchObject({ decided: 'applied' })
    expect(effectiveResolutions(cycle, {})[cycle.id]).not.toBe(beforeResolutions)
    expect(effectiveResolutions(cycle, {})[cycle.id][shift.shift.id]).toBe('applied')
    expect(topstats(cycle, {})).not.toBe(beforeStats)
    cycle.decisions = []
    expect(discrepancies(cycle, {})).toEqual(before)
    expect(topstats(cycle, {})).toBe(beforeStats)
  })

  it('invalidates local resolution and remembered-rule changes while ignoring another cycle', () => {
    const cycle = { ...fresh(), server: false, rememberedRuleIds: [] as string[] }
    const issue = discrepancies(cycle, {}).find(row => row.status === 'flag')!
    const unchanged = discrepancies(cycle, {})
    const res = { [cycle.id]: { [issue.shiftId]: 'dismissed' as const } }
    expect(discrepancies(cycle, res)).not.toBe(unchanged)
    expect(discrepancies(cycle, res).find(row => row.shiftId === issue.shiftId)).toMatchObject({ decided: 'dismissed' })
    expect(effectiveResolutions(cycle, res)[cycle.id][issue.shiftId]).toBe('dismissed')
    const saved = discrepancies(cycle, res)
    expect(discrepancies(cycle, { ...res, another: { row: 'applied' } })).toBe(saved)
    cycle.rememberedRuleIds = [issue.ruleId]
    expect(discrepancies(cycle, {}).find(row => row.ruleId === issue.ruleId)).toMatchObject({ decided: 'applied' })
  })

  it('indexes each flagged/held group once per entry and invalidates when time entries are replaced', () => {
    const cycle = fresh(), shift = cycle.run.shifts.find(item => item.rows.some(row => row.status === 'flag'))!
    const row = shift.rows.find(row => row.status === 'flag')!
    const shifts = [{ ...shift, rows: [row, row] }]
    const cases = groupCaseIds(shifts)
    expect(cases.get(row.ruleId)).toEqual([shift.shift.id])
    expect(groupCaseIds(shifts)).toBe(cases)
    const next = [...shifts, { ...shift, shift: { ...shift.shift, id: 'new-entry' }, rows: [row] }]
    expect(groupCaseIds(next)).not.toBe(cases)
    expect(groupCaseIds(next).get(row.ruleId)).toEqual([shift.shift.id, 'new-entry'])
    const replaced = { ...cycle, run: { ...cycle.run, shifts: next } }
    expect(discrepancies(replaced, {}).some(item => item.shiftId === 'new-entry')).toBe(true)
  })
})
