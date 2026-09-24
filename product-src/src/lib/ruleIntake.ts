import type { RuleKind } from '@/bench/engine.js'
import { extractClauses, extractRules } from '@/lib/extract'
import type { CustomDeskRule, Onboarding } from '@/lib/onboarding'
import type { Proposal } from '@/lib/rules'

/** How customers add rules, shared by the Rules page and agent setup: documents become proposals, sentences compile to drafts. */

type Rulebook = Pick<Onboarding, 'customRules' | 'rules' | 'proposals'>

export const sentenceKind = (sentence: string): RuleKind =>
  /meal|break/i.test(sentence) ? 'both' : /overtime|hours|late|early|round/i.test(sentence) ? 'det' : 'llm'

/** New proposals from dropped documents. Text is read clause by clause; other files fall back to the name-based stand-in. */
export function propose(state: Rulebook, files: { name: string; text?: string }[]) {
  const known = new Set([...state.customRules, ...state.rules, ...state.proposals].map((rule) => rule.id))
  const incoming: Proposal[] = []
  for (const file of files) for (const proposal of file.text ? extractClauses(file.name, file.text) : extractRules(file.name)) {
    if (!known.has(proposal.id)) { known.add(proposal.id); incoming.push(proposal) }
  }
  return { proposals: [...state.proposals, ...incoming], incoming }
}

/** Accepting keeps the extractor's id in both records, so re-dropping the same document cannot duplicate the rule. */
export function acceptProposal(state: Rulebook, proposal: Proposal): Rulebook {
  const metadata = { id: proposal.id, text: proposal.text, scope: proposal.scope, source: proposal.source, cite: proposal.cite, effective: proposal.effective }
  return {
    customRules: state.customRules.some((rule) => rule.id === proposal.id) ? state.customRules
      : [...state.customRules, { id: proposal.id, bucket: 'Custom', kind: sentenceKind(proposal.text), sentence: proposal.text, source: { doc: proposal.source }, draft: false, at: Date.now() }],
    rules: state.rules.some((rule) => rule.id === proposal.id) ? state.rules : [...state.rules, metadata],
    proposals: state.proposals.filter((rule) => rule.id !== proposal.id),
  }
}

export const compileRule = (sentence: string): CustomDeskRule =>
  ({ id: `CUST-${crypto.randomUUID()}`, bucket: 'Custom', kind: sentenceKind(sentence), sentence: sentence.trim(), source: { doc: 'You · today' }, draft: true, at: Date.now() })

/** A sentence with no number needs its threshold before it can run. */
export function clarify(sentence: string) {
  if (/\d/.test(sentence)) return null
  return /overtime|hours/i.test(sentence)
    ? { question: 'What hours threshold should this use?', options: ['8 hours', '40 hours'] }
    : { question: 'What time threshold should this use?', options: ['15 min', '30 min'] }
}

export const withThreshold = (rule: CustomDeskRule, answer: string): CustomDeskRule =>
  ({ ...rule, sentence: rule.sentence + (answer ? `${/[.!?…]$/.test(rule.sentence) ? '' : '.'} Threshold: ${answer}.` : '') })
