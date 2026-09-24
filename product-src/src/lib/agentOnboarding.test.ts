import { describe, expect, it } from 'vitest'
import { APPROVED, CATALOG_STATES, list, RULEBOOK, SAMPLE_CONTRACT, SOURCE_PHRASES, sourcesLine, split, STAGES, TURNS, turnOf, typedPick, typedPicks, WORKER_CHANNELS } from '@/lib/agentOnboarding'
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

describe('agent setup turns', () => {
  it('reads the turn from the URL and lists answers the way the agent says them', () => {
    expect([turnOf(null), turnOf('0'), turnOf('7'), turnOf('99'), turnOf('x')]).toEqual([1, 1, 7, 15, 1])
    expect([list([]), list(['Beeline']), list(['Beeline', 'SAP Fieldglass', 'Utmost'])]).toEqual(['', 'Beeline', 'Beeline, SAP Fieldglass and Utmost'])
  })

  it('asks how time arrives before the demo, and the systems after it', () => {
    expect(TURNS).toBe(15)
    expect(STAGES.map((stage, i) => `${i + 1} ${stage}`).filter((_, i) => STAGES[i] !== STAGES[i - 1])).toEqual(['1 Welcome', '2 Pay cycle', '6 How time gets reported',
      '9 See it work', '11 Systems of record', '14 Your rules', '15 Access'])
    expect(STAGES.lastIndexOf('How time gets reported')).toBeLessThan(STAGES.indexOf('See it work'))
  })

  it('reads a typed reply as the answer it names, a plain yes or no, or nothing when unclear', () => {
    const periods = ['Daily', 'Weekly', 'Bi-weekly (every 2 weeks)', 'Semi-monthly (twice a month)', 'Monthly', 'Varies by client', 'Other', 'Not sure']
    expect(['weekly', 'Biweekly', 'semi-monthly', 'varies', 'monthly please'].map((text) => typedPick(text, periods))).toEqual([1, 2, 3, 5, 4])
    expect(['yes', 'Yep, looks right.', 'no', 'nope'].map((text) => typedPick(text, ["That's right", 'Change']))).toEqual([0, 0, 1, 1])
    expect(['no', "that's all", 'Yes'].map((text) => typedPick(text, ['Add another', "That's all"]))).toEqual([1, 1, 0])
    expect(typedPick('no', ['No, just this one', 'Add another'])).toBe(0)
    expect(typedPick('none', ['SAP Fieldglass', 'Other', 'Not applicable'])).toBe(2)
    expect(typedPicks('text and email, Bullhorn T&A; plus text', WORKER_CHANNELS)).toEqual(['Text / SMS', 'Email (photo or PDF of timesheet)', 'Bullhorn T&A'])
    expect(typedPicks('Bullhorn T&A', WORKER_CHANNELS)).toEqual(['Bullhorn T&A'])
    expect(['ADP', 'Clerical', '', 'no'].map((text) => typedPick(text, ['ADP Workforce Now', 'ADP Vantage HCM / Enterprise', 'Not sure']))).toEqual([-1, -1, -1, -1])
  })

  it.each(['Show Me the Magic', 'show me the magic', 'SHOW ME THE MAGIC', 'yes', 'Yep, looks right.'])('starts the demo from a typed reply: %s', (text) => {
    expect(typedPick(text, ['Show Me the Magic'])).toBe(0)
  })

  it('opens the demo with the user\'s first real time sources', () => {
    expect(sourcesLine({ workerChannels: ['Text / SMS', 'Our own mobile app'], approved: ['VMS export or VMS approval feed'] }))
      .toBe('You get time from texts and approved time from the VMS.')
    expect(sourcesLine({ workerChannels: ["They don't - we take time from the client's system"], approved: ['Other', 'PDF timesheet emailed by the client'] }))
      .toBe('You get approved time from emailed PDFs.')
    expect(sourcesLine({ workerChannels: ['Not sure'], approved: [] })).toBe('')
    expect(sourcesLine({ workerChannels: ['Other', 'Bullhorn T&A'], approved: ['Not applicable'] })).toBe('You get time from Bullhorn T&A.')
    expect(sourcesLine({ workerChannels: ['Varies by client'], approved: [] })).toBe('')
    expect(Object.keys(SOURCE_PHRASES).filter((pick) => !WORKER_CHANNELS.includes(pick) && !APPROVED.includes(pick))).toEqual([])
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
