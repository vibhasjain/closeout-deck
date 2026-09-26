import { describe, expect, it } from 'vitest'
import { appendTrace } from './chat'

describe('read traces', () => {
  it('caps only data reads and retains later distinct handbook reads', () => {
    const reads = ['Read data/gaps.md', 'Read data/threads/one.md', 'Read data/cycles/one.md',
      'Read data/four.md', 'Read handbooks/chase-missing-time.md', 'Read handbooks/mediation.md',
      'Read handbooks/disputes.md', 'Read handbooks/send-to-payroll.md']
    const traces = reads.reduce(appendTrace, [])
    expect(traces).toEqual(reads.filter(value => value !== 'Read data/four.md'))
    expect(appendTrace(traces, traces[0])).toBe(traces)
    expect(appendTrace(traces, 'Read handbooks/' + 'x'.repeat(241))).toBe(traces)
    expect(appendTrace(traces, 'Made up progress')).toBe(traces)
  })
  it('keeps the server\'s human data reads, capped at three per turn with handbook reads uncapped', () => {
    const reads = ['Read the dispute from Abel Alvarez', 'Read the thread with Travis Reed', 'Read handbooks/disputes.md',
      'Read the time entries for Sep 14 to 20', 'Read the decisions', 'Read handbooks/mediation.md']
    expect(reads.reduce(appendTrace, [])).toEqual(reads.filter(value => value !== 'Read the decisions'))
    expect(appendTrace([], 'Read the thread\nwith an injected line')).toEqual([])
  })
})
