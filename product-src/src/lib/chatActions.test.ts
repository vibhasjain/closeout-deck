import { describe, expect, it, vi } from 'vitest'
import { actionSummary, applyAction, isAction } from '@/components/chat/ChatPane'
import { DEFAULTS, getOnboarding, updateOnboarding } from '@/lib/onboarding'
import type { Onboarding } from '@/lib/onboarding'
import type { Action } from '@/lib/chat'
import { invalidate } from '@/lib/data'
vi.mock('@/lib/data', () => ({ invalidate: vi.fn(async () => {}) }))

const valid: Action[] = [
  { type: 'set_profile', field: 'workerHours', value: 'Email from workers' },
  { type: 'set_profile', field: 'ratesWhere', value: { source: 'Client contract', owner: 'Payroll' } },
  { type: 'set_firm', patch: { name: 'Acme Staffing', domain: 'acmestaffing.com', states: ['CA', 'TX'], staffing: true } },
  { type: 'add_source', set: 1, kind: 'email', label: 'Worker time entries', how: 'Forward weekly emails' },
  { type: 'set_authority', patch: { autoFix: false, limit: 200, weeklyCap: 2000, textSupervisors: false, textWorkers: true } },
  { type: 'never_contact', name: 'Pat Smith' },
  { type: 'cover_topic', topic: 'workerHours' },
]
const invalid: unknown[] = [
  { type: 'set_profile', field: 'bankAccount', value: 'No' },
  { type: 'set_profile', field: 'notes', value: 'x'.repeat(201) },
  { type: 'set_profile', field: 'notes', value: { nested: {} } },
  { type: 'set_profile', field: 'notes', value: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [String(i), 'x'])) },
  { type: 'set_firm', patch: { unexpected: true } },
  { type: 'set_firm', patch: { states: ['Atlantis'] } },
  { type: 'set_firm', patch: { icon: 'javascript:alert(1)' } },
  { type: 'set_firm', patch: { staffing: 'true' } },
  { type: 'add_source', set: 4, kind: 'email', label: 'Time' },
  { type: 'add_source', set: '1', kind: 'email', label: 'Time' },
  { type: 'add_source', set: 1, kind: 'unknown', label: 'Time' },
  { type: 'add_source', set: 1, kind: 'email', label: '' },
  { type: 'set_authority', patch: { limit: 10_001 } },
  { type: 'set_authority', patch: { limit: -1 } },
  { type: 'set_authority', patch: { weeklyCap: 100_001 } },
  { type: 'set_authority', patch: { weeklyCap: Number.NaN } },
  { type: 'set_authority', patch: { autoFix: 'true' } },
  { type: 'set_authority', patch: { canSendPayroll: true } },
  { type: 'never_contact', name: '   ' },
  { type: 'never_contact', name: 'x'.repeat(201) },
  { type: 'cover_topic', topic: 'unknown' },
]

describe('onboarding action validation', () => {
  it('accepts server-applied facts and rejects malformed envelopes', () => {
    expect(isAction({ type: 'set_fact', kind: 'site', key: 'pacific', value: { state: 'CA', minWage: 16.9 } })).toBe(true)
    for (const action of [
      { type: 'set_fact', kind: 'unknown', key: 'x', value: {} },
      { type: 'set_fact', kind: 'account', key: '', value: {} },
      { type: 'set_fact', kind: 'account', key: 'timezone', value: 'UTC' },
    ]) expect(isAction(action)).toBe(false)
  })
  it('refreshes server-applied facts without rewriting the state doc', () => {
    const update = vi.fn()
    applyAction({ type: 'set_fact', kind: 'account', key: 'timezone', value: { value: 'UTC' } }, update, vi.fn(), new URLSearchParams())
    expect(update).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalled()
  })
  it.each(valid)('accepts $type', (action) => expect(isAction(action)).toBe(true))
  it.each(invalid)('rejects malformed action %#', (action) => expect(isAction(action)).toBe(false))
  it('accepts both endpoints of the authority ranges', () => {
    expect(isAction({ type: 'set_authority', patch: { limit: 0, weeklyCap: 0 } })).toBe(true)
    expect(isAction({ type: 'set_authority', patch: { limit: 10_000, weeklyCap: 100_000 } })).toBe(true)
  })
})

describe('onboarding action writes', () => {
  it('persists every new action and preserves other fields in a patch', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
    try {
      updateOnboarding(structuredClone(DEFAULTS))
      const update = (patch: Partial<Onboarding> | ((state: Onboarding) => Partial<Onboarding>)) => updateOnboarding(typeof patch === 'function' ? patch(getOnboarding()) : patch)
      for (const action of valid) applyAction(action, update, () => {}, new URLSearchParams())
      expect(getOnboarding()).toMatchObject({
        profile: { workerHours: 'Email from workers', ratesWhere: { source: 'Client contract', owner: 'Payroll' } },
        firm: { name: 'Acme Staffing', states: ['CA', 'TX'], staffing: true },
        sources: [{ set: 1, kind: 'email', label: 'Worker time entries', how: 'Forward weekly emails' }],
        authority: { autoFix: false, limit: 200, weeklyCap: 2000, textSupervisors: false, textWorkers: true, briefing: 'Email' },
        authorityConfigured: true, neverContact: ['Pat Smith'], covered: ['workerHours'], frequency: 'Weekly',
      })
      expect(JSON.parse(storage.get('closeout-onboarding-v2')!).covered).toEqual(['workerHours'])
      applyAction({ type: 'set_firm', patch: { size: '250 people' } }, update, () => {}, new URLSearchParams())
      expect(getOnboarding().firm).toMatchObject({ name: 'Acme Staffing', size: '250 people' })
      applyAction({ type: 'cover_topic', topic: 'workerHours' }, update, () => {}, new URLSearchParams())
      applyAction({ type: 'never_contact', name: ' pat smith ' }, update, () => {}, new URLSearchParams())
      applyAction({ type: 'add_source', set: 1, kind: 'email', label: 'Worker time entries', how: 'Forward Friday emails' }, update, () => {}, new URLSearchParams())
      expect(getOnboarding().covered).toEqual(['workerHours'])
      expect(getOnboarding().neverContact).toEqual(['Pat Smith'])
      expect(getOnboarding().sources).toHaveLength(1)
      expect(getOnboarding().sources[0].how).toBe('Forward Friday emails')
    } finally { vi.unstubAllGlobals() }
  })
  it.each(valid)('summarizes $type as an applied change', (action) => {
    expect(actionSummary(action)).toEqual(expect.any(String))
    expect(actionSummary(action)).not.toBe('')
  })
})
