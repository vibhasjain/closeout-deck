import { CLIENTS } from '@/lib/sample'
import { appliedCorrection, rowResolution, type DeskCycle } from '@/lib/desk'
import type { Onboarding } from '@/lib/onboarding'

/**
 * Agent-first triage: every discrepancy is in exactly one state.
 * fixed     — the evidence settles it and a policy lets the agent apply it (undoable until payroll closes)
 * proposed  — the agent has the fix; a person approves it, usually in bulk
 * waiting   — the agent has asked someone and is holding for the reply
 * judgment  — no right answer in the data; it goes to the person who owns the call
 */
export type ResolutionState = 'proposed' | 'waiting' | 'judgment' | 'fixed'
export const STATES: ResolutionState[] = ['proposed', 'waiting', 'judgment', 'fixed']

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

export function resolutionGroups(c: DeskCycle, res: Onboarding['resolutions'], undone: readonly string[] = []): ResolutionGroup[] {
  const groups = new Map<string, ResolutionGroup>()
  for (const rs of c.run.shifts) {
    const seen = new Set<string>()
    for (const row of rs.rows) {
      if (seen.has(row.ruleId)) continue
      const decision = rowResolution(c, rs.shift.id, row.ruleId, res)
      let state: ResolutionState | null = null
      if (appliedCorrection(c, row)) state = undone.includes(row.ruleId) && !res[c.id]?.[rs.shift.id] ? 'proposed' : 'fixed'
      else if (row.status === 'flag' || row.status === 'held') {
        if (decision === 'applied') state = 'fixed'
        else if (!decision) state = JUDGMENT[row.ruleId] ? 'judgment' : WAITING.has(row.ruleId) || row.status === 'held' ? 'waiting' : 'proposed'
      }
      if (!state) continue
      seen.add(row.ruleId)
      const approved = state === 'fixed' && res[c.id]?.[rs.shift.id] === 'applied'
      const key = `${state}:${row.ruleId}:${approved}`
      const group = groups.get(key) ?? { state, ruleId: row.ruleId, cases: [], current: 0, resolved: 0, ...(approved ? { approved } : {}),
        ...(JUDGMENT[row.ruleId] ? { owner: JUDGMENT[row.ruleId] } : {}),
        ...(state === 'waiting' ? { asked: askedAt(rs.shift.fac.name, c) } : {}) }
      group.cases.push({ shiftId: rs.shift.id, worker: rs.shift.worker, day: c.days[rs.shift.day] ?? '', site: rs.shift.fac.name, note: row.note, before: rs.naive, after: rs.pay })
      group.current += rs.naive
      group.resolved += rs.pay
      groups.set(key, group)
    }
  }
  return [...groups.values()].sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || b.cases.length - a.cases.length)
}
