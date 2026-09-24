import { describe, expect, it } from 'vitest'
import { applyAction, isAction } from '@/components/chat/ChatPane'
import { cycleError, cycleLine, nextCycleName, removeCycle, saveCycle, withPeriodEnd, type Cohort, type CycleDraft } from '@/lib/cohorts'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'

const clerical: CycleDraft = { name: 'Clerical', frequency: 'Biweekly', periodEndDay: 'Saturday', payDay: 'Friday', payDatesOfMonth: [20, 5] }

describe('additional pay cycles', () => {
  it('gives cycles stored before period end the main calendar\'s', () => {
    const old = [{ id: 'cohort-clerical', name: 'Clerical', frequency: 'Biweekly', payDay: 'Friday', payDatesOfMonth: [] }] as Partial<Cohort>[]
    expect(withPeriodEnd(old, 'Wednesday')[0].periodEndDay).toBe('Wednesday')
    expect(withPeriodEnd([{ ...clerical, id: 'x' }], 'Wednesday')[0].periodEndDay).toBe('Saturday')
  })

  it('adds, edits and removes a cycle', () => {
    const added = saveCycle([], { ...clerical, name: '  Clerical ' })
    expect(added).toEqual([{ ...clerical, id: 'cohort-clerical' }])
    const edited = saveCycle(added, { ...clerical, frequency: 'Weekly' }, 'cohort-clerical')
    expect(edited).toEqual([{ ...clerical, frequency: 'Weekly', id: 'cohort-clerical' }])
    const two = saveCycle(edited, { ...clerical, name: 'Mercy General', frequency: 'Semi-monthly', payDatesOfMonth: [15, 0] })
    expect(two.map((cycle) => cycle.id)).toEqual(['cohort-clerical', 'cohort-mercy-general'])
    expect(removeCycle(two, 'cohort-clerical').map((cycle) => cycle.name)).toEqual(['Mercy General'])
  })

  it('rejects an empty or duplicate name, ignoring case, but lets a cycle keep its own', () => {
    const cycles = saveCycle([], clerical)
    expect(cycleError(cycles, '  ')).toBe('Name who is on this cycle')
    expect(cycleError(cycles, 'clerical ')).toBe('Clerical already has a pay cycle')
    expect(cycleError(cycles, 'CLERICAL', 'cohort-clerical')).toBe('')
    expect(cycleError(cycles, 'Light industrial')).toBe('')
  })

  it('starts unnamed additional cycles at Cycle 2 and skips names already taken', () => {
    expect(nextCycleName([])).toBe('Cycle 2')
    const cycles = ['Clerical', ' cycle 2 ', 'CYCLE 3', 'Cycle 5'].map((name, index) => ({ ...clerical, name, id: String(index) }))
    const name = nextCycleName(cycles)
    expect(name).toBe('Cycle 4')
    expect(cycleError(cycles, name)).toBe('')
    expect(nextCycleName(saveCycle(cycles, { ...clerical, name }))).toBe('Cycle 6')
  })

  it('reads each cycle as one line', () => {
    expect(cycleLine(clerical)).toBe('Clerical · Biweekly · weeks end Saturday · paid Friday')
    expect(cycleLine(clerical, true)).toBe('Clerical · Biweekly · paid Friday')
    expect(cycleLine({ ...clerical, name: 'Mercy General', frequency: 'Semi-monthly', payDatesOfMonth: [15, 0] })).toBe('Mercy General · Semi-monthly · paid the 15th and last day')
    expect(cycleLine({ ...clerical, frequency: 'Monthly', payDatesOfMonth: [5, 20] })).toBe('Clerical · Monthly · paid the 5th')
  })
})

describe('the agent adding a pay cycle', () => {
  function apply(action: unknown, state: Onboarding = structuredClone(DEFAULTS)) {
    expect(isAction(action)).toBe(true)
    let next = state
    applyAction(action as Parameters<typeof applyAction>[0], (patch) => { next = { ...next, ...(typeof patch === 'function' ? patch(next) : patch) } },
      () => {}, new URLSearchParams())
    return next.cohorts
  }

  it('takes a period end, or falls back to the main calendar\'s', () => {
    expect(apply({ type: 'add_cohort', cohort: { name: 'Clerical', frequency: 'Biweekly', periodEndDay: 'Saturday', payDay: 'Friday' } }))
      .toEqual([{ ...clerical, id: 'cohort-clerical', payDatesOfMonth: DEFAULTS.payDatesOfMonth }])
    expect(apply({ type: 'add_cohort', cohort: { name: 'Clerical', frequency: 'Biweekly' } })[0].periodEndDay).toBe(DEFAULTS.periodEndDay)
  })

  it('updates a cycle already on file instead of adding a duplicate', () => {
    const state = { ...structuredClone(DEFAULTS), cohorts: saveCycle([], clerical) }
    expect(apply({ type: 'add_cohort', cohort: { name: 'clerical', frequency: 'Weekly' } }, state).map((cycle) => [cycle.id, cycle.frequency]))
      .toEqual([['cohort-clerical', 'Weekly']])
  })

  it('refuses a period end that is not a weekday, or no name', () => {
    expect(isAction({ type: 'add_cohort', cohort: { name: 'Clerical', frequency: 'Biweekly', periodEndDay: 'Someday' } })).toBe(false)
    expect(isAction({ type: 'add_cohort', cohort: { name: ' ', frequency: 'Biweekly' } })).toBe(false)
  })
})
