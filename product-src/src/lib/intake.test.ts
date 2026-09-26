import { describe, expect, it } from 'vitest'
import { buildCycles } from '@/lib/desk'
import { buildIntake, cycleIntake, dueTone, gapId, gapKey, hour, isLate, lastExpected, PLANTED, stepOf, usually, WALL_CLOCK, type Expected } from '@/lib/intake'
import { DEFAULTS } from '@/lib/onboarding'

// Mon Sep 14 2026 to Sun Sep 20; hours due Mon Sep 21 noon.
const start = new Date(2026, 8, 14)
const cycle = { id: '2026-09-20', start, end: new Date(2026, 8, 20), cutoff: new Date(2026, 8, 21), status: 'needs-review' as const }
const entry = (worker: string, client: string, day: number, source: string): Expected => ({ worker, client, day, source })
const expected = [entry('Ana', 'Pacific', 0, 'ukg-ready'), entry('Ben', 'Pacific', 1, 'ukg-ready'),
  entry('Cy', 'Lonestar', 0, 'adp-wfn'), entry('Di', 'Bayview', 5, 'wallclock'), entry('Ed', 'Bayview', 1, 'wallclock')]
const received = new Set([expected[0], expected[2], expected[4]].map(gapId))
const now = new Date(2026, 8, 21, 9)
const lastReceived = { 'ukg-ready': new Date(2026, 8, 21, 4), 'adp-wfn': new Date(2026, 8, 21, 2), wallclock: new Date(2026, 8, 18, 18) }
const build = (accepted = {}) => buildIntake({ cycleId: cycle.id, start, expected, received, lastReceived, accepted, now })

describe('intake', () => {
  it('groups expected time entries by client, then source', () => {
    const intake = build()
    expect(intake).toMatchObject({ expected: 5, received: 3, open: 2 })
    expect(intake.clients.map((client) => [client.name, client.received, client.expected, client.sources.map((row) => row.source.id)])).toEqual([
      ['Bayview', 1, 2, ['wallclock']], ['Pacific', 1, 2, ['ukg-ready']], ['Lonestar', 1, 1, ['adp-wfn']]])
  })

  it('calls a source late against its own usual send, not the cutoff', () => {
    const sunday = { day: 0, at: 23 * 60 }
    expect(lastExpected(sunday, now)).toEqual(new Date(2026, 8, 20, 23))
    expect(lastExpected({ at: 4 * 60 }, new Date(2026, 8, 21, 3))).toEqual(new Date(2026, 8, 20, 4))
    expect(isLate(new Date(2026, 8, 18, 18), sunday, new Date(2026, 8, 20, 22))).toBe(false)
    expect(isLate(new Date(2026, 8, 18, 18), sunday, new Date(2026, 8, 20, 23, 30))).toBe(true)
    expect(build().clients[0].sources[0]).toMatchObject({ late: true, pending: 1, missing: [] })
    expect(usually(sunday)).toBe('Sun night')
    expect(usually({ at: 4 * 60 })).toBe('nightly at 4am')
    expect([hour(12 * 60), hour(18 * 60), hour(30)]).toEqual(['noon', '6pm', '12:30am'])
  })

  it('reports a scheduled entry as missing once its source has sent past that day', () => {
    const pacific = build().clients.find((client) => client.name === 'Pacific')!.sources[0]
    expect(pacific).toMatchObject({ pending: 0, late: false })
    expect(pacific.missing.map((gap) => gap.worker)).toEqual(['Ben'])
    const early = buildIntake({ cycleId: cycle.id, start, expected, received, now, lastReceived: { ...lastReceived, 'ukg-ready': new Date(2026, 8, 15, 4) } })
    expect(early.clients.find((client) => client.name === 'Pacific')!.sources[0]).toMatchObject({ pending: 1, missing: [] })
  })

  it('leaves gaps closed as not worked out of the count, until undone', () => {
    const key = gapKey(cycle.id, gapId(expected[1]))
    const closed = build({ [key]: { reason: 'No-show', at: '2026-09-21T10:00:00Z' } })
    expect(closed).toMatchObject({ expected: 4, received: 3, open: 1 })
    expect(closed.closed).toMatchObject([{ worker: 'Ben', reason: 'No-show' }])
    expect(closed.clients.find((client) => client.name === 'Pacific')!.open).toBe(0)
    expect(build({})).toMatchObject({ expected: 5, open: 2, closed: [] })
    expect(build({ [key]: { reason: '  ', at: '2026-09-21T10:00:00Z' } })).toMatchObject({ expected: 5, open: 2, closed: [] })
  })

  it('lets an explicit step or a view in the URL pick the step', () => {
    expect(stepOf(new URLSearchParams('step=intake&filter=needs-review'), 'review')).toBe('intake')
    expect(stepOf(new URLSearchParams('filter=needs-review'), 'intake')).toBe('review')
    expect(stepOf(new URLSearchParams('cycle=x'), 'intake')).toBe('intake')
    expect([dueTone(cycle, new Date(2026, 8, 20, 11)), dueTone(cycle, new Date(2026, 8, 20, 13)), dueTone(cycle, new Date(2026, 8, 21, 12))]).toEqual([undefined, 'soon', 'late'])
  })

  it('plants four missing entries and a late wall clock in the week awaiting review only', () => {
    const cycles = buildCycles(DEFAULTS, new Date(2026, 8, 24))
    const pending = cycles.find((item) => item.status === 'needs-review')!
    const state = { acceptedGaps: {}, uploads: {} }
    const at = new Date(2026, 8, 24, 10)
    for (const gap of PLANTED) {
      const days = pending.week.filter((shift) => shift.worker === gap.worker && shift.fac.name === gap.client).map((shift) => shift.day)
      expect(days.length, gap.worker).toBeGreaterThan(0)
      expect(days).not.toContain(gap.day)
    }
    const intake = cycleIntake(pending, state, at)
    const pendingOnClock = WALL_CLOCK.filter((item) => item.day > 4).length
    expect(intake).toMatchObject({ expected: pending.week.length + PLANTED.length + WALL_CLOCK.length, open: PLANTED.length + pendingOnClock })
    expect(intake.clients.flatMap((client) => client.sources.flatMap((row) => row.missing.map((gap) => gap.worker)))).toEqual(expect.arrayContaining(PLANTED.map((gap) => gap.worker)))
    expect(intake.clients.find((client) => client.name === 'Bayview Warehouse')!.sources[0]).toMatchObject({ late: true, pending: pendingOnClock })
    const uploaded = cycleIntake(pending, { ...state, uploads: { [gapKey(pending.id, 'wallclock')]: { files: ['bayview.xlsx'], entries: pendingOnClock } } }, at)
    expect(uploaded.open).toBe(PLANTED.length)
    expect(cycles.filter((item) => item !== pending).every((item) => cycleIntake(item, state, at).open === 0)).toBe(true)
  })
})

it('reuses server intake across route renders and refreshes after an accepted gap changes', () => {
  const cycle = { id: '2026-09-20', start: new Date(2026, 8, 14), end: new Date(2026, 8, 20), cutoff: new Date(2026, 8, 21), status: 'needs-review' as const, server: true, week: [],
    intake: { sources: [{ id: 'source', name: 'ADP', short: 'ADP', set: 1 as const, method: 'upload', lastReceived: '2026-09-21T12:00:00Z' }], expected: [{ worker: 'Alex', client: 'Site', day: 1, source: 'source' }], received: [] } }
  const state = { acceptedGaps: {}, uploads: {} }, now = new Date(2026, 8, 22)
  const first = cycleIntake(cycle, state, now)
  expect(cycleIntake(cycle, state, now)).toBe(first)
  expect(first.open).toBe(1)
  const accepted = cycleIntake(cycle, { ...state, acceptedGaps: { '2026-09-20:Site|Alex|1': { reason: 'Confirmed absent', at: now.toISOString() } } }, now)
  expect(accepted).not.toBe(first)
  expect(accepted.open).toBe(0)
})
