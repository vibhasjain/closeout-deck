import { CATALOG } from '@/bench/catalog.js'
import { RULES } from '@/bench/engine.js'
import type { Onboarding } from '@/lib/onboarding'
import type { Finding } from '@/lib/sample'

/**
 * What the agent fixed on its own under the account's authority, and what it stopped for, with why.
 * The limit is per time entry (the largest single correction); the weekly cap admits the smallest findings first.
 */
export function split(found: Finding[], { autoFix, limit, weeklyCap }: Onboarding['authority']) {
  const why = new Map(found.map((finding) => {
    const largest = Math.max(0, ...finding.cases.map((c) => Math.abs(c.delta)))
    return [finding, finding.dispute === 'Client dispute' ? 'Touches a client invoice' : finding.dispute === 'Margin' ? 'Changes a client bill rate'
      : !autoFix ? 'You asked me to check first' : largest > limit ? `Over $${limit}` : '']
  }))
  let total = 0
  for (const finding of found.filter((f) => !why.get(f)).sort((a, b) => a.amount - b.amount)) {
    // An unset cap (null, missing, or a legacy $0) is no cap: it never blocks a fix.
    if (weeklyCap && total + finding.amount > weeklyCap) why.set(finding, `Over the $${weeklyCap.toLocaleString()} weekly cap`)
    else total += finding.amount
  }
  return { fixed: found.filter((f) => !why.get(f)), stopped: found.filter((f) => why.get(f)).map((finding) => ({ finding, why: why.get(finding)! })) }
}

export const list = (items: string[]) => items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? ''

/** The rulebook the demo ran on, grouped the way a payroll lead reads it. */
export const RULEBOOK = ['Federal', 'California', 'Other states and cities', 'Timekeeping', 'Contracts and sites'].map((title) => ({
  title,
  rules: RULES.filter((rule) => (/^(FED|TB)-|^SRC-WEEK/.test(rule.id) ? 'Federal' : rule.id.startsWith('CA-') ? 'California'
    : rule.bucket === 'State' || rule.bucket === 'Local' ? 'Other states and cities' : rule.bucket === 'Common sense' ? 'Timekeeping'
      : rule.bucket === 'Contract' || rule.bucket === 'Facility' ? 'Contracts and sites' : null) === title)
    .map((rule) => ({ id: rule.id, sentence: rule.sentence, cite: rule.source.doc })),
}))
/** States named in the catalog's rule packs, beyond what the rulebook runs today. */
export const CATALOG_STATES = ['California', 'New York', 'Colorado', 'New Jersey', 'Illinois', 'Oregon', 'Texas'].filter((name) => CATALOG.some((pack) => pack.juris.includes(name)))

/** A client addendum to try the rules flow with, read by the same clause extractor as a dropped text file. */
export const SAMPLE_CONTRACT = { name: 'lonestar_addendum.pdf', text: `LONESTAR PACKAGING · CLIENT ADDENDUM
Client: Lonestar Packaging
Effective: 2026-10-05
2.1 Hours worked from 10:00 PM to 6:00 AM carry a $1.50/hr night differential.
2.2 Workers called in are paid and billed a minimum of 4 hours.
2.3 Hours over 10 in a workday are paid and billed at 1.5x.
2.4 Any adjustment over $250 needs Lonestar Packaging's written approval before invoicing.` }
