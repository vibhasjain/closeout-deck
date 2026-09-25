import { recentCycles } from '@/lib/cycles'
import { onboardingComplete } from '@/lib/coverage'
import { buildCycles, cycleStats, type DeskCycle } from '@/lib/desk'
import { cycleIntake, intakeHref } from '@/lib/intake'
import type { Onboarding } from '@/lib/onboarding'

export interface ChecklistItem {
  id: 'agent' | 'intake' | 'review' | 'send'
  label: string
  hint: string
  href: string
  done: boolean
  expanded: boolean
}

/** Getting started completes with the account's first real batch; until then it follows the pending cycle. */
export function checklist(state: Onboarding, now = new Date(), cycles?: DeskCycle[]) {
  const calendarPendingId = recentCycles(state, 2, now)[1].id
  const available = cycles ?? buildCycles(state, now)
  const pending = available.find((cycle) => cycle.server && cycle.batch)
    ?? available.find((cycle) => cycle.id === calendarPendingId)
    ?? available.find((cycle) => cycle.nextStep && cycle.status === 'needs-review')
    ?? available.find((cycle) => cycle.nextStep)
    ?? buildCycles(state, now).find((cycle) => cycle.id === calendarPendingId)!
  const pendingCycleId = pending.id
  const sent = pending.server ? Boolean(pending.batch) : state.batches[pendingCycleId]?.status === 'sent'
  const journeyDone = Boolean(pending.server && sent)
  const next = pending.nextStep
  const items: ChecklistItem[] = [
    { id: 'agent', label: 'Talk to the Closeout Agent', hint: 'Tell me how you run Payroll.', href: '/setup/agent', done: journeyDone || onboardingComplete(state), expanded: false },
    { id: 'intake', label: "Get this week's time entries", hint: "Collect what's missing from each client.", href: intakeHref(pendingCycleId), done: journeyDone || (next ? next.counts.missingSets === 0 && next.counts.gaps === 0 : cycleIntake(pending, state, now).open === 0), expanded: false },
    { id: 'review', label: 'Resolve discrepancies', hint: 'Approve what I fixed and decide the rest.', href: `/payroll?${new URLSearchParams({ cycle: pendingCycleId, step: 'review' })}`, done: journeyDone || (next ? next.counts.openGroups === 0 : cycleStats(pending, state.resolutions, state.undone[pendingCycleId]).needsReview === 0), expanded: false },
    { id: 'send', label: 'Send to Payroll', hint: 'Send the approved run.', href: `/payroll?${new URLSearchParams({ cycle: pendingCycleId, step: 'review' })}`, done: sent, expanded: false },
  ]
  const firstOpen = items.find((item) => !item.done)
  if (firstOpen) firstOpen.expanded = true
  return { items, done: items.filter((item) => item.done).length, total: items.length, pendingCycleId, dismissed: state.checklistDismissed }
}
