import { CLIENTS } from '@/lib/sample'
import { RULES } from '@/bench/engine.js'
import { appliedCorrection, kindLabel, rowResolution, type DeskCycle } from '@/lib/desk'
import type { Onboarding } from '@/lib/onboarding'
import type { JourneyThread } from '@/lib/journey'
import { journeyShiftPay } from '@/lib/journeyPay'

/**
 * Agent-first triage: every discrepancy is in exactly one state.
 * fixed     — the evidence settles it and a policy lets the agent apply it (undoable until payroll closes)
 * proposed  — the agent has the fix; a person approves it, usually in bulk
 * waiting   — the agent has asked someone and is holding for the reply
 * judgment  — no right answer in the data; it goes to the person who owns the call
 */
export type ResolutionState = 'proposed' | 'waiting' | 'judgment' | 'escalated' | 'fixed'
export const STATES: ResolutionState[] = ['proposed', 'waiting', 'judgment', 'escalated', 'fixed']

// Flags the agent has already sent out for confirmation, and calls that aren't payroll's to make.
const WAITING = new Set(['SRC-VMS-01'])
const JUDGMENT: Record<string, string> = { 'CON-MARGIN-01': 'account manager' }

/** What the fix does to pay, in the words a payroll person would use. Fixed rows say it happened; proposed ones say it will. */
const ACTIONS: Record<string, string> = {
  'SRC-VMS-01': "Paid the client's clock hours, not Bullhorn's",
  'CS-01': 'Removed the duplicate time entry',
  'SRC-MISS-01': 'Added the missing time entry to pay',
  'CA-MB-01': 'Added a 1-hour meal premium',
  'FED-RR-01': 'Added the night differential to overtime',
  'SRC-WEEK-01': 'Paid the missed overtime in this week',
  'CA-OT-8': 'Paid daily overtime',
  'FED-OT-40': 'Paid weekly overtime',
  'FAC-AUTODED-01': 'Restored the deducted break',
  'FAC-BADGE-01': 'Paid through the badge-out',
  'CON-MIN-4H': 'Topped up to the 4-hour minimum',
  'CA-RT-01': 'Added reporting-time pay',
}
export const actionFor = (ruleId: string) => ACTIONS[ruleId] ?? 'Applied the correction'

/** D20: pay-law rules apply whatever the authority says. The engine's own bucket says which rules are law. */
const LAW_BUCKETS = new Set(['Legal', 'State', 'Local'])
export const requiredByLaw = (ruleId: string) => LAW_BUCKETS.has(RULES.find((rule) => rule.id === ruleId)?.bucket ?? '')
// ponytail: place names for the rule-id prefixes the engine uses today; an unknown prefix just omits the place.
const PLACES: Record<string, string> = { CA: 'California', NY: 'New York', CHI: 'Chicago', OR: 'Oregon', WA: 'Washington', CO: 'Colorado', NJ: 'New Jersey', IL: 'Illinois', TX: 'Texas' }
/** "California daily overtime": the rule's human label, with its place for state and city rules. */
export function lawLabel(ruleId: string): string {
  const place = PLACES[ruleId.split('-')[0]], label = kindLabel(ruleId)
  return place ? `${place} ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label
}
const IMPERATIVE: Record<string, string> = { Paid: 'Pay', Removed: 'Remove', Added: 'Add', Restored: 'Restore', Topped: 'Top', Applied: 'Apply' }
/** The same fix as something to approve: "Add the missing time entry to pay". */
export const proposalFor = (ruleId: string) => actionFor(ruleId).replace(/^\w+/, (verb) => IMPERATIVE[verb] ?? verb)

/** Who the agent asked, with their role, so a supervisor never reads as a worker. */
const askedAt = (site: string, cycle: DeskCycle) => {
  const supervisor = cycle.sites?.find(item => item.name === site)?.supervisor
  if (supervisor) return `${supervisor.name}, ${site}'s ${supervisor.role ?? 'site supervisor'},`
  const client = Object.values(CLIENTS).find((item) => item.name === site)
  return client ? `${client.supervisor}, ${client.name}'s site supervisor,` : 'the site supervisor'
}
export interface ResolutionCase { shiftId: string; worker: string; day: string; site: string; note: string; before: number; after: number }
/** `approved`: fixed because a person approved it, not by the agent on its own. */
export interface ResolutionGroup { state: ResolutionState; ruleId: string; cases: ResolutionCase[]; current: number; resolved: number; owner?: string; asked?: string; approved?: boolean }

const norm = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Only persisted outbound correspondence establishes that somebody was asked. */
export function askedForGroup(c: DeskCycle, group: ResolutionGroup, threads: JourneyThread[], neverContact: readonly string[] = []): string | undefined {
  const blocked = new Set(neverContact.map(norm).filter(Boolean))
  return threads.find(thread => {
    if (thread.cycleId !== c.id || thread.disputeId || blocked.has(norm(thread.counterparty.name))
      || !thread.messages.some(message => message.dir === 'out' && message.status !== 'draft' && message.text.trim())) return false
    return group.cases.some(item => {
      if (thread.counterparty.kind === 'site' && blocked.has(norm(item.site))) return false
      const shift = c.week.find(shift => shift.id === item.shiftId)
      const referenced = !!thread.shiftId || !!thread.counterparty.gapIds?.length
      if (referenced) return item.shiftId === thread.shiftId || !!(shift && thread.counterparty.gapIds?.includes(`${item.site}|${shift.worker}|${shift.day}`))
      // Older correspondence lacks entry references; only that legacy shape falls back to a name.
      return item.worker === thread.counterparty.name || item.site === thread.counterparty.name
        || c.sites?.find(site => site.name === item.site)?.supervisor?.name === thread.counterparty.name
    })
  })?.counterparty.name
}

const emptyThreads: JourneyThread[] = []
interface GroupCache {
  resolutions: Onboarding['resolutions'][string] | undefined
  undone: string
  groups: ResolutionGroup[]
  threads?: JourneyThread[]
  neverContact?: string
  value?: ResolutionGroup[]
}
const groupCache = new WeakMap<DeskCycle, GroupCache>()

export function resolutionGroups(c: DeskCycle, res: Onboarding['resolutions'], undone: readonly string[] = [], threads: JourneyThread[] = emptyThreads, neverContact: readonly string[] = []): ResolutionGroup[] {
  const resolutions = c.server ? undefined : res[c.id]
  const undoneKey = c.server ? '' : JSON.stringify(undone)
  let cached = groupCache.get(c)
  if (!cached || cached.resolutions !== resolutions || cached.undone !== undoneKey) {
    cached = { resolutions, undone: undoneKey, groups: buildResolutionGroups(c, res, undone) }
    groupCache.set(c, cached)
  }
  const neverContactKey = JSON.stringify(neverContact)
  if (cached.value && cached.threads === threads && cached.neverContact === neverContactKey) return cached.value
  cached.threads = threads
  cached.neverContact = neverContactKey
  cached.value = cached.groups.map(group => c.server && group.state === 'waiting'
    ? { ...group, asked: askedForGroup(c, group, threads, neverContact) } : group)
  return cached.value
}

function buildResolutionGroups(c: DeskCycle, res: Onboarding['resolutions'], undone: readonly string[]): ResolutionGroup[] {
  const groups = new Map<string, ResolutionGroup>()
  for (const rs of c.run.shifts) {
    const seen = new Set<string>()
    for (const row of rs.rows) {
      if (seen.has(row.ruleId) || (row.status !== 'flag' && row.status !== 'held' && !appliedCorrection(c, row))) continue
      const decision = rowResolution(c, rs.shift.id, row.ruleId, res)
      let state: ResolutionState | null = null
      const held = c.server && (rs.held || rs.rows.some(item => item.ruleId === row.ruleId && item.status === 'held'))
      if (held) state = 'waiting'
      else if (decision === 'escalated') state = 'escalated'
      else if (appliedCorrection(c, row)) state = decision === 'dismissed' ? null : !c.server && undone.includes(row.ruleId) && !res[c.id]?.[rs.shift.id] ? 'proposed' : 'fixed'
      else if (row.status === 'flag' || row.status === 'held') {
        if (decision === 'applied') state = 'fixed'
        else if (!decision) state = JUDGMENT[row.ruleId] ? 'judgment' : WAITING.has(row.ruleId) || row.status === 'held' ? 'waiting' : 'proposed'
      }
      if (!state) continue
      seen.add(row.ruleId)
      const approved = state === 'fixed' && (c.server ? decision === 'applied' : res[c.id]?.[rs.shift.id] === 'applied')
      const key = `${state}:${row.ruleId}:${approved}`
      const group = groups.get(key) ?? { state, ruleId: row.ruleId, cases: [], current: 0, resolved: 0, ...(approved ? { approved } : {}),
        ...(JUDGMENT[row.ruleId] || state === 'escalated' ? { owner: JUDGMENT[row.ruleId] ?? 'review owner' } : {}),
        ...(state === 'waiting' && !c.server ? { asked: askedAt(rs.shift.fac.name, c) } : {}) }
      const pay = c.server ? journeyShiftPay(rs) : rs.pay
      group.cases.push({ shiftId: rs.shift.id, worker: rs.shift.worker, day: c.days[rs.shift.day] ?? '', site: rs.shift.fac.name, note: row.note, before: rs.naive, after: pay })
      group.current += rs.naive
      group.resolved += pay
      groups.set(key, group)
    }
  }
  return [...groups.values()].sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || b.cases.length - a.cases.length)
}
