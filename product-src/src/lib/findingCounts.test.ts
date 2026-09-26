import { describe, expect, it } from 'vitest'
import { findingCounts } from './findingCounts'

describe('finding decision counts', () => {
  it('keeps escalated, approved and dismissed groups out of outstanding decisions', () => {
    expect(findingCounts([{ state: 'fixed' }, { state: 'escalated' }, { state: 'waiting' }])).toEqual({ toDecide: 0, waiting: 1, total: 1 })
  })
  it('counts only proposals and undecided judgment groups as decisions', () => {
    expect(findingCounts([{ state: 'proposed' }, { state: 'judgment' }, { state: 'escalated' }, { state: 'waiting' }])).toEqual({ toDecide: 2, waiting: 1, total: 3 })
  })
})
