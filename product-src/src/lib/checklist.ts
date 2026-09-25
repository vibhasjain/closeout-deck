import { recentCycles } from '@/lib/cycles'
import { buildCycles, cycleStats } from '@/lib/desk'
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

/** Checklist progress comes from the same pending pay period and decisions as Payroll. */
export function checklist(state: Onboarding, now = new Date()) {
  const pendingCycleId = recentCycles(state, 2, now)[1].id
  const pending = buildCycles(state, now).find((cycle) => cycle.id === pendingCycleId)!
  const items: ChecklistItem[] = [
    { id: 'agent', label: 'Talk to the Closeout Agent', hint: 'Tell me how you run Payroll.', href: '/setup/agent', done: state.forwarded, expanded: false },
    { id: 'intake', label: "Get this week's time entries", hint: "Collect what's missing from each client.", href: intakeHref(pendingCycleId), done: cycleIntake(pending, state, now).open === 0, expanded: false },
    { id: 'review', label: 'Resolve discrepancies', hint: 'Approve what I fixed and decide the rest.', href: `/payroll?${new URLSearchParams({ cycle: pendingCycleId, step: 'review' })}`, done: cycleStats(pending, state.resolutions, state.undone[pendingCycleId]).needsReview === 0, expanded: false },
    { id: 'send', label: 'Send to Payroll', hint: 'Send the approved run.', href: `/payroll?${new URLSearchParams({ cycle: pendingCycleId, step: 'review' })}`, done: Boolean(state.batches[pendingCycleId]), expanded: false },
  ]
  const next = items.find((item) => !item.done)
  if (next) next.expanded = true
  return { items, done: items.filter((item) => item.done).length, total: items.length, pendingCycleId, dismissed: state.checklistDismissed }
}
