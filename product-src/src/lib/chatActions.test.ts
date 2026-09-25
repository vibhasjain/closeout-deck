import { describe, expect, it, vi } from 'vitest'
import { actionSummary, applyAction, authorityPatch, isAction, allowedModelUrl, skippedLine, validatedActions, safeModelText } from '@/lib/chatActions'
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
        // A weekly cap only restricts (there was none), so it applies; the wider limit and texting wait in the Rulebook.
        authority: { autoFix: false, limit: 0, weeklyCap: 2000, textSupervisors: false, textWorkers: false, briefing: 'Email' },
        authoritySuggestion: { limit: 200, textWorkers: true }, authorityConfigured: false, neverContact: ['Pat Smith'], covered: ['workerHours'], frequency: 'Weekly',
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


describe('model output boundaries', () => {
  const firm = { name: 'Acme', domain: 'acme.com', summary: '', states: [], verticals: [], clientTypes: [], size: '', staffing: true }
  it('allows only HTTPS on the selected firm domain or its apple-touch-icon path', () => {
    expect(allowedModelUrl('https://acme.com/icon.png', firm, true)).toBe('https://acme.com/icon.png')
    expect(allowedModelUrl('/apple-touch-icon.png', firm, true)).toBe('https://acme.com/apple-touch-icon.png')
    for (const url of ['https://evil.tld/payroll.png', 'http://acme.com/icon.png', 'https://acme.com.evil.tld/icon', 'javascript:alert(1)', 'https://acme.com@evil.tld/icon', '//evil.tld/icon']) expect(allowedModelUrl(url, firm, true)).toBeNull()
    expect(validatedActions([{ type: 'set_firm', patch: { name: 'Acme Updated', domain: 'evil.tld', icon: 'https://evil.tld/steal' } }], firm))
      .toEqual({ actions: [{ type: 'set_firm', patch: { name: 'Acme Updated' } }], skipped: ['set_firm.domain', 'set_firm.icon'] })
  })
  it('removes unsafe URLs from any nested model value and prose, preserving valid actions', () => {
    const result = validatedActions([{ type: 'add_source', set: 1, kind: 'sheet', label: 'Hours', how: 'Share at https://evil.tld/private' }, { type: 'never_contact', name: 'Pat' }, { type: 'set_profile', field: 'notes', value: 'x'.repeat(201) }], firm)
    expect(result.actions).toEqual([{ type: 'add_source', set: 1, kind: 'sheet', label: 'Hours', how: 'Share at' }, { type: 'never_contact', name: 'Pat' }])
    expect(result.skipped).toEqual(['add_source URL', 'set_profile'])
    expect(safeModelText('Open https://evil.tld and https://acme.com/about', firm)).toBe('Open  and https://acme.com/about')
  })
  it('proposes wider authority, applies narrowing, and deduplicates and removes rules and sources', () => {
    let state: Onboarding = { ...structuredClone(DEFAULTS), authorityConfigured: true }
    const update = (patch: Partial<Onboarding> | ((state: Onboarding) => Partial<Onboarding>)) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) } }
    const apply = (action: Action) => applyAction(action, update, () => {}, new URLSearchParams())
    apply({ type: 'set_authority', patch: { limit: 500, textWorkers: true, textSupervisors: false } })
    expect(state.authority).toMatchObject({ limit: 100, textWorkers: false, textSupervisors: false })
    expect(state.authoritySuggestion).toEqual({ limit: 500, textWorkers: true })
    apply({ type: 'set_authority', patch: { autoFix: false, limit: 0 } })
    expect(state.authority).toMatchObject({ autoFix: false, limit: 0 })
    apply({ type: 'add_rule', sentence: 'Ask about gaps' }); apply({ type: 'add_rule', sentence: ' ask about gaps ' })
    expect(state.customRules).toHaveLength(1)
    apply({ type: 'remove_rule', sentence: 'ASK ABOUT GAPS' })
    apply({ type: 'add_source', set: 1, kind: 'email', label: 'Old inbox' })
    apply({ type: 'remove_source', set: 1, label: 'old inbox' })
    expect(state.customRules).toEqual([]); expect(state.sources).toEqual([])
  })
  it('accepts US territories and rejects long strings and external navigation', () => {
    expect(isAction({ type: 'set_firm', patch: { states: ['PR', 'FL'] } })).toBe(true)
    expect(isAction({ type: 'add_rule', sentence: 'x'.repeat(201) })).toBe(false)
    expect(isAction({ type: 'go', to: 'https://evil.tld' })).toBe(false)
    expect(isAction({ type: 'go', to: '//evil.tld' })).toBe(false)
  })
})

describe('E2E D8 and skipped notes: the Applied line says what really happened', () => {
  it('D8: a source plan reads as a plan, never as a load', () => {
    expect(actionSummary({ type: 'add_source', set: 3, kind: 'sample', label: 'Sample location data' })).toBe('Planned: Sample location data')
    expect(actionSummary({ type: 'add_source', set: 1, kind: 'email', label: 'Worker texts', how: 'forward to closeout@example.com' })).toBe('Planned: Worker texts · forward to closeout@example.com')
    expect(actionSummary({ type: 'remove_source', set: 1, label: 'Old inbox' })).toBe('Removed plan: Old inbox')
    expect(actionSummary({ type: 'add_source', set: 2, kind: 'sample', label: 'Lonestar' })).not.toMatch(/Added|loaded|connected/i)
  })
  it('D4: authority lines say saved only when nothing widens without consent', () => {
    expect(actionSummary({ type: 'set_authority', patch: { autoFix: false, textWorkers: false } })).toBe('Saved: Ask before every fix · ask before texting workers')
    expect(actionSummary({ type: 'set_authority', patch: { textSupervisors: true } })).toBe('Suggested: Text site supervisors · confirm it in the Rulebook')
    expect(actionSummary({ type: 'set_authority', patch: { autoFix: true, limit: 100 }, consent: true })).toBe('Saved: Fix up to $100 per entry without asking')
  })
  it('skipped notes are human and offer a retry only for model output the app rejected', () => {
    expect(skippedLine(['set_profile', 'card URL'])).toEqual({ text: "I couldn't save part of that.", retry: true })
    expect(skippedLine(['Action outcome unconfirmed after reload; review the cycle before trying again'])).toEqual({ text: 'Action outcome unconfirmed after reload; review the cycle before trying again', retry: false })
    expect(skippedLine(['set_profile']).text).not.toMatch(/set_profile|Skipped/)
  })
})

describe('owner decision: the weekly cap is never invented and never $0', () => {
  it('stores no $0 cap: with fixing allowed it means no cap was stated, alone it means ask first', () => {
    expect(authorityPatch({ autoFix: true, limit: 100, weeklyCap: 0 })).toEqual({ autoFix: true, limit: 100, weeklyCap: null })
    expect(authorityPatch({ weeklyCap: 0 })).toEqual({ autoFix: false, weeklyCap: null })
    expect(authorityPatch({ limit: 50, weeklyCap: 500 })).toEqual({ limit: 50, weeklyCap: 500 })
    expect(actionSummary({ type: 'set_authority', patch: { autoFix: true, limit: 100, weeklyCap: null }, consent: true })).toBe('Saved: Fix up to $100 per entry without asking')
  })
  it('treats dropping a cap as widening and adding one as a restriction', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
    try {
      updateOnboarding({ ...structuredClone(DEFAULTS), authorityConfigured: true, authority: { ...DEFAULTS.authority, weeklyCap: null } })
      const update = (patch: Partial<Onboarding> | ((state: Onboarding) => Partial<Onboarding>)) => updateOnboarding(typeof patch === 'function' ? patch(getOnboarding()) : patch)
      applyAction({ type: 'set_authority', patch: { weeklyCap: 800 } }, update, () => {}, new URLSearchParams())
      expect(getOnboarding().authority.weeklyCap).toBe(800)
      applyAction({ type: 'set_authority', patch: { weeklyCap: 0 } }, update, () => {}, new URLSearchParams())
      expect(getOnboarding().authority).toMatchObject({ autoFix: false, weeklyCap: 800 })
      expect(getOnboarding().authoritySuggestion).toMatchObject({ weeklyCap: null })
    } finally { vi.unstubAllGlobals() }
  })
})
