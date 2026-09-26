import { FACILITIES } from '@/bench/engine.js'
import { SOURCES, sourceFor, type SendSchedule, type Source } from '@/bench/vendors'
import type { Cycle } from '@/lib/cycles'
import type { Onboarding } from '@/lib/onboarding'
import type { CyclePayload } from '@/lib/data'
import type { JourneyThread } from '@/lib/journey'
import { CLIENTS } from '@/lib/sample'

/** A time entry someone scheduled, and the source it should arrive from. */
export interface Expected { worker: string; client: string; day: number; source: string
  /** Minutes on site per HyperTrack location, when there is a trace. */
  onSite?: number }
export interface Gap extends Expected { id: string }
export interface SourceIntake { source: Source; expected: number; received: number; pending: number; late: boolean; lastReceived: Date; missing: Gap[] }
export interface ClientIntake { name: string; expected: number; received: number; open: number; sources: SourceIntake[] }
export interface Intake { expected: number; received: number; open: number; clients: ClientIntake[]; closed: (Gap & { reason: string })[] }
export type Step = 'intake' | 'review'
type AcceptedGaps = Onboarding['acceptedGaps']
type IntakeCycle = Pick<Cycle, 'id' | 'start' | 'end' | 'cutoff' | 'status'> & { week: { worker: string; day: number; fac: { name: string } }[]; server?: boolean; sample?: boolean; intake?: CyclePayload['intake'] }

const DAY = 86_400_000
const at = (d: Date, days: number, minutes = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, minutes)
export const gapId = (e: Pick<Expected, 'worker' | 'client' | 'day'>) => `${e.client}|${e.worker}|${e.day}`
export const gapKey = (cycleId: string, id: string) => `${cycleId}:${id}`
/** Hours are due at noon on the cutoff day. */
export const dueAt = (cycle: Pick<Cycle, 'cutoff'>) => at(cycle.cutoff, 0, 12 * 60)

/** The most recent time a source should have sent, at or before `now`. */
export function lastExpected({ day, at: minutes }: SendSchedule, now: Date): Date {
  for (let back = 0; back <= 7; back++) {
    const send = at(now, -back, minutes)
    if (send <= now && (day === undefined || send.getDay() === day)) return send
  }
  return at(now, -7, minutes)
}

/** Late means it missed its own usual send, not the cutoff. */
export const isLate = (lastReceived: Date, schedule: SendSchedule, now: Date) => lastReceived < lastExpected(schedule, now)

/**
 * Expected entries against received ones, by client then source. An entry a source hasn't sent since that day ended is
 * pending on the source; one the source skipped after that is missing. Accepted gaps leave the count.
 */
export function buildIntake({ cycleId, start, expected, received, lastReceived, accepted = {}, now, sourceLookup = SOURCES }: {
  cycleId: string; start: Date; expected: Expected[]; received: Set<string>
  lastReceived: Record<string, Date>; accepted?: AcceptedGaps; now: Date; sourceLookup?: Source[]
}): Intake {
  const closed: Intake['closed'] = []
  const clients = new Map<string, Map<string, SourceIntake>>()
  for (const entry of expected) {
    const id = gapId(entry)
    const reason = accepted[gapKey(cycleId, id)]?.reason
    if (typeof reason === 'string' && reason.trim()) { closed.push({ ...entry, id, reason }); continue }
    const sources = clients.get(entry.client) ?? new Map<string, SourceIntake>()
    clients.set(entry.client, sources)
    const last = lastReceived[entry.source] ?? now
    const row = sources.get(entry.source) ?? { source: sourceLookup.find((item) => item.id === entry.source) ?? { id: entry.source, name: 'Time export', short: 'Time export', group: 'Time & attendance', status: 'connected', method: 'Upload', sites: [entry.client], pulls: [], lastSync: null }, expected: 0, received: 0, pending: 0, late: false, lastReceived: last, missing: [] }
    sources.set(entry.source, row)
    row.expected++
    if (received.has(id)) row.received++
    else if (last < at(start, entry.day + 1)) row.pending++
    else row.missing.push({ ...entry, id })
  }
  const list = [...clients].map(([name, sources]): ClientIntake => {
    const rows = [...sources.values()].map((row) => ({ ...row, late: row.pending > 0 && !!row.source.sends && isLate(row.lastReceived, row.source.sends, now) }))
    const sum = (pick: (row: SourceIntake) => number) => rows.reduce((total, row) => total + pick(row), 0)
    return { name, expected: sum((row) => row.expected), received: sum((row) => row.received), open: sum((row) => row.pending + row.missing.length), sources: rows }
  })
  return {
    expected: list.reduce((total, client) => total + client.expected, 0),
    received: list.reduce((total, client) => total + client.received, 0),
    open: list.reduce((total, client) => total + client.open, 0),
    clients: list.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)),
    closed,
  }
}

const facilityKey = (name: string) => Object.keys(FACILITIES).find((key) => FACILITIES[key].name === name) ?? ''
/** Sample gaps for the week awaiting review: four entries no source has, and a wall clock that stopped sending. */
export const PLANTED: Expected[] = [
  { worker: 'Nora Alvarez', client: CLIENTS.A.name, day: 2, source: 'ukg-ready', onSite: 8 * 60 },
  { worker: 'Diego Brooks', client: CLIENTS.A.name, day: 4, source: 'ukg-ready' },
  { worker: 'Diego Jensen', client: CLIENTS.B.name, day: 0, source: 'adp-wfn', onSite: 7.5 * 60 },
  { worker: 'Carla Jensen', client: CLIENTS.B.name, day: 3, source: 'adp-wfn' },
]
const WALL_CLOCK_CREW = ['Luis Ortega', 'Keisha Grant', 'Tom Becker', 'Rina Das', 'Omar Haddad', 'Grace Lin']
/** Each works five days on a rotating start; the Friday 6pm export carried Monday to Friday. */
export const WALL_CLOCK: Expected[] = WALL_CLOCK_CREW.flatMap((worker, i) =>
  [0, 1, 2, 3, 4, 5, 6].filter((day) => (day + i) % 7 < 5).map((day) => ({ worker, client: FACILITIES.bayview.name, day, source: 'wallclock' })))

const serverIntakes = new WeakMap<object, { cycle: string; accepted: AcceptedGaps; minute: number; value: Intake }>()

/** Intake for one cycle. Only the week awaiting review is still collecting; earlier weeks arrived in full. */
export function cycleIntake(cycle: IntakeCycle, state: Pick<Onboarding, 'acceptedGaps' | 'uploads'>, now = new Date()): Intake {
  if (cycle.server || cycle.intake) {
    const payload = cycle.intake ?? { sources: [], expected: [], received: [] }
    const cached = serverIntakes.get(payload)
    const minute = Math.floor(now.getTime() / 60_000)
    if (cached?.cycle === cycle.id && cached.accepted === state.acceptedGaps && cached.minute === minute) return cached.value
    const sourceLookup: Source[] = payload.sources.map(source => ({ ...source, sample: source.sample ?? cycle.sample, group: 'Time & attendance', status: 'connected', sites: [...new Set(payload.expected.filter(entry => entry.source === source.id).map(entry => entry.client))], pulls: [], lastSync: source.lastReceived }))
    const value = buildIntake({ cycleId: cycle.id, start: cycle.start, now, expected: payload.expected, received: new Set(payload.received),
      lastReceived: Object.fromEntries(payload.sources.map(source => [source.id, source.lastReceived ? new Date(source.lastReceived) : new Date(0)])), accepted: state.acceptedGaps, sourceLookup })
    serverIntakes.set(payload, { cycle: cycle.id, accepted: state.acceptedGaps, minute, value })
    return value
  }
  const sourceAt = new Map<string, string>()
  const week = cycle.week.map((shift) => {
    const client = shift.fac.name
    if (!sourceAt.has(client)) sourceAt.set(client, sourceFor(facilityKey(client))?.id ?? 'upload')
    return { worker: shift.worker, client, day: shift.day, source: sourceAt.get(client)! }
  })
  const received = new Set(week.map(gapId))
  const lastReceived: Record<string, Date> = Object.fromEntries(SOURCES.flatMap((source) => source.sends ? [[source.id, lastExpected(source.sends, now)]] : []))
  const collecting = cycle.status === 'needs-review'
  if (collecting) {
    lastReceived.wallclock = at(cycle.start, 4, 18 * 60)
    for (const source of SOURCES) if (state.uploads[gapKey(cycle.id, source.id)]) lastReceived[source.id] = now
    for (const entry of WALL_CLOCK) if (entry.day <= 4 || state.uploads[gapKey(cycle.id, entry.source)]) received.add(gapId(entry))
  }
  return buildIntake({ cycleId: cycle.id, start: cycle.start, now, received, lastReceived, accepted: state.acceptedGaps,
    expected: collecting ? [...week, ...PLANTED, ...WALL_CLOCK] : week })
}

/** Open gaps someone was asked about (a sent, Not Sent · Demo message), keyed by gap id, with who was asked. */
export function askedGaps(cycle: Pick<IntakeCycle, 'id' | 'intake'>, threads: JourneyThread[], accepted: AcceptedGaps = {}): Map<string, string> {
  const received = new Set(cycle.intake?.received ?? [])
  const asked = new Map<string, string>()
  for (const thread of threads) {
    if (thread.cycleId !== cycle.id || !thread.messages.some(message => message.dir === 'out' && message.status !== 'draft' && message.text.trim())) continue
    for (const id of thread.counterparty.gapIds ?? []) if (!received.has(id) && !accepted[gapKey(cycle.id, id)]) asked.set(id, thread.counterparty.name)
  }
  return asked
}

/** An explicit `?step=` wins; a review filter or list view means Review. */
export function stepOf(params: URLSearchParams, fallback: Step): Step {
  const step = params.get('step')
  if (step === 'intake' || step === 'review') return step
  return ['filter', 'view', 'q'].some((key) => params.has(key)) ? 'review' : fallback
}

/** Neutral until the last day, amber inside it, red once past. */
export function dueTone(cycle: Pick<Cycle, 'cutoff'>, now = new Date()): 'late' | 'soon' | undefined {
  const left = dueAt(cycle).getTime() - now.getTime()
  return left <= 0 ? 'late' : left <= DAY ? 'soon' : undefined
}

export const HANDOFF_LINE = 'First, let\'s see what\'s arrived this week.'
export const intakeHref = (cycleId: string) => `/payroll?${new URLSearchParams({ cycle: cycleId, step: 'intake' })}`

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** 12pm reads noon; whole hours drop the minutes: 6pm, 4am, 12:30am. */
export function hour(minutes: number): string {
  if (minutes === 12 * 60) return 'noon'
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}
export const dayTime = (d: Date) => `${WEEKDAY[d.getDay()]} ${hour(d.getHours() * 60 + d.getMinutes())}`
export const usually = ({ day, at: minutes }: SendSchedule) =>
  day === undefined ? `nightly at ${hour(minutes)}` : `${WEEKDAY[day]} ${minutes >= 18 * 60 ? 'night' : hour(minutes)}`
export const initial = (name: string) => name.replace(/^(\S)\S*\s+/, '$1. ')
export function ago(then: Date, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000))
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : minutes < 24 * 60 ? `${Math.round(minutes / 60)}h ago` : dayTime(then)
}
