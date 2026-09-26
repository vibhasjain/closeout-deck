import type { CyclePayload } from './data'

const reviewable = new WeakMap<CyclePayload['results'], ReadonlySet<string>>()
/** Match the server's review frontier: held entries and missing client evidence
 * wait for evidence; all other flagged rule groups need one human decision. */
function reviewGroups(payload: CyclePayload): ReadonlySet<string> {
  const cached = reviewable.get(payload.results)
  if (cached) return cached
  const groups = new Set<string>()
  for (const result of payload.results) {
    if (result.held) continue
    const held = new Set(result.rows.filter(row => row.status === 'held').map(row => row.ruleId))
    for (const row of result.rows) if (row.status === 'flag' && row.ruleId !== 'SRC-VMS-01' && !held.has(row.ruleId)) groups.add(row.ruleId)
  }
  reviewable.set(payload.results, groups)
  return groups
}

/** Decisions immediately update the next-step label/count without guessing that
 * missing source sets or evidence have arrived. The server owns those facts. */
export function applyDecisionProgress(payload: CyclePayload): CyclePayload {
  if (!payload.nextStep) return payload
  const aliases = new Map([...payload.groups, ...payload.extraGroups].filter(group => group.id !== undefined).map(group => [String(group.id), group.ruleId]))
  const decided = new Set((payload.decisions ?? []).filter(item => item.cycleId === payload.cycle.id).map(item => aliases.get(item.groupId) ?? item.groupId))
  const openGroups = [...reviewGroups(payload)].filter(id => !decided.has(id)).length
  const counts = { ...payload.nextStep.counts, openGroups }
  const nextStep = counts.missingSets || counts.gaps ? { ...payload.nextStep, counts }
    : openGroups ? { kind: 'review' as const, label: `Review ${openGroups} ${openGroups === 1 ? 'issue' : 'issues'}`, detail: 'Approve, dismiss or escalate each group before Payroll', counts }
    : payload.batch ? { kind: 'done' as const, label: 'Done', detail: `Sent to ${payload.batch.destination} · Demo`, counts }
    : { kind: 'send' as const, label: 'Send to Payroll', detail: 'Every issue is decided and the batch is ready', counts }
  return { ...payload, nextStep }
}
