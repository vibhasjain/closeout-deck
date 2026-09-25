import { recentCycles } from '@/lib/cycles'
import { onboardingComplete } from '@/lib/coverage'
import { cycleStats, type DeskCycle } from '@/lib/desk'
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

/** Getting started completes with the account's first real batch; until then it follows the pending cycle, one step at a time. */
export function checklist(state: Onboarding, now: Date, cycles: DeskCycle[]) {
  const calendarPendingId = recentCycles(state, 2, now)[1].id
  const pending = cycles.find((cycle) => cycle.server && cycle.batch)
    ?? cycles.find((cycle) => cycle.id === calendarPendingId)
    ?? cycles.find((cycle) => cycle.nextStep && cycle.status === 'needs-review')
    ?? cycles.find((cycle) => cycle.nextStep)
    ?? cycles[0]
  const pendingCycleId = pending.id
  const sent = pending.server ? Boolean(pending.batch) : state.batches[pendingCycleId]?.status === 'sent'
  const next = pending.nextStep
  // Only real server state completes a step: all three sets loaded, then no open groups. A server cycle with no
  // next step (no data, a 404, or a detail not loaded yet) completes nothing; local counts are for the synthetic desk only.
  const intake = pending.server ? next?.counts.missingSets === 0 : cycleIntake(pending, state, now).open === 0
  const review = pending.server ? next?.counts.openGroups === 0 : cycleStats(pending, state.resolutions, state.undone[pendingCycleId]).needsReview === 0
  const facts = [sent || onboardingComplete(state), sent || intake, sent || review, sent]
  // Steps tick in order: a later step never completes before the one above it.
  const done = facts.map((_, index) => facts.slice(0, index + 1).every(Boolean))
  const items: ChecklistItem[] = [
    { id: 'agent', label: 'Talk to the Closeout Agent', hint: 'Tell me how you run Payroll.', href: '/setup/agent', done: done[0], expanded: false },
    { id: 'intake', label: "Get this week's time entries", hint: "Collect what's missing from each client.", href: intakeHref(pendingCycleId), done: done[1], expanded: false },
    { id: 'review', label: 'Resolve discrepancies', hint: 'Approve what I fixed and decide the rest.', href: `/payroll?${new URLSearchParams({ cycle: pendingCycleId, step: 'review' })}`, done: done[2], expanded: false },
    { id: 'send', label: 'Send to Payroll', hint: 'Send the approved run.', href: `/payroll?${new URLSearchParams({ cycle: pendingCycleId, step: 'review' })}`, done: done[3], expanded: false },
  ]
  const firstOpen = items.find((item) => !item.done)
  if (firstOpen) firstOpen.expanded = true
  return { items, done: items.filter((item) => item.done).length, total: items.length, pendingCycleId, dismissed: state.checklistDismissed }
}
