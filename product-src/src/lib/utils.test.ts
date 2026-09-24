import { describe, expect, it } from 'vitest'
import { titleCase } from '@/lib/utils'

describe('titleCase', () => {
  it('capitalizes label words but keeps short connectors, acronyms and counts', () => {
    expect(titleCase('Send to account manager')).toBe('Send to Account Manager')
    expect(titleCase("Tell the agent what's wrong")).toBe("Tell the Agent What's Wrong")
    expect(titleCase('Missing clock-out')).toBe('Missing Clock-Out')
    expect(titleCase('Semi-monthly (twice a month)')).toBe('Semi-Monthly (Twice a Month)')
    expect(titleCase('Waiting on worker')).toBe('Waiting on Worker')
    expect(titleCase('Sign in')).toBe('Sign In')
    expect(titleCase('ADP Time & Attendance / eTime')).toBe('ADP Time & Attendance / ETime')
  })
})
