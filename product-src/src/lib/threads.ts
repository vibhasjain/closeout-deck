import { RULES, fmtT } from '@/bench/engine.js'
import type { Row, RunShift, Shift } from '@/bench/engine.js'
import type { DeskCycle } from '@/lib/desk'

export type CounterpartyKind = 'Worker' | 'Facility'
export type ThreadParty = 'worker' | 'facility'

export interface ThreadEntry {
  id: string
  dir: 'in' | 'out' | 'internal'
  at: string
  subject?: string
  text: string
}

export interface Draft {
  id: string
  subject: string
  text: string
  createdAt: string
  rationale: string
}

export interface TrailEntry {
  at: string
  action: 'ingested' | 'drafted' | 'revised' | 'sent' | 'status'
  detail: string
}

export interface MediationState {
  sent: string[]
  dismissedDraft?: boolean
  edited?: string
  notes?: string[]
}

export interface MediationThread {
  id: string
  shiftId: string
  ruleId: string
  counterparty: { name: string; kind: CounterpartyKind }
  channel: 'SMS' | 'Email'
  need: string
  waitingOn: CounterpartyKind | 'Us'
  entries: ThreadEntry[]
  draft: Draft | null
  trail: TrailEntry[]
  /** Present only when a user actually sent a message with a recorded timestamp. */
  askedAt?: string
}

interface Routing {
  kind: CounterpartyKind
  ask: string
}

/** Specific facts take precedence over the bucket: a badge mismatch concerns work, not policy. */
export const RULE_COUNTERPARTIES: Record<string, Routing> = {
  'TS-COMPLETE': { kind: 'Worker', ask: 'Please confirm the actual clock-out time' },
  'CS-16H': { kind: 'Worker', ask: 'Please confirm the actual clock-out time for this recorded span' },
  'CS-OVLP': { kind: 'Worker', ask: 'Please confirm the times you worked at each site where the records overlap' },
  'CS-SPEED': { kind: 'Worker', ask: 'Please confirm your actual arrival and departure times at the two sites' },
  'CS-EXACT': { kind: 'Worker', ask: 'Please confirm the actual hours behind these identical recorded durations' },
  'CS-EDIT': { kind: 'Facility', ask: 'Please identify the post-approval edit and confirm the submitted time' },
  'FAC-GEO-01': { kind: 'Worker', ask: 'Please confirm when you arrived at the site and started work' },
  'FAC-BADGE-01': { kind: 'Worker', ask: 'Please confirm when you finished work, given the clock and badge times' },
  'FAC-AUTODED-01': { kind: 'Facility', ask: 'Please confirm whether the site meal deduction should apply to this day' },
  'CA-MB-01': { kind: 'Worker', ask: 'Please confirm whether you took a meal break and its start and end times' },
  'REST-GAP-01': { kind: 'Worker', ask: 'Please confirm the recorded hours and whether you agreed in writing to the short break between closing and opening' },
  'CA-RT-01': { kind: 'Worker', ask: 'Please confirm the time you finished work and whether you were sent home early' },
  'CA-SS-01': { kind: 'Worker', ask: 'Please confirm the worked periods and the gap between them' },
  'NY-SOH-01': { kind: 'Worker', ask: 'Please confirm the first clock-in and final clock-out for this day' },
  'CHI-FWW-01': { kind: 'Facility', ask: 'Please confirm the recorded schedule change and when it was communicated' },
  'CON-MIN-4H': { kind: 'Facility', ask: 'Please confirm the contract minimum that applies to this day' },
  'CON-SUTTER-01': { kind: 'Facility', ask: 'Please confirm the orientation rate in the contract for this day' },
  'TW-1187': { kind: 'Facility', ask: 'Please confirm how to handle the hours held under the site weekly cap' },
}

export const BUCKET_COUNTERPARTIES: Record<string, CounterpartyKind> = {
  Contract: 'Facility', CBA: 'Facility', Facility: 'Facility', 'This week': 'Facility',
  'Common sense': 'Worker', State: 'Worker', Local: 'Worker', Legal: 'Worker',
  'Time-based': 'Worker', Vertical: 'Worker', Custom: 'Facility',
}

/** A waiver document is a facility question; a missing/short/late meal itself is a worker question. */
const MEAL_WAIVER: Routing = {
  kind: 'Facility', ask: 'Please confirm whether a signed meal waiver is on file for this day',
}

function routingFor(cycle: DeskCycle, shift: Shift, row: Row): Routing {
  if (row.ruleId === 'CA-MB-01' && !shift.meal && !shift.waiverOnFile
    && cycle.run.ctx.workedMin(shift) <= cycle.run.ctx.params('CA-MB-01', 'waiver_cap_h') * 60) return MEAL_WAIVER
  const exact = RULE_COUNTERPARTIES[row.ruleId]
  if (exact) return exact
  const bucket = RULES.find((rule) => rule.id === row.ruleId)?.bucket ?? ''
  return { kind: BUCKET_COUNTERPARTIES[bucket] ?? 'Worker', ask: 'Please confirm the recorded information for this day' }
}

// Holds lead; within a severity, a contract/policy stop leads its related pay calculation.
const RULE_PRIORITY = ['CS-16H', 'CS-OVLP', 'TS-COMPLETE', 'TW-1187', 'CON-MIN-4H', 'CON-SUTTER-01', 'FAC-AUTODED-01']
const priority = (row: Row) => {
  const index = RULE_PRIORITY.indexOf(row.ruleId)
  return (row.status === 'held' ? 0 : 100) + (index < 0 ? RULE_PRIORITY.length : index)
}

function seededRandom(id: string) {
  let seed = 0
  for (const char of id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0
  // Same LCG constants and arithmetic as the bench engine.
  return () => (seed = (1103515245 * seed + 12345) >>> 0) / 4294967296
}

function openFinding(cycle: DeskCycle, rs: RunShift): Row | undefined {
  return rs.rows.filter((row) => (row.status === 'flag' || row.status === 'held')
    && !cycle.rememberedRuleIds?.includes(row.ruleId)).sort((a, b) => priority(a) - priority(b))[0]
}

/** Keep the existing finding priority and routing, including the meal-waiver exception. */
export function defaultThreadParty(cycle: DeskCycle, rs: RunShift): ThreadParty {
  const stop = openFinding(cycle, rs)
  return stop && routingFor(cycle, rs.shift, stop).kind === 'Facility' ? 'facility' : 'worker'
}

const clock = (minutes: number) => `${fmtT(minutes)}${minutes >= 1440 ? ' the next day' : ''}`

function recordedHours(shift: Shift): string {
  if (shift.punches.length) return shift.punches.map((punch) => punch.out == null
    ? `a clock-in at ${clock(punch.in)}` : `${clock(punch.in)} to ${clock(punch.out)}`).join(' and ')
  return shift.sched ? `${clock(shift.sched[0])} to ${clock(shift.sched[1])} on the schedule` : 'the recorded hours'
}

/** Samples use only this payment's recorded clock or schedule times, never invented times. */
function findingExchange(shift: Shift, ruleId: string, routing: Routing): [string, string] {
  const start = shift.punches[0]?.in ?? shift.sched?.[0]
  const finish = shift.punches.at(-1)?.out ?? shift.sched?.[1]
  const scheduledFinish = shift.sched?.[1]
  const timeReply = `My time record shows ${recordedHours(shift)}. I'll check it against my notes.`
  switch (ruleId) {
    case 'TS-COMPLETE': return [
      `Your clock-out is missing${start == null ? '' : ` after the ${clock(start)} clock-in`}. What time did you leave?`,
      finish == null ? "I missed clocking out. I'll check what time I left." : `I remember leaving around ${clock(finish)}. I'll double-check that.`,
    ]
    case 'CS-16H': return [
      `The time record shows ${recordedHours(shift)}. Does that finish time look right?`,
      scheduledFinish == null ? "That finish time doesn't look right. I'll check when I left." : `I think I missed clocking out. I was scheduled to finish at ${clock(scheduledFinish)}.`,
    ]
    case 'CS-OVLP': return ['Your hours overlap with another site. Can you check the times you worked here?', timeReply]
    case 'CS-SPEED': return ['The travel time between sites looks too short. Can you check your arrival and departure?', timeReply]
    case 'CS-EXACT': return ['The same hours appear on several time records. Can you check this day?', timeReply]
    case 'CS-EDIT': return ['The time record was edited after approval. Can you check who made the change?', `We have ${recordedHours(shift)} on file. I'll ask the scheduler to review the change.`]
    case 'FAC-GEO-01': return [shift.geo ? 'The arrival record and clock-in do not match. Can you check when you started work?' : 'We do not have an arrival record. Can you confirm when you arrived and started work?', start == null ? "I'll check my start time" : `My clock-in says ${clock(start)}. I'll check when I started work.`]
    case 'FAC-BADGE-01': return ['The badge record and clock-out do not match. Can you check when you finished work?', finish == null ? "I'll check when I finished" : `The time clock says ${clock(finish)}, but I'll check my actual finish time`]
    case 'FAC-AUTODED-01': return ['There is no meal record to support the automatic deduction. Can you check it?', "I'll check the meal record with the scheduler before we confirm the deduction"]
    case 'CA-MB-01': return routing.kind === 'Facility'
      ? ['We do not have a signed meal waiver for this day. Is one on file?', "I'll check our documents and send over the waiver if we have it"]
      : ['Can you check whether you took a meal break and when?', shift.meal ? "I took a meal break. I'll check the times in my notes." : "I don't have a meal break recorded. I'll check what happened that day."]
    case 'REST-GAP-01': return ['We are checking the short break between closing and opening. Did you agree to the early start in writing?', `${start == null ? 'I can check the start time.' : `My clock-in was ${clock(start)}.`} I'll look for the message about the early start.`]
    case 'CA-RT-01': return ['Your clock-out is earlier than the schedule. Were you sent home early?', finish == null ? "I'll check with the scheduler about the early finish" : `My time record ends at ${clock(finish)}. I'll check with the scheduler about leaving early.`]
    case 'CA-SS-01': return ['Can you confirm the separate work periods and the break between them?', timeReply]
    case 'NY-SOH-01': return ['Can you check the first clock-in and final clock-out for this day?', timeReply]
    case 'CHI-FWW-01': return ['The schedule changed shortly before work started. Can you check when the worker was told?', shift.sched ? `The schedule shows ${clock(shift.sched[0])} to ${clock(shift.sched[1])}. I'll look up the message about the change.` : "I'll look up the message about the change"]
    case 'CON-MIN-4H': return ['The recorded hours are below the contract minimum. Can you confirm which minimum applies?', `We have ${recordedHours(shift)} on the time record. I'll check the contract minimum.`]
    case 'CON-SUTTER-01': return ['This day is marked as orientation. Can you confirm the rate that should apply?', "I'll check the orientation rate in the contract and get back to you"]
    case 'TW-1187': return ['Some hours are held under the weekly cap. Can you check how they should be handled?', "I'll check the weekly hours and ask Payroll to confirm how to handle the extra time"]
    default: return [`${routing.ask}.`, "I'll check the record and get back to you"]
  }
}

/** Every payment has independent, deterministic sample conversations with both parties. */
export function generateThread(cycle: DeskCycle, rs: RunShift, party: ThreadParty = defaultThreadParty(cycle, rs)): MediationThread {
  const shift = rs.shift
  const finding = openFinding(cycle, rs)
  const routing = finding ? routingFor(cycle, shift, finding) : undefined
  const kind: CounterpartyKind = party === 'worker' ? 'Worker' : 'Facility'
  const relevant = finding && routing?.kind === kind ? finding : undefined
  const counterparty = { name: kind === 'Worker' ? shift.worker : shift.fac.name, kind }
  const id = `${cycle.id}:${shift.id}:${party}`
  const random = seededRandom(`${shift.id}:${party}`)
  const day = cycle.days[shift.day]
  const greeting = kind === 'Worker' ? `Hi ${shift.worker}, about your hours` : `Hi, about ${shift.worker}'s hours`
  let messages: Array<{ dir: 'in' | 'out'; text: string }>
  if (relevant && routing) {
    const [question, reply] = findingExchange(shift, relevant.ruleId, routing)
    messages = [
      { dir: 'out', text: `${greeting} at ${shift.fac.name} on ${day}${shift.punches[0] ? `, starting at ${clock(shift.punches[0].in)}` : ''}. ${question}` },
      { dir: 'in', text: reply },
    ]
  } else {
    const clockIn = shift.punches[0]?.in
    messages = [
      { dir: 'out', text: `${kind === 'Worker' ? `Hi ${shift.worker}, we received your time entry` : `We received ${shift.worker}'s time entry`} for ${shift.fac.name} on ${day}${clockIn == null ? '' : `, with a ${clock(clockIn)} clock-in`}` },
      { dir: 'in', text: kind === 'Worker' ? 'Thanks, I have a copy too' : 'Thanks, we have the same time entry on file' },
    ]
    if (random() > 0.5) messages.push({ dir: 'out', text: 'Thanks. I have it ready for the Payroll review.' })
  }
  // Place samples after the recorded work where possible; keep even overnight records
  // and the final day inside this pay period, with space for the pending draft.
  const workday = new Date(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate() + shift.day).getTime()
  const end = new Date(cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate() + 1).getTime()
  const finish = shift.punches.at(-1)?.out ?? shift.sched?.[1] ?? 17 * 60
  let timestamp = Math.min(workday + (finish + 20 + Math.floor(random() * 40)) * 60_000, end - 2 * 60 * 60_000)
  timestamp = Math.max(timestamp, cycle.start.getTime() + 60 * 60_000)
  const entries = messages.map((message, index): ThreadEntry => {
    timestamp += (4 + Math.floor(random() * 8)) * 60_000
    return { id: `${id}-sample-${index}`, at: new Date(timestamp).toISOString(), ...message }
  })
  const createdAt = new Date(timestamp + 2 * 60_000).toISOString()
  const draft: Draft | null = relevant && routing ? {
    id: `${id}-draft`, subject: `${shift.worker} · ${day}`,
    text: `Following up on ${kind === 'Worker' ? 'your' : `${shift.worker}'s`} hours at ${shift.fac.name} on ${day}. ${routing.ask}.`,
    createdAt, rationale: 'The recorded hours need confirmation before Payroll is finalized',
  } : null
  return {
    id, shiftId: shift.id, ruleId: relevant?.ruleId ?? '', counterparty, channel: kind === 'Worker' ? 'SMS' : 'Email',
    need: relevant && routing ? routing.ask : '', waitingOn: draft || entries.at(-1)?.dir === 'in' ? 'Us' : kind,
    entries, draft,
    // Sample messages are not actual delivery events in the audit trail.
    trail: draft ? [
      { at: entries[0].at, action: 'ingested', detail: `Received the time record for ${shift.worker} at ${shift.fac.name} on ${day}` },
      { at: createdAt, action: 'drafted', detail: `Prepared a question for ${counterparty.name}; awaiting send` },
    ] : [],
  }
}

export type ThreadAction =
  | { type: 'send'; text: string; at: string; draft?: boolean }
  | { type: 'edit'; text: string; at: string }
  | { type: 'dismiss'; at: string }

type SavedAction = ThreadAction & { v: 1; sentIndex?: number }

function inputSnapshot(note: string): { v: 1; type: 'input'; text: string } | null {
  try {
    const value: unknown = JSON.parse(note)
    if (!value || typeof value !== 'object') return null
    const input = value as Record<string, unknown>
    return input.v === 1 && input.type === 'input' && typeof input.text === 'string'
      ? { v: 1, type: 'input', text: input.text } : null
  } catch { return null }
}

/** The unsent composer is a snapshot, not a new trail event for each keystroke. */
export function readThreadInput(saved?: MediationState): string {
  for (const note of [...(saved?.notes ?? [])].reverse()) {
    const input = inputSnapshot(note)
    if (input) return input.text
  }
  return ''
}

export function recordThreadInput(saved: MediationState | undefined, text: string): MediationState {
  const notes = (saved?.notes ?? []).filter((note) => !inputSnapshot(note))
  if (text) notes.push(JSON.stringify({ v: 1, type: 'input', text }))
  return { ...saved, sent: [...(saved?.sent ?? [])], notes }
}

/** The fixed persistence shape keeps message bodies in sent and the action log in notes. */
export function recordThreadAction(saved: MediationState | undefined, action: ThreadAction): MediationState {
  const state: MediationState = { ...saved, sent: [...(saved?.sent ?? [])], notes: [...(saved?.notes ?? [])] }
  if ('text' in action && !action.text.trim()) return state
  if (!Number.isFinite(Date.parse(action.at))) return state
  const event: SavedAction = { ...action, v: 1 }
  if (action.type === 'send') {
    event.sentIndex = state.sent.length
    state.sent.push(action.text)
    if (action.draft) state.dismissedDraft = true
  } else if (action.type === 'edit') state.edited = action.text
  else state.dismissedDraft = true
  state.notes!.push(JSON.stringify(event))
  return state
}

function savedActions(notes: string[] = []): SavedAction[] {
  return notes.flatMap((note) => {
    try {
      const value: unknown = JSON.parse(note)
      if (!value || typeof value !== 'object') return []
      const action = value as Partial<SavedAction>
      if (action.v !== 1 || typeof action.at !== 'string' || !Number.isFinite(Date.parse(action.at))) return []
      if (action.type === 'dismiss') return [action as SavedAction]
      if ((action.type === 'send' || action.type === 'edit') && 'text' in action && typeof action.text === 'string') return [action as SavedAction]
      return []
    } catch { return [] }
  })
}

/** Rehydrate the derived base with local actions without changing the engine or the base thread. */
export function threadFor(cycle: DeskCycle, rs: RunShift, saved?: MediationState, party?: ThreadParty): MediationThread {
  const thread = generateThread(cycle, rs, party)
  if (!saved) return thread
  const subject = thread.draft?.subject
  const actions = savedActions(saved.notes).filter((action) => action.type !== 'send'
    || (Number.isInteger(action.sentIndex) && saved.sent[action.sentIndex!] === action.text))
  if (thread.draft && saved.edited !== undefined) thread.draft = { ...thread.draft, text: saved.edited }
  if (saved.dismissedDraft) thread.draft = null
  saved.sent.forEach((text, index) => {
    const event = actions.find((action) => action.type === 'send' && action.sentIndex === index)
    thread.entries.push({ id: `${thread.id}-sent-${index}`, dir: 'out', at: event?.at ?? '', text, ...(event?.type === 'send' && event.draft ? { subject } : {}) })
    if (event?.at) thread.askedAt = event.at
    else thread.trail.push({ at: '', action: 'sent', detail: `Sent to ${thread.counterparty.name} via ${thread.channel}; time not recorded` })
  })
  for (const action of actions) {
    const detail = action.type === 'edit' ? 'Draft revised' : action.type === 'dismiss' ? 'Draft marked not needed' : `Sent to ${thread.counterparty.name} via ${thread.channel}`
    thread.trail.push({ at: action.at, action: action.type === 'edit' ? 'revised' : action.type === 'dismiss' ? 'status' : 'sent', detail })
  }
  const latest = thread.entries.filter((entry) => entry.dir !== 'internal').at(-1)
  thread.waitingOn = latest?.dir === 'out' ? thread.counterparty.kind : 'Us'
  return thread
}
