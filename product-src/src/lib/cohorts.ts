import type { Onboarding } from '@/lib/onboarding'
import { ordinal } from '@/lib/utils'

/** An additional pay cycle: a group, division or client on its own calendar. Cutoff and deadline follow the main calendar. */
export interface Cohort {
  id: string
  name: string
  frequency: Onboarding['frequency']
  periodEndDay: Onboarding['periodEndDay']
  payDay: Onboarding['payDay']
  payDatesOfMonth: number[]
}
export type CycleDraft = Omit<Cohort, 'id'>

/** Readable, stable id from the thing it names, so re-adding the same entry does not duplicate it. */
export const slugId = (prefix: string, text: string) =>
  `${prefix}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`

/** Cohorts stored before they had a period end take the main calendar's. */
export const withPeriodEnd = (cohorts: Partial<Cohort>[], periodEndDay: Onboarding['periodEndDay']) =>
  cohorts.map((cohort) => ({ ...cohort, periodEndDay: cohort.periodEndDay ?? periodEndDay }) as Cohort)

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
export const cycleNamed = (cohorts: Cohort[], name: string) => cohorts.find((cohort) => same(cohort.name, name))

export function nextCycleName(cohorts: Cohort[]) {
  let number = 2
  while (cycleNamed(cohorts, `Cycle ${number}`)) number += 1
  return `Cycle ${number}`
}

/** Why a pay cycle can't be saved under this name, or '' when it can. `id` is the cycle being edited. */
export function cycleError(cohorts: Cohort[], name: string, id?: string) {
  if (!name.trim()) return 'Name who is on this cycle'
  const taken = cycleNamed(cohorts, name)
  return taken && taken.id !== id ? `${taken.name} already has a pay cycle` : ''
}

/** Adds the cycle, or replaces the one with `id`. */
export function saveCycle(cohorts: Cohort[], draft: CycleDraft, id?: string): Cohort[] {
  const cycle = { ...draft, name: draft.name.trim() }
  if (id) return cohorts.map((cohort) => cohort.id === id ? { ...cycle, id } : cohort)
  const slug = slugId('cohort', cycle.name)
  return [...cohorts, { ...cycle, id: cohorts.some((cohort) => cohort.id === slug) ? `${slug}-${cohorts.length}` : slug }]
}

export const removeCycle = (cohorts: Cohort[], id: string) => cohorts.filter((cohort) => cohort.id !== id)

/** "Clerical · Biweekly · weeks end Sunday · paid Friday"; `short` drops the period end. */
export function cycleLine(cycle: CycleDraft, short = false) {
  const monthly = cycle.frequency === 'Semi-monthly' || cycle.frequency === 'Monthly'
  const dates = cycle.frequency === 'Monthly' ? cycle.payDatesOfMonth.slice(0, 1) : cycle.payDatesOfMonth.slice(0, 2)
  return [cycle.name, cycle.frequency, !monthly && !short && `weeks end ${cycle.periodEndDay}`,
    monthly ? `paid the ${dates.map(ordinal).join(' and ')}` : `paid ${cycle.payDay}`].filter(Boolean).join(' · ')
}
