import type { DeskCycle } from '@/lib/desk'
import type { Onboarding } from '@/lib/onboarding'

/** Dates are local calendar dates, stored as YYYY-MM-DD rather than display strings. */
export interface RuleActivity {
  created: string
  uses: number
  lastUsed: string | null
}

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Format calendar dates without UTC conversion moving them to the previous day. */
export function formatRuleDate(date: string | null): string {
  return date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}

/** Keep rule sentences consistent without changing their stored or compiled meaning. */
export function formatRuleText(text: string): string {
  const sentence = text.replace(/["“”]/g, '')
    .replace(/\bpayroll agent\b/gi, 'Payroll Agent').replace(/\bpayroll\b/gi, 'Payroll')
    .trim().replace(/\.+$/, '').trimEnd()
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/** Chat sources show the channel and date without naming the internal sender. */
export function formatRuleSource(source: string): string {
  const [channel, , ...details] = source.split(' · ')
  return formatRuleText(channel === 'Slack' && details.length ? `Slack instruction · ${details.join(' · ')}` : source)
}

type RuleHistory = Pick<Onboarding, 'customRules' | 'resolutions' | 'undone' | 'decisionTimes'>

function seededActivity(id: string): RuleActivity {
  // Engine rules have no creation timestamp. Seed one stable date per rule before the demo history.
  const seed = Array.from(id).reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0, 0)
  return { created: dateKey(new Date(2024, 0, 1 + seed % 180)), uses: 0, lastUsed: null }
}

let historyCache: { cycles: readonly DeskCycle[]; state: Omit<RuleHistory, 'customRules'>; through: string; activities: Map<string, RuleActivity> } | undefined

/** Aggregate every rule together so a table row or search render does not rescan the full history. */
function historyActivities(cycles: readonly DeskCycle[], state: RuleHistory, through: string): Map<string, RuleActivity> {
  if (historyCache?.cycles === cycles && historyCache.through === through
    && historyCache.state.resolutions === state.resolutions && historyCache.state.undone === state.undone
    && historyCache.state.decisionTimes === state.decisionTimes) return historyCache.activities

  const activities = new Map<string, RuleActivity>()
  for (const cycle of cycles) {
    const remembered = new Set(cycle.rememberedRuleIds)
    const undone = new Set(state.undone[cycle.id])
    for (const { shift, rows } of cycle.run.shifts) {
      const explicit = state.resolutions[cycle.id]?.[shift.id]
      if (explicit === 'dismissed') continue
      const applied = new Set<string>()
      for (const row of rows) {
        const resolved = explicit === 'applied' || remembered.has(row.ruleId)
        if (row.status === 'applied' && (!undone.has(row.ruleId) || resolved)
          || (row.status === 'flag' || row.status === 'held') && resolved) applied.add(row.ruleId)
      }
      if (!applied.size) continue
      const worked = dateKey(new Date(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate() + shift.day))
      if (worked > through) continue
      const recorded = explicit === 'applied' ? state.decisionTimes[`${cycle.id}:${shift.id}`] : undefined
      const recordedDate = recorded ? new Date(recorded) : null
      const used = recordedDate && Number.isFinite(recordedDate.getTime()) ? dateKey(recordedDate) : worked
      if (used > through) continue
      for (const id of applied) {
        const activity = activities.get(id) ?? seededActivity(id)
        if (worked < activity.created || used < activity.created) continue
        activity.uses++
        if (!activity.lastUsed || used > activity.lastUsed) activity.lastUsed = used
        activities.set(id, activity)
      }
    }
  }
  historyCache = { cycles, state: { resolutions: state.resolutions, undone: state.undone, decisionTimes: state.decisionTimes }, through, activities }
  return activities
}

/** One use per time entry actually applied across all available cycles, never just a flagged check. */
export function getRuleActivity(id: string, cycles: readonly DeskCycle[], state: RuleHistory): RuleActivity {
  const today = new Date()
  const custom = state.customRules.find((rule) => rule.id === id)
  if (custom) return { created: dateKey(Number.isFinite(custom.at) ? new Date(custom.at) : today), uses: 0, lastUsed: null }
  return { ...(historyActivities(cycles, state, dateKey(today)).get(id) ?? seededActivity(id)) }
}

export interface Rule {
  text: string
  source: string
  caught: number
}

/** A rule the customer owns: typed in, or pulled out of a document they gave us. */
export interface CustomRule {
  id: string
  text: string
  scope: string | null
  source: string
  cite: string | null
  effective: string | null
}

/** A candidate rule waiting for a human to accept it. Nothing enters the rulebook unreviewed. */
export interface Proposal extends CustomRule {
  conflict: string | null
}

export interface RuleGroup {
  title: string
  note: string
  rules: Rule[]
}

/** Everything the agent checks, grouped by where the rule came from. */
export const RULE_GROUPS: RuleGroup[] = [
  {
    title: 'Where you operate',
    note: 'Read from the worksite addresses in your time entries. Kept current for you.',
    rules: [
      { text: 'Overtime at 1.5× over 40 h in a week', source: 'California', caught: 14 },
      { text: 'One hour premium for a missed meal break', source: 'California', caught: 12 },
      { text: 'A second 30 min break after 10 h', source: 'California', caught: 9 },
      { text: 'Double time over 12 h in a workday', source: 'California', caught: 0 },
      { text: 'Overtime at 1.5× over 8 h in a workday', source: 'Nevada', caught: 3 },
    ],
  },
  {
    title: 'Your contracts',
    note: 'From the rates in your time export and any rate card you have given the agent',
    rules: [
      { text: '$2/hr night differential, 6:00 PM to 6:00 AM', source: 'Riverside DC', caught: 11 },
      { text: 'Contract rate $21/hr, effective Sep 1', source: 'Henderson', caught: 13 },
      { text: 'Forklift-certified workers bill at $34.50/hr', source: 'Riverside DC', caught: 0 },
    ],
  },
  {
    title: 'Always on',
    note: "The agent's own checks. These run on every payment.",
    rules: [
      { text: 'Same time entry entered twice', source: 'Duplicate', caught: 10 },
      { text: 'Clock-out after the site closed', source: 'Late clock-out', caught: 8 },
    ],
  },
]
