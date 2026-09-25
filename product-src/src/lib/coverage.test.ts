import { describe, expect, it } from 'vitest'
import { goalProgress, onboardingComplete, sectionProgress } from '@/lib/coverage'
import { checklist } from '@/lib/checklist'
import { DEFAULTS, ONBOARD_TOPICS } from '@/lib/onboarding'

describe('onboarding coverage', () => {
  it('counts distinct known goals, independent of their order', () => {
    expect(goalProgress([])).toEqual({ done: 0, total: 7, progress: 0 })
    expect(goalProgress(['complaints', 'calendar', 'complaints', 'unknown'])).toEqual({ done: 2, total: 7, progress: 2 / 7 })
    expect(goalProgress([...ONBOARD_TOPICS].reverse()).progress).toBe(1)
  })
  it('fills the three section lines from basics, goal coverage, and the handoff', () => {
    expect(sectionProgress(DEFAULTS).map((section) => section.progress)).toEqual([0, 0, 0])
    expect(sectionProgress({ ...DEFAULTS, setupStep: 'trust', covered: ['clientHours', 'workerHours'] }).map((section) => section.progress)).toEqual([2 / 3, 0, 0])
    expect(sectionProgress({ ...DEFAULTS, setupStep: 'ready', covered: [...ONBOARD_TOPICS] }).map((section) => section.progress)).toEqual([1, 1, 0])
    expect(sectionProgress({ ...DEFAULTS, setupStep: 'ready', forwarded: true }).map((section) => section.progress)).toEqual([1, 1, 1])
  })
  it('never completes a later section before an earlier one, and waits for Finish', () => {
    for (const setupStep of ['welcome', 'basics', 'trust', 'intro', 'conversation', 'writing', 'ready', 'never-contact'] as const) {
      const progress = sectionProgress({ ...DEFAULTS, covered: [...ONBOARD_TOPICS], setupStep }).map((section) => section.progress)
      expect(progress[2]).toBe(0)
      if (setupStep !== 'ready') expect(sectionProgress({ ...DEFAULTS, covered: [...ONBOARD_TOPICS], forwarded: true, setupStep })[2].progress).toBe(0)
      if (progress[0] < 1) expect(progress[1]).toBe(0)
      if (setupStep === 'conversation') expect(progress[1]).toBeLessThan(1)
    }
    expect(sectionProgress({ ...DEFAULTS, setupStep: 'ready', forwarded: true }).every((section) => section.progress === 1)).toBe(true)
  })
  it('marks Getting started step one done only when forwarded', () => {
    const full = { ...structuredClone(DEFAULTS), covered: [...ONBOARD_TOPICS] }
    expect(onboardingComplete(full)).toBe(false)
    expect(checklist(full).items[0].done).toBe(false)
    expect(checklist({ ...full, forwarded: true }).items[0].done).toBe(true)
  })
})
