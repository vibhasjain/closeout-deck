import { describe, expect, it } from 'vitest'
import { CATALOG_STATES, list, RULEBOOK, SAMPLE_CONTRACT, split } from '@/lib/agentOnboarding'
import { acceptProposal, clarify, propose } from '@/lib/ruleIntake'
import { DEFAULTS } from '@/lib/onboarding'
import { buildSample, findings } from '@/lib/sample'

describe('agent authority split', () => {
  const found = findings(buildSample(), (day) => `day ${day}`)
  const ids = (authority: Partial<typeof DEFAULTS.authority>) => {
    const { fixed, stopped } = split(found, { ...DEFAULTS.authority, ...authority })
    return { fixed: fixed.map((f) => f.id), stopped: stopped.map(({ finding, why }) => [finding.id, why]) }
  }

  it('fixes small clock-backed worker pay under the weekly cap and stops client, margin and large items', () => {
    expect(ids({})).toEqual({ fixed: [5, 6], stopped: [[1, 'Touches a client invoice'], [2, 'Touches a client invoice'], [3, 'Over $100'],
      [4, 'Over the $1,000 weekly cap'], [7, 'Changes a client bill rate']] })
  })

  it('lets larger findings back in as the weekly cap rises', () => {
    expect(ids({ weeklyCap: 5000 }).fixed).toEqual([4, 5, 6])
    expect(ids({ weeklyCap: 5000, limit: 200 }).fixed).toEqual([3, 4, 5, 6])
  })

  it('moves items to stopped as the limit drops', () => {
    expect(ids({ weeklyCap: 5000, limit: 10 }).fixed).toEqual([5])
  })

  it('stops everything when it may not fix on its own, or the cap is below the smallest fix', () => {
    expect(ids({ autoFix: false }).fixed).toEqual([])
    expect(ids({ autoFix: false }).stopped).toHaveLength(7)
    expect(ids({ weeklyCap: 100 }).fixed).toEqual([])
    expect(ids({ weeklyCap: 100 }).stopped).toHaveLength(7)
  })
})

describe('agent-driven setup support', () => {
  it('formats user supplied facts without deciding a question or a next turn', () => {
    expect([list([]), list(['Beeline']), list(['Beeline', 'SAP Fieldglass', 'Utmost'])]).toEqual(['', 'Beeline', 'Beeline, SAP Fieldglass and Utmost'])
  })

  it('starts with no assumed firm, covered topics, or operator profile', () => {
    expect(DEFAULTS).toMatchObject({ firm: null, profile: {}, covered: [], sources: [], neverContact: null, setupStep: 'welcome', setupHistory: [], setupRequest: null })
  })
})

describe('agent setup rules', () => {
  const empty = { customRules: [], rules: [], proposals: [] }

  it('shows the rulebook the engine runs, and only states the catalog names', () => {
    expect(RULEBOOK.map(({ title, rules }) => [title, rules.length])).toEqual([['Federal', 4], ['California', 5], ['Other states and cities', 3], ['Timekeeping', 9], ['Contracts and sites', 6]])
    expect(CATALOG_STATES).not.toContain('Texas')
  })

  it('reads the sample contract clause by clause, for the client, and never proposes it twice', () => {
    const { incoming, proposals } = propose(empty, [SAMPLE_CONTRACT])
    expect(incoming.map((p) => [p.cite, p.scope, p.effective])).toEqual(['2.1', '2.2', '2.3', '2.4'].map((n) => [`Clause ${n}`, 'Lonestar Packaging', '2026-10-05']))
    expect(incoming[0].text).toBe('Hours worked from 10:00 PM to 6:00 AM carry a $1.50/hr night differential')
    expect(propose({ ...empty, proposals }, [SAMPLE_CONTRACT]).incoming).toEqual([])
  })

  it('files an accepted proposal where the Rules page reads it', () => {
    const { incoming, proposals } = propose(empty, [SAMPLE_CONTRACT])
    const next = acceptProposal({ ...empty, proposals }, incoming[1])
    expect(next.customRules.map((rule) => [rule.id, rule.sentence, rule.draft])).toEqual([[incoming[1].id, incoming[1].text, false]])
    expect(next.rules[0]).toMatchObject({ scope: 'Lonestar Packaging', cite: 'Clause 2.2' })
    expect(next.proposals.map((p) => p.id)).not.toContain(incoming[1].id)
  })

  it('asks for a threshold only when a typed rule has no number', () => {
    expect(clarify('Flag overtime nobody approved')).toEqual({ question: 'What hours threshold should this use?', options: ['8 hours', '40 hours'] })
    expect(clarify('Flag any meal break under 30 minutes')).toBeNull()
  })
})
