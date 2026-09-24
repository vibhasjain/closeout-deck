import { describe, it, expect } from 'vitest'
import { selfCheck, makeWeek, runEngine } from './engine.js'
import { buildCycles } from '@/lib/desk'
import { DEFAULTS } from '@/lib/onboarding'   // export DEFAULTS
describe('bench engine', () => {
  it('passes its own self-check', () => { expect(selfCheck().every(l => l.startsWith('ok:'))).toBe(true) })
  it('scripted week has the 78 discrepancies', () => {
    const run = runEngine(makeWeek({ seed: 20260824, scripted: true, start: '2026-08-24' }))
    expect(run.totals.flags).toBe(78); expect(run.totals.held).toBe(5)
  })
  it('builds 26 cycles with unique shift ids and one scripted cycle', () => {
    const cs = buildCycles(DEFAULTS, new Date('2026-09-22'))
    expect(cs).toHaveLength(26); expect(cs.filter(c => c.scripted)).toHaveLength(1)
    const ids = cs.flatMap(c => c.week.map(s => s.id)); expect(new Set(ids).size).toBe(ids.length)
  })
})
