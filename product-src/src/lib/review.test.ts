import { describe, expect, it } from 'vitest'
import { reconcileQuery } from '@/lib/review'

describe('payment table query', () => {
  it('preserves the cycle and rule selection while discarding obsolete review state', () => {
    const query = new URLSearchParams('flag=CS-16H&agent=1&review=done&cases=4839,4840')
    expect(Object.fromEntries(reconcileQuery('2026-08-24', query))).toEqual({ cycle: '2026-08-24', flag: 'CS-16H', agent: '1' })
    expect(query.get('review')).toBe('done')
  })

  it('clears the rule selection when returning to all payments', () => {
    const query = new URLSearchParams('flag=CS-16H&agent=1&review=done&cases=4839,4840')
    expect(Object.fromEntries(reconcileQuery('2026-08-24', query, true))).toEqual({ cycle: '2026-08-24', agent: '1' })
  })
})
