import assert from 'node:assert/strict'
import test from 'node:test'
import { replyBy } from '../../src/lib/cycles.ts'
import { dateKey } from '../src/data.ts'
import { draftAsk, type CycleSummary } from '../src/journey.ts'
import { calendarFrom } from '../src/pipeline.ts'

// D10: the QA ran on Fri Sep 25 2026 and the drafted ask said "Payroll closes Monday 9/21".
const summary: CycleSummary = { id: '2026-09-20', start: '2026-09-14', cutoff: '2026-09-21', deadline: '2026-09-23',
  counts: { set1: 1, set2: 1, set3: 0 }, gaps: [], groups: [], supervisors: {} }
const calendar = calendarFrom({ frequency: 'Weekly', periodEndDay: 'Sunday', payDay: 'Friday', cutoffDays: 1, deadlineDays: 2 })
const local = (date: string) => new Date(`${date}T00:00:00`)
const cycle = { cutoff: local(summary.cutoff), deadline: local(summary.deadline) }

test('an ask never gives a reply-by date in the past', () => {
  assert.equal(dateKey(replyBy(cycle, calendar, local('2026-09-20'))), '2026-09-21', 'the cutoff while it is ahead')
  assert.equal(dateKey(replyBy(cycle, calendar, local('2026-09-22'))), '2026-09-23', 'then this run\'s Payroll deadline')
  const due = dateKey(replyBy(cycle, calendar, local('2026-09-25')))
  assert.equal(due, '2026-09-30', 'then the next Payroll deadline on the calendar')
  const gap = { id: 'Lonestar Packaging|Ana Reid|0', worker: 'Ana Reid', client: 'Lonestar Packaging', day: 0 }
  for (const kind of ['worker', 'site'] as const) {
    const text = draftAsk({ kind, name: kind === 'worker' ? 'Ana Reid' : 'Sam Ortiz' }, [gap, { ...gap, id: 'x', day: 1 }], summary, due)
    assert.match(text, /Payroll closes Wednesday 9\/30/)
    assert.doesNotMatch(text, /9\/21|9\/23/)
    assert.doesNotMatch(text, /\bshifts?\b/i)
  }
})
