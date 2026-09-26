import { describe, expect, it } from 'vitest'
import { applyDecisionProgress } from './journeyStep'
import type { CyclePayload } from './data'
import type { JourneyDecision } from './journey'
import fixture from './fixtures/server-cycle.json'

const payload = fixture.payload as CyclePayload
const base: CyclePayload = { ...payload, decisions: [], batch: null,
  results: [{ ...payload.results[0], held: false, rows: [
    { ...payload.results[0].rows[0], ruleId: 'CS-01', status: 'flag' },
    { ...payload.results[0].rows[0], ruleId: 'SRC-VMS-01', status: 'flag' },
  ] }], groups: [{ ...payload.groups[0], id: 77, ruleId: 'CS-01' }], extraGroups: [],
  nextStep: { kind: 'review', label: 'Review 1 issue', detail: 'Review the issue', counts: { missingSets: 0, gaps: 0, openGroups: 1 } },
}
const decision: JourneyDecision = { id: 'local:1', cycleId: base.cycle.id, groupId: 'CS-01', decision: 'approved', reason: null, by: 'user', at: '2026-09-26T12:00:00Z', shiftIds: [] }

describe('optimistic next-step progress', () => {
  it.each(['approved', 'dismissed', 'escalated'] as const)('changes Review to Send immediately for a %s group, with rollback restoring Review', kind => {
    const changed = applyDecisionProgress({ ...base, decisions: [{ ...decision, decision: kind }] })
    expect(changed.nextStep).toMatchObject({ kind: 'send', label: 'Send to Payroll', counts: { openGroups: 0 } })
    expect(applyDecisionProgress({ ...changed, decisions: [] }).nextStep).toMatchObject({ kind: 'review', label: 'Review 1 issue', counts: { openGroups: 1 } })
  })
  it('does not count waiting evidence or invent that a missing source or gap has arrived', () => {
    const nextStep = { kind: 'chase_missing' as const, label: 'Chase missing time', detail: 'One entry needs evidence', counts: { missingSets: 0, gaps: 1, openGroups: 1 } }
    expect(applyDecisionProgress({ ...base, nextStep, decisions: [decision] }).nextStep).toEqual({ ...nextStep, counts: { ...nextStep.counts, openGroups: 0 } })
  })
  it('accepts the same numeric rule alias as the server and never reopens a sent batch', () => {
    const changed = applyDecisionProgress({ ...base, decisions: [{ ...decision, groupId: '77' }], batch: { id: 'batch', cycleId: base.cycle.id, destination: 'ADP', workers: 1, gross: 1, held: 0, createdAt: decision.at } })
    expect(changed.nextStep).toMatchObject({ kind: 'done', label: 'Done', counts: { openGroups: 0 } })
  })
})
