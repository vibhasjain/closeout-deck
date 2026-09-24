import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOG } from '@/bench/catalog.js'
import { RULES, type Row } from '@/bench/engine.js'
import { PROV, SCOPE_TEXT } from '@/bench/prov'
import { RuleDetail } from '@/components/RuleDetail'
import { AuxProvider } from '@/components/shell/Aux'
import { OverlayProvider } from '@/components/shell/Overlay'
import { bucketHue, buildCycles, kindLabel, type DeskCycle } from '@/lib/desk'
import { titleCase } from '@/lib/utils'
import { DEFAULTS, useOnboarding, type CustomDeskRule, type Onboarding } from '@/lib/onboarding'
import { formatRuleDate, formatRuleText, getRuleActivity } from '@/lib/rules'
import { acceptProposal, compileRule, propose } from '@/lib/ruleIntake'
import { Rules } from '@/pages/Rules'

vi.mock('@/lib/onboarding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/onboarding')>()
  return { ...actual, useOnboarding: vi.fn() }
})

const today = new Date(2026, 8, 22, 12)
let state: Onboarding
let cycle: DeskCycle

function render(element: ReactElement, url = '/rules') {
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] },
    h(OverlayProvider, null, h(AuxProvider, null, element)),
  ))
}

const rowIds = (html: string) => [...html.matchAll(/data-rule="([^"]+)"/g)].map((match) => match[1])
const links = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll('&amp;', '&'))
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ')
const textMarkup = (value: string) => renderToStaticMarkup(h('span', null, value)).slice(6, -7)

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(today)
  state = { ...DEFAULTS, customRules: [], rules: [], proposals: [] }
  vi.mocked(useOnboarding).mockImplementation(() => [state, vi.fn()] as const)
  cycle = buildCycles(state, today)[0]
})
afterEach(() => vi.useRealTimers())

describe('rules table', () => {
  it('shows the 30 engine rules by bucket with creation and lifetime activity columns', () => {
    const html = render(h(Rules))
    const table = html.match(/<table\b[^>]*aria-label="Rulebook"[\s\S]*?<\/table>/)![0]
    expect(RULES).toHaveLength(30)
    expect(rowIds(table).sort()).toEqual(RULES.map((rule) => rule.id).sort())
    expect([...table.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((match) => match[1]))
      .toEqual(['Bucket', 'Rule', 'Created', 'Last Used', 'Uses'])
    // The bucket is the rule's only classification, and rows sit together by bucket.
    const buckets = [...table.matchAll(/<span class="bucket-tag"[^>]*>(.*?)<\/span>/g)].map((match) => match[1])
    expect(buckets).toEqual(RULES.map((rule) => titleCase(kindLabel(rule.id))).sort((a, b) => a.localeCompare(b)))
    expect(visibleText(table)).not.toMatch(/\b(?:Deterministic|LLM|Kind)\b/)
    for (const rule of RULES) expect(visibleText(table), rule.id).not.toContain(rule.id)
    expect(table).not.toContain('<th scope="colgroup"')
    const counts = [...table.matchAll(/<td[^>]*class="[^"]*rule-uses[^"]*"[^>]*>(.*?)<\/td>/g)].map((match) => match[1])
    expect(counts).toHaveLength(30)
    expect(counts.every((count) => /^[\d,]+$/.test(count))).toBe(true)
    expect(table).not.toContain('This cycle')
    expect(table).not.toContain('clamp-2')
    const dates = [...table.matchAll(/<time dateTime="\d{4}-\d{2}-\d{2}">(.*?)<\/time>/g)].map((match) => match[1])
    expect(dates.length).toBeGreaterThanOrEqual(30)
    expect(dates.every((date) => /^[A-Z][a-z]{2} \d{1,2}$/.test(date))).toBe(true)
    expect(visibleText(html)).not.toMatch(/\b(?:Live|Pack|Draft|Expiring)\b/i)
    expect(html).not.toContain('engine rules')
    expect(html).not.toContain('class="info-bar"')
    expect(html).not.toContain(cycle.label)
    for (const rule of CATALOG) expect(rowIds(table)).not.toContain(rule.id)
  })

  it('includes the user’s custom rules while keeping unaccepted document proposals out of the table', () => {
    const custom: CustomDeskRule = {
      id: 'CUST-NIGHT', bucket: 'Custom', kind: 'det', sentence: 'Pay a $2 hourly night differential.',
      source: { doc: 'Owner instruction' }, draft: true, at: today.getTime(),
    }
    state.customRules = [custom]
    state.proposals = [{
      id: 'DOC-PENDING', text: 'Pay a $3 weekend differential.', source: 'Handbook',
      scope: null, cite: null, effective: null, conflict: null,
    }]
    const html = render(h(Rules))
    const table = html.match(/<table\b[^>]*aria-label="Rulebook"[\s\S]*?<\/table>/)![0]
    expect(rowIds(table).sort()).toEqual([...RULES.map((rule) => rule.id), custom.id].sort())
    expect(table).toContain(formatRuleText(custom.sentence))
    expect(table).not.toContain(custom.sentence)
    const customRow = table.match(/<tr[^>]*data-rule="CUST-NIGHT"[\s\S]*?<\/tr>/)![0]
    expect(customRow).toContain('<time dateTime="2026-09-22">Sep 22</time>')
    expect(customRow).toContain('<td class="num rule-uses">0</td>')
    expect(customRow).toContain('<td></td>')
    expect(table).not.toContain('DOC-PENDING')
    expect(visibleText(table)).not.toMatch(/\b(?:Live|Pack|Draft|Expiring)\b/i)
  })

  it('lists document proposals by bucket and clickable sentence, not by id', () => {
    state.proposals = [{
      id: 'DOC-PENDING', text: 'Pay a $3 weekend differential.', source: 'Handbook',
      scope: null, cite: null, effective: null, conflict: null,
    }]
    const html = render(h(Rules))
    const section = html.match(/<section\b[^>]*aria-label="Rules to review"[\s\S]*?<\/section>/)![0]
    expect(section).toContain(`<span class="bucket-tag" style="--hue:${bucketHue('DOC-PENDING')}">${titleCase(kindLabel('DOC-PENDING'))}</span>`)
    expect(section).toMatch(/<button type="button" class="[^"]*rule-proposal-text[^"]*" aria-pressed="false">Pay a \$3 weekend differential<\/button>/)
    expect(visibleText(section)).not.toContain('DOC-PENDING')
    expect(html).not.toContain('bucket-chip')
  })

  it('places both add actions in the toolbar and keeps the multiple-file picker without a drop box', () => {
    const html = render(h(Rules))
    const toolbar = html.match(/<div class="toolbar rules-toolbar">[\s\S]*?<\/div>\s*<input/)![0]
    expect(toolbar).toMatch(/<button[^>]*class="btn">Add Rule<\/button>\s*<button[^>]*class="btn">Add Contracts<\/button>/)
    expect(html).toMatch(/<input[^>]*type="file"[^>]*multiple=""[^>]*aria-label="Choose contracts, CBAs or handbooks"/)
    expect(html).not.toContain('rules-drop')
  })

  it('keeps filter controls without rendering an empty results section', () => {
    const html = render(h(Rules), '/rules?q=no-matching-rule')
    expect(html).toContain('rules-toolbar')
    expect(html).toContain('aria-label="Search rules"')
    expect(html).toContain('Add Rule')
    expect(html).not.toContain('rules-table-wrap')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('Rules to review')
    expect(html).not.toContain('No rules match these filters.')
    expect(html).not.toContain('class="empty"')
  })
})

describe('rule detail', () => {
  it('shows only the bucket, the rule sentence and a link to its source document', () => {
    const id = 'CA-MB-01'
    const source = PROV[id]
    const rule = RULES.find((item) => item.id === id)!
    const html = render(h(RuleDetail, { ruleId: id }), '/rules?agent=1')
    const sequence = [`>${titleCase(kindLabel(id))}</span>`, `<p class="rule-applied-text">${textMarkup(formatRuleText(rule.sentence))}</p>`, 'rule-applied-source', `>${formatRuleText(source.doc)}</span>`]
    const positions = sequence.map((part) => html.indexOf(part))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(links(html)).toEqual([source.url])
    for (const gone of ['Applies to', 'Fires on', SCOPE_TEXT[id], source.verbatim!, id]) expect(visibleText(html)).not.toContain(gone)
    expect(links(html).some((href) => href.startsWith('/payroll/'))).toBe(false)
  })

  it('offers exactly one link to each real source and omits source summaries and status labels', () => {
    for (const rule of RULES) {
      const html = render(h(RuleDetail, { ruleId: rule.id }))
      expect(html, rule.id).toContain('class="btn rule-applied-source"')
      expect(links(html), rule.id).toEqual(PROV[rule.id]?.url ? [PROV[rule.id].url] : [])
      expect(visibleText(html), rule.id).not.toMatch(/\b(?:Live|Pack|Draft|Expiring|Deterministic|LLM)\b/i)
      expect(html, rule.id).not.toContain('View source')
      expect(html, rule.id).not.toContain('Compiled from')
      expect(html, rule.id).not.toContain('Obligation summary')
      const summary = PROV[rule.id]?.summary
      if (summary) expect(html.split(textMarkup(summary)).length - 1, rule.id).toBe(rule.sentence.includes(summary) ? 1 : 0)
    }
  })

  it('shows a custom rule as its sentence with a static Custom tag and no invented source content', () => {
    const custom: CustomDeskRule = {
      id: 'CUST-NIGHT', bucket: 'Custom', kind: 'det', sentence: 'Pay a $2 hourly night differential.',
      source: { doc: 'Owner instruction' }, draft: true, at: today.getTime(),
    }
    state.customRules = [custom]
    state.rules = [{ id: custom.id, text: custom.sentence, scope: 'per-CBA', source: custom.source.doc, cite: null, effective: null }]
    const html = render(h(RuleDetail, { ruleId: custom.id }))
    expect(html).toContain(`>${titleCase(kindLabel(custom.id))}</span>`)
    expect(html.split(formatRuleText(custom.sentence))).toHaveLength(2)
    expect(html).not.toContain(custom.sentence)
    expect(html).toMatch(/<span class="[^"]*rule-applied-source[^"]*">Custom<\/span>/)
    expect(html).not.toContain(custom.id)
    expect(html).not.toContain('per-CBA')
    expect(html).not.toContain('Applies to')
    expect(html).not.toContain('Effective')
    expect(visibleText(html)).not.toMatch(/\b(?:Live|Pack|Draft|Expiring)\b/i)
    expect(links(html)).toEqual([])
  })

  it('renders nothing for a missing rule or a catalog-only rule', () => {
    expect(render(h(RuleDetail, { ruleId: 'missing-rule' }))).toBe('')
    expect(render(h(RuleDetail, { ruleId: CATALOG[0].id }))).toBe('')
  })

  it('labels internal chat sources by channel and date without showing the sender', () => {
    const html = render(h(RuleDetail, { ruleId: 'TW-1187' }))
    expect(html).toContain('Slack instruction · Mon Aug 24, 9:12 AM')
    expect(html).not.toContain('Sam T.')
  })
})

describe('rule activity and display', () => {
  it('keeps creation dates stable and formats calendar dates without timezone drift', () => {
    const custom = compileRule('pay a $2 Payroll differential.')
    const created = getRuleActivity(custom.id, [], { ...state, customRules: [custom] })
    vi.setSystemTime(new Date(2026, 8, 23, 12))
    expect(getRuleActivity(custom.id, [], { ...state, customRules: [custom] })).toEqual(created)
    expect(created).toEqual({ created: '2026-09-22', uses: 0, lastUsed: null })
    expect(formatRuleDate('2026-09-04')).toBe('Sep 4')
    expect(formatRuleDate(null)).toBe('')
  })

  it('starts accepted document rules with today and no historical applications', () => {
    const incoming = propose(state, [{ name: 'Henderson-contract.pdf' }])
    expect(incoming.incoming.length).toBeGreaterThan(0)
    const proposal = incoming.incoming[0]
    const accepted = { ...state, ...acceptProposal({ ...state, proposals: incoming.proposals }, proposal) }
    expect(getRuleActivity(proposal.id, buildCycles(accepted, today), accepted))
      .toEqual({ created: '2026-09-22', uses: 0, lastUsed: null })
  })

  it('aggregates applied entries across cycles, deduplicates trace rows and ignores future work', () => {
    const id = 'CA-MB-01'
    const history = (date: number, statuses: Row['status'][]): DeskCycle => ({
      ...cycle, id: `history-${date}`, start: new Date(2026, 8, date),
      run: { ...cycle.run, shifts: [{
        ...cycle.run.shifts[0], shift: { ...cycle.run.shifts[0].shift, id: 'entry', day: 0 },
        rows: statuses.map((status) => ({ ruleId: id, status, note: 'Applied rule' })),
      }] },
    })
    const cycles = [history(7, ['applied', 'applied']), history(14, ['applied']), history(28, ['applied']), history(21, ['flag'])]
    const activity = getRuleActivity(id, cycles, state)
    expect(activity).toMatchObject({ uses: 2, lastUsed: '2026-09-14' })
    expect(getRuleActivity(id, [...cycles].reverse(), state)).toEqual(activity)
    expect(getRuleActivity(id, [cycles[0]], state).uses).toBe(1)
    expect(activity.lastUsed! >= activity.created).toBe(true)
    expect(getRuleActivity('missing-rule', cycles, state)).toMatchObject({ uses: 0, lastUsed: null })

    const decided = { ...state, resolutions: { 'history-21': { entry: 'applied' as const } }, decisionTimes: { 'history-21:entry': today.toISOString() } }
    expect(getRuleActivity(id, cycles, decided)).toMatchObject({ uses: 3, lastUsed: '2026-09-22' })
    expect(getRuleActivity(id, cycles, { ...decided, undone: { 'history-14': [id] } }))
      .toMatchObject({ uses: 2, lastUsed: '2026-09-22' })
    expect(getRuleActivity(id, cycles, { ...state, resolutions: { 'history-14': { entry: 'dismissed' as const } } }))
      .toMatchObject({ uses: 1, lastUsed: '2026-09-07' })
  })

  it('normalizes sentence copy while preserving decimal values and full text', () => {
    expect(formatRuleText('  pay $21.50 through the “payroll agent”.  '))
      .toBe('Pay $21.50 through the Closeout Agent')
    expect(formatRuleText('Review "payroll" entries.')).toBe('Review Payroll entries')
    const sentence = 'Pay the documented night differential to every eligible worker at every site covered by the current contract.'
    expect(formatRuleText(sentence)).toBe(sentence.slice(0, -1))
  })
})
