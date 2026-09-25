import { FACILITIES, fmtHM, fmtT, runEngine, type Effect, type Row, type Run, type Shift as EngineShift } from '../bench/engine.js'
import type { Cycle } from './cycles.ts'

/**
 * The setup sample: one closed week at a staffing agency, as three files — the agency's Bullhorn time,
 * Pacific Cold Storage's UKG punches and Lonestar Packaging's ADP timecards — and the checks that reconcile them. Findings are
 * computed from the files, so the downloads and the result always agree.
 */

export type ClientKey = 'A' | 'B'
export const CLIENTS: Record<ClientKey, { name: string; city: string; state: string; system: 'UKG' | 'ADP'; supervisor: string }> = {
  A: { name: 'Pacific Cold Storage', city: 'Ontario', state: 'CA', system: 'UKG', supervisor: 'Maria Castillo' },
  B: { name: 'Lonestar Packaging', city: 'Dallas', state: 'TX', system: 'ADP', supervisor: 'Travis Reed' },
}
/** Employer burden on pay (taxes, workers' comp) used for margin. */
export const BURDEN = 0.2
/** What a missed payroll costs to fix with an off-cycle check. */
export const OFF_CYCLE_COST = 60

export interface Shift {
  worker: string
  client: ClientKey
  job: string
  /** 0 = first day of the week. */
  day: number
  /** Minutes from the start of `day`; past 1440 runs into the next day. */
  in: number
  out: number
  meal: [number, number] | null
  pay: number
  bill: number
  /** Night-shift differential, $/h. */
  diff: number
}
export interface Entry extends Shift { via: string; comment: string }
/** A client clock record. `dated` is the day the client's system files it under, when that differs from `day`. */
export interface Punch extends Shift { dated?: number }

export const worked = (s: Shift) => s.out - s.in - (s.meal ? s.meal[1] - s.meal[0] : 0)

const FIRST = ['Ana', 'Ben', 'Carla', 'Diego', 'Erin', 'Femi', 'Gabe', 'Hana', 'Ivan', 'Jade', 'Kofi', 'Lena', 'Malik', 'Nora', 'Oscar', 'Paula',
  'Quinn', 'Rosa', 'Sid', 'Tara', 'Uma', 'Victor', 'Wen', 'Xavi', 'Yara', 'Zane', 'Abel', 'Bea', 'Cruz', 'Dina', 'Eli']
const LAST = ['Alvarez', 'Brooks', 'Chen', 'Diaz', 'Evans', 'Flores', 'Garcia', 'Hughes', 'Ibarra', 'Johnson', 'Kim', 'Lopez', 'Moreno', 'Nguyen', 'Ortiz', 'Patel',
  'Quinn', 'Rivera', 'Singh', 'Torres', 'Usman', 'Valdez', 'Walker', 'Xiong', 'Yates', 'Zhang', 'Acosta', 'Bishop', 'Carter', 'Delgado', 'Ennis', 'Fischer', 'Gomez',
  'Holt', 'Iqbal', 'Jensen', 'Kaur', 'Lindqvist', 'Mendez', 'Novak', 'Okafor', 'Park', 'Ramos', 'Silva', 'Thomas', 'Ueda', 'Vargas', 'Wong', 'Yilmaz', 'Zuniga',
  'Ahmed', 'Bauer', 'Cruz', 'Dixon', 'Espinoza', 'Frost', 'Guzman', 'Hale', 'Ito', 'Joshi', 'Keller', 'Lam', 'Murphy', 'Nunez', 'Olsen', 'Pham', 'Reid', 'Soto', 'Tucker', 'Vu']
/** Deterministic wobble in [-spread, spread]. */
const J = (k: number, spread = 5) => ((k * 37 + 11) % (2 * spread + 1)) - spread

export function buildSample() {
  const punches: Punch[] = []
  const entries: Entry[] = []
  const clockOf = new Map<Entry, Punch>()
  let n = 0
  const nextWorker = () => { const name = `${FIRST[n % FIRST.length]} ${LAST[Math.floor(n / FIRST.length) % LAST.length]}`; n++; return name }
  const add = (s: Shift, via: string) => {
    const punch = { ...s }, entry = { ...s, via, comment: '' }
    punches.push(punch); entries.push(entry); clockOf.set(entry, punch)
    return entry
  }

  // Client A, day shift 6:00–2:30 with a meal about 3h20m in; Bullhorn is what workers enter on the web.
  // Findings 1 and 4 land on the first 142 workers; the rest are clean.
  const a: Entry[][] = []
  for (let w = 0; w < 1027; w++) {
    const worker = nextWorker()
    a.push([[0, 2, 4], [1, 3, 5], [0, 1, 3], [2, 4, 5]][w % 4].map((day, k) => {
      const start = 360 + J(w * 7 + k), meal = start + 200 + J(w + k, 15)
      return add({ worker, client: 'A', job: 'Warehouse associate', day, in: start, out: start + 510 + J(w * 3 + k, 6), meal: [meal, meal + 30], pay: 20, bill: 28.8, diff: 0 }, 'Web time entry')
    }))
  }
  // Finding 1: 140 time entries across 47 workers where Bullhorn runs past the clock; three were keyed by staff.
  a.slice(0, 47).flat().slice(0, 140).forEach((entry, i) => {
    const clock = clockOf.get(entry)!
    if (i % 50 === 13) {
      clock.in = entry.in = 360; clock.meal = entry.meal = [560, 590]; clock.out = 870
      entry.out = 1020; entry.via = 'Entered by staff'; entry.comment = 'Keyed by staff: 10.5 hrs'
    } else entry.out += [60, 60, 105, 30][i % 4]
  })
  // Finding 4: 95 time entries with no meal punch, or a meal after the fifth hour.
  for (let w = 47; w < 142; w++) {
    const entry = a[w][0], clock = clockOf.get(entry)!, none = w % 3 !== 0
    clock.meal = entry.meal = none ? null : [entry.in + 320, entry.in + 350]
    clock.out = entry.out = entry.in + (none ? 480 : 510)
  }

  // Client B, night shift from 10pm with a $1.50 differential; Bullhorn imports ADP's clock.
  const night = (worker: string, day: number, minutes: number, k: number) => {
    const start = 1320 + J(k)
    return { worker, client: 'B' as const, job: 'Night picker', day, in: start, out: start + minutes + 30, meal: [start + 240, start + 270] as [number, number], pay: 17, bill: 25, diff: 1.5 }
  }
  // Sixty work five 8h24m nights: 42 hours, two of them overtime (finding 5).
  for (let w = 0; w < 60; w++) { const worker = nextWorker(); for (let d = 0; d < 5; d++) add(night(worker, d, 504, w * 5 + d), 'Clock import') }
  for (let w = 0; w < 929; w++) { const worker = nextWorker(); for (const d of [[0, 2, 4], [1, 3, 5]][w % 2]) add(night(worker, d, 480, 90 + w * 3 + d), 'Clock import') }
  // Finding 2: twelve 10-hour nights in Bullhorn twice, from the ADP clock import and again keyed by staff.
  for (let w = 0; w < 12; w++) {
    const worker = nextWorker()
    for (const d of [0, 2, 4]) {
      const entry = add(night(worker, d, d === 2 ? 600 : 480, 140 + w * 3 + d), 'Clock import')
      if (d === 2) entries.push({ ...entry, via: 'Entered by staff', comment: '' })
    }
  }
  // Finding 3: eight Thursday nights in ADP that never reached Bullhorn.
  for (let w = 0; w < 8; w++) {
    const worker = nextWorker()
    for (const d of [1, 3, 5]) { const s = night(worker, d, 480, 150 + w * 3 + d); punches.push(s); if (d !== 3) entries.push({ ...s, via: 'Clock import', comment: '' }) }
  }
  // Finding 6: five workers with four 9h nights, then a Sunday overnight filed under Monday, so it left the week.
  for (let w = 0; w < 5; w++) {
    const worker = nextWorker()
    for (const d of [0, 1, 2, 3]) add(night(worker, d, 540, 160 + w * 4 + d), 'Clock import')
    punches.push({ ...night(worker, 6, 480, 170 + w), dated: 7 })
  }
  // Finding 7: forklift placements keyed at a $19.50 bill rate on $18.50 pay.
  for (let w = 0; w < 6; w++) { const worker = nextWorker(); for (let d = 0; d < 5; d++) add({ worker, client: 'B', job: 'Forklift operator', day: d, in: 420 + J(w + d), out: 420 + J(w + d) + 510, meal: [660, 690], pay: 18.5, bill: 19.5, diff: 0 }, 'Clock import') }

  return { punches, entries, workers: n }
}

export type Sample = ReturnType<typeof buildSample>

export interface EvidenceRow { source: string; start: number | null; end: number | null; meal: [number, number] | null; hours: number | null; note?: string }
/**
 * `day` is null for cases about the whole week. `target` is the time entry the case lands on in Payroll,
 * `note` its one-line finding there, and `delta` the pay correction it implies.
 */
export interface Case { worker: string; day: number | null; rows: EvidenceRow[]; detail: string; target: Shift; note: string; delta: number; effect?: Effect
  /** 'applied' when the evidence settles it and the agent made the correction; 'flag' when a person has to decide. */
  status: 'applied' | 'flag' }
export interface Finding {
  id: number
  /** Short label for the issue's tag. */
  tag: string
  title: string
  deadline: 'invoice' | 'payroll' | 'anytime'
  sources: string[]
  dispute: 'Client dispute' | 'Worker dispute' | 'Margin'
  summary: string
  why: string
  /** Always shown first: every timesheet has times. */
  hoursLabel: string
  /** Dollars need pay and bill rates; 0 and '' when the files carry none. */
  amount: number
  amountLabel: string
  action: string
  draft?: string
  cases: Case[]
}

const h = (minutes: number) => minutes / 60
const usd = (value: number) => `$${Math.round(value).toLocaleString()}`
const bh = (e: Entry): EvidenceRow => ({ source: 'Bullhorn', start: e.in, end: e.out, meal: e.meal, hours: h(worked(e)), note: e.comment || undefined })
const clockRow = (p: Punch): EvidenceRow => ({ source: CLIENTS[p.client].system, start: p.in, end: p.out, meal: p.meal, hours: h(worked(p)) })

/** Reconcile the three files. Each finding carries its evidence and a drafted action. */
export function findings({ punches, entries }: Sample, dayLabel: (day: number) => string): Finding[] {
  const at = (s: Shift) => `${s.worker}|${s.day}|${s.client}`
  const clocks = new Map(punches.filter((p) => p.dated === undefined).map((p) => [at(p), p]))
  const clockFor = (e: Shift) => clocks.get(at(e))
  const key = (e: Shift) => `${e.worker}|${e.day}|${e.in}|${e.out}`
  const seen = new Set<string>()
  const dupes: Entry[] = []
  const unique = entries.filter((e) => { if (seen.has(key(e))) { dupes.push(e); return false } seen.add(key(e)); return true })
  const weekly = new Map<string, number>()
  const lastOf = (worker: string) => unique.filter((e) => e.worker === worker).at(-1)!
  const entryAt = new Map(unique.map((e) => [at(e), e]))
  const entryFor = (p: Punch) => entryAt.get(at(p))!
  for (const e of unique) weekly.set(e.worker, (weekly.get(e.worker) ?? 0) + worked(e))

  // 1. Bullhorn hours the client's clock doesn't support.
  const over = unique.filter((e) => e.client === 'A').flatMap((e) => {
    const p = clockFor(e)
    return p && worked(e) - worked(p) > 15 ? [{ e, p, extra: h(worked(e) - worked(p)) }] : []
  })
  const byHand = over.find(({ e }) => e.via === 'Entered by staff')!
  const overHours = over.reduce((total, { extra }) => total + extra, 0)

  // 2. The same shift entered twice.
  const dupAmount = dupes.reduce((total, e) => total + h(worked(e)) * e.bill, 0)

  // 3. Client-clock shifts in the week that never reached Bullhorn.
  const missed = punches.filter((p) => p.dated === undefined && p.client === 'B' && !entryAt.has(at(p)))
  const missedPay = missed.reduce((total, p) => total + h(worked(p)) * (p.pay + p.diff), 0)

  // 4. California: over six hours with no meal started by the end of the fifth hour.
  const meals = punches.filter((p) => CLIENTS[p.client].state === 'CA' && worked(p) > 360 && (!p.meal || p.meal[0] - p.in > 300))

  // 5. Overtime priced at 1.5× base, leaving the differential out of the regular rate.
  const otWorkers = [...new Set(unique.filter((e) => e.diff > 0).map((e) => e.worker))].filter((worker) => (weekly.get(worker) ?? 0) > 2400)
  const otRate = unique.find((e) => e.diff > 0)!
  const otHours = otWorkers.reduce((total, worker) => total + h(weekly.get(worker)! - 2400), 0)

  // 6. An overnight shift that started in the week but was filed under the next one.
  const moved = punches.filter((p) => p.dated !== undefined && p.dated > 6 && p.day <= 6)
  const movedOt = moved.map((p) => ({ p, ot: Math.max(0, h(weekly.get(p.worker)! + worked(p) - 2400)) }))
  const movedAmount = movedOt.reduce((total, { p, ot }) => total + ot * 0.5 * (p.pay + p.diff), 0)

  // 7. Bill rate below loaded pay.
  const thin = unique.filter((e) => e.bill < e.pay * (1 + BURDEN))
  const thinHours = thin.reduce((total, e) => total + h(worked(e)), 0)
  const keyed = thin[0] ?? { pay: 0, bill: 0 }
  const loss = keyed.pay * (1 + BURDEN) - keyed.bill

  // Dollars, and the margin check, only when the timesheets carry pay and bill rates.
  const rates = entries.every((e) => e.pay > 0 && e.bill > 0)
  const a = CLIENTS.A, b = CLIENTS.B
  const workersIn = (list: { worker: string }[]) => new Set(list.map((item) => item.worker)).size
  const all: Finding[] = [
    {
      id: 1, tag: 'Unsupported hours', title: `Hours ${a.name}'s clock doesn't support`, deadline: 'invoice', sources: ['UKG', 'Bullhorn'], dispute: 'Client dispute',
      summary: `Across ${workersIn(over.map(({ e }) => e))} workers, Bullhorn has ${Math.round(overHours)} more hours than UKG's punches show`,
      why: `Staff keyed hours the clock doesn't show, like 10.5 hrs where UKG has ${fmtHM(worked(byHand.p))}. ${a.name} will short-pay the difference.`,
      hoursLabel: `${fmtHM(overHours * 60)} over-billed`, amount: overHours * over[0].e.bill, amountLabel: `${usd(overHours * over[0].e.bill)} billed`,
      action: `Pay and bill UKG's hours. For the ${over.filter(({ e }) => e.via === 'Entered by staff').length} keyed by hand, ask ${a.supervisor}, ${a.name}'s site supervisor, whether the worker stayed past their punch-out.`,
      draft: `Hi ${a.supervisor.split(' ')[0]}, ${byHand.e.worker} punched out at ${clock(byHand.p.out)} on ${dayLabel(byHand.e.day)}. Did they work any later than that?`,
      cases: [...over].sort((x, y) => y.extra - x.extra).map(({ e, p, extra }) => ({ worker: e.worker, day: e.day, rows: [bh(e), clockRow(p)], detail: `+${fmtHM(extra * 60)} in Bullhorn`,
        target: e, note: `Bullhorn has ${fmtHM(worked(e))}, but ${a.name}'s UKG punches show ${fmtHM(worked(p))}`, delta: -extra * e.pay,
        // The punches settle it, except where staff keyed the hours by hand.
        status: e.comment ? 'flag' as const : 'applied' as const, effect: { holdMin: Math.round(extra * 60) } })),
    },
    {
      id: 2, tag: 'Duplicate', title: 'Duplicate time entry', deadline: 'invoice', sources: ['ADP', 'Bullhorn'], dispute: 'Client dispute',
      summary: `${dupes.length} nights of ${fmtHM(worked(dupes[0]))} are in Bullhorn twice: once from the ADP clock import and again keyed by staff`,
      why: 'Clients find these in audits, then question every invoice',
      hoursLabel: `${fmtHM(dupes.reduce((total, e) => total + worked(e), 0))} entered twice`, amount: dupAmount, amountLabel: `${usd(dupAmount)} overbilled`,
      action: 'Delete the copies staff keyed by hand before invoicing',
      cases: dupes.map((e) => ({ worker: e.worker, day: e.day, rows: [...entries.filter((x) => key(x) === key(e)).map(bh), clockRow(clockFor(e)!)], detail: 'Same worker, day and times twice',
        target: e, note: 'In Bullhorn twice: once from the ADP clock import and again keyed by staff', delta: -h(worked(e)) * e.pay, status: 'flag' as const })),
    },
    {
      id: 3, tag: 'Missing time entry', title: 'Missing time entry, worker underpaid', deadline: 'payroll', sources: ['ADP', 'Bullhorn'], dispute: 'Worker dispute',
      summary: `${missed.length} nights in ADP never made it into Bullhorn`,
      why: `If it misses Payroll each needs an off-cycle check${rates ? ` (about ${usd(OFF_CYCLE_COST)} each)` : ''}. They call Friday, and they might not come back Monday.`,
      hoursLabel: `${fmtHM(missed.reduce((total, p) => total + worked(p), 0))} unpaid`, amount: missedPay + OFF_CYCLE_COST * missed.length, amountLabel: `${usd(missedPay)} short`,
      action: 'Add the missing time entries to Bullhorn before Payroll processing',
      cases: missed.map((p) => ({ worker: p.worker, day: p.day, rows: [clockRow(p), { source: 'Bullhorn', start: null, end: null, meal: null, hours: null, note: 'No entry' }], detail: `${fmtHM(worked(p))} not in Bullhorn`,
        target: p, note: `In ${b.name}'s ADP (${clock(p.in)} to ${clock(p.out)}) but never entered in Bullhorn`, delta: h(worked(p)) * (p.pay + p.diff), status: 'flag' as const })),
    },
    {
      id: 4, tag: 'Meal break', title: 'California meal breaks', deadline: 'payroll', sources: ['UKG'], dispute: 'Worker dispute',
      summary: 'Over 6 hours with no meal punch before the 5th hour',
      why: 'The premiums are small; the PAGA exposure isn\'t',
      hoursLabel: `${meals.length} premium hours owed`, amount: meals.reduce((total, p) => total + p.pay, 0), amountLabel: `${usd(meals.length * meals[0].pay)} owed`,
      action: `Pay ${meals.length} one-hour meal premiums at the regular rate this cycle`,
      cases: meals.map((p) => ({ worker: p.worker, day: p.day, rows: [clockRow(p)], detail: p.meal ? `Meal started ${fmtHM(p.meal[0] - p.in)} in` : 'No meal punch',
        target: entryFor(p), note: `${p.meal ? `Meal started ${fmtHM(p.meal[0] - p.in)} in` : 'No meal punch'} over ${fmtHM(worked(p))} in California, so they're owed an extra hour of pay`, delta: p.pay, effect: { premiumHours: 1 }, status: 'applied' as const })),
    },
    {
      id: 5, tag: 'Overtime rate', title: `Overtime at the wrong rate`, deadline: 'payroll', sources: ['ADP', 'Bullhorn'], dispute: 'Worker dispute',
      summary: `Overtime paid at 1.5× their $${otRate.pay} base, leaving out the $${otRate.diff.toFixed(2)} night differential`,
      why: 'It repeats every week the setup stays wrong',
      hoursLabel: `${fmtHM(otHours * 60)} OT underpaid`, amount: otHours * 1.5 * otRate.diff, amountLabel: `${usd(otHours * 1.5 * otRate.diff)} owed`,
      action: `Pay the $${(1.5 * otRate.diff).toFixed(2)}/h difference on ${otHours.toFixed(0)} overtime hours and fix the regular rate on ${b.name} night placements`,
      cases: otWorkers.map((worker) => ({ worker, day: null, rows: unique.filter((e) => e.worker === worker).map(bh), detail: `${fmtHM(weekly.get(worker)!)}: OT at $${(1.5 * otRate.pay).toFixed(2)}, should be $${(1.5 * (otRate.pay + otRate.diff)).toFixed(2)}`,
        target: lastOf(worker), note: `Overtime paid at 1.5× $${otRate.pay.toFixed(2)}, leaving out the $${otRate.diff.toFixed(2)} night differential`,
        delta: h(weekly.get(worker)! - 2400) * 1.5 * otRate.diff, effect: { premiumAmt: h(weekly.get(worker)! - 2400) * 1.5 * otRate.diff }, status: 'applied' as const })),
    },
    {
      id: 6, tag: 'Wrong week', title: 'Overnight time entry in the wrong week', deadline: 'payroll', sources: ['ADP'], dispute: 'Worker dispute',
      summary: `${moved.length} ${dayLabel(moved[0].day)} overnights were dated ${dayLabel(moved[0].dated!)}, so ${movedOt.reduce((total, { ot }) => total + ot, 0).toFixed(0)} overtime hours were missed`,
      why: 'Next week pays it as straight time, so the overtime is lost',
      hoursLabel: `${fmtHM(movedOt.reduce((total, { ot }) => total + ot, 0) * 60)} OT missed`, amount: movedAmount, amountLabel: `${usd(movedAmount)} underpaid`,
      action: 'Move the time entries into this week and pay the overtime',
      cases: movedOt.map(({ p, ot }) => ({ worker: p.worker, day: p.day, rows: [{ ...clockRow(p), note: `Dated ${dayLabel(p.dated!)}` }], detail: `${ot.toFixed(0)} OT hours missed`,
        target: lastOf(p.worker), note: `A ${dayLabel(p.day)} overnight was dated ${dayLabel(p.dated!)} in ADP, so ${ot.toFixed(0)} overtime hours were missed this week`,
        delta: ot * 0.5 * (p.pay + p.diff), effect: { premiumAmt: ot * 0.5 * (p.pay + p.diff) }, status: 'applied' as const })),
    },
    {
      id: 7, tag: 'Negative margin', title: 'Negative margin', deadline: 'anytime', sources: ['Bullhorn'], dispute: 'Margin',
      summary: `${workersIn(thin)} ${thin[0]?.job.toLowerCase() ?? 'worker'}s at ${b.name} are billed $${keyed.bill.toFixed(2)} against $${keyed.pay.toFixed(2)} pay in Bullhorn`,
      why: `With burden you lose $${loss.toFixed(2)} on every hour`,
      hoursLabel: `${fmtHM(thinHours * 60)} below cost`, amount: loss * thinHours, amountLabel: `${usd(loss * thinHours)} lost`,
      action: `Fix the bill rate on their placements. Breaking even needs at least $${(keyed.pay * (1 + BURDEN)).toFixed(2)}.`,
      cases: [...new Set(thin.map((e) => e.worker))].map((worker) => ({ worker, day: null, rows: thin.filter((e) => e.worker === worker).slice(0, 1).map(bh), detail: `Pay $${keyed.pay.toFixed(2)} · bill $${keyed.bill.toFixed(2)}`,
        target: thin.find((e) => e.worker === worker)!, note: `Bill rate $${keyed.bill.toFixed(2)} against $${keyed.pay.toFixed(2)} pay; with burden that loses $${loss.toFixed(2)} an hour`, delta: 0, status: 'flag' as const })),
    },
  ]
  return rates ? all : all.filter((f) => f.id !== 7).map((f) => ({ ...f, amount: 0, amountLabel: '' }))
}

// ---------- the three files ----------

const mdy = (d: Date) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
export const clock = fmtT
const hrs = (minutes: number) => (minutes / 60).toFixed(2)

/** `count` is in the system's own unit: Bullhorn time entries, UKG punches, ADP timecard rows. */
export type Csv = { name: string; label: string; note: string; count: string; header: string[]; rows: string[][] }

export function sampleCsvs({ punches, entries }: Sample, cycle: Cycle): Csv[] {
  const date = (day: number) => mdy(new Date(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate() + day))
  const ending = mdy(cycle.end).replace(/\//g, '-')
  const workers = [...new Set(entries.map((e) => e.worker))]
  const placements = [...new Set(entries.map((e) => `${e.worker}|${e.job}`))]
  const byWorker = <T extends Shift>(list: T[]) => [...list].sort((x, y) => x.worker.localeCompare(y.worker) || x.day - y.day || x.in - y.in)
  const pairs = (p: Punch) => p.meal ? [[p.in, p.meal[0]], [p.meal[1], p.out]] : [[p.in, p.out]]

  // Bullhorn Timesheet/TimesheetEntry fields, relabelled: https://bullhorn.github.io/rest-api-docs/entityref.html
  // Candidate leads so it can stay pinned while the table scrolls; the week ending is in the file name.
  const bullhorn = byWorker(entries).map((e) => [e.worker, String(77100 + placements.indexOf(`${e.worker}|${e.job}`)), CLIENTS[e.client].name, e.job, date(e.day),
    clock(e.in), clock(e.out), String(e.meal ? e.meal[1] - e.meal[0] : 0), hrs(worked(e)), e.pay.toFixed(2), e.bill.toFixed(2), e.via, 'Approved', CLIENTS[e.client].supervisor, e.comment])

  // UKG hourly timecard columns plus employee name and ID:
  // https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Timekeeping/MyHourlyTimecard.htm
  const period = new Map<string, number>()
  const ukg = byWorker(punches.filter((p) => p.client === 'A')).flatMap((p) => {
    const rows = pairs(p), daily = worked(p)
    period.set(p.worker, (period.get(p.worker) ?? 0) + daily)
    return rows.map(([start, end], i) => {
      const last = i === rows.length - 1
      return [p.worker, String(100400 + workers.indexOf(p.worker)), date(p.day), i === 0 ? '6:00 AM to 2:30 PM' : '', '', clock(start), clock(end), '', '', '',
        last ? hrs(daily) : '', last ? hrs(daily) : '', last ? hrs(period.get(p.worker)!) : '']
    })
  })

  // ADP WFN timecard: one row per time pair (Standard Reports Guide), fields from the WFN time entry API
  // (entryDate, entryCode, INTIME, OUTTIME, TOTALHOURS, laborAllocation); the differential is an hours entry.
  const adp = byWorker(punches.filter((p) => p.client === 'B')).flatMap((p) => {
    const row = (code: string, start: string, end: string, minutes: number) => [p.worker, String(4100 + workers.indexOf(p.worker)).padStart(6, '0'),
      p.job === 'Forklift operator' ? 'Shipping' : 'Night Pick', date(p.dated ?? p.day), code, start, end, hrs(minutes)]
    return [...pairs(p).map(([start, end]) => row('REG', clock(start), clock(end), end - start)), ...(p.diff ? [row('NIGHT DIFF', '', '', worked(p))] : [])]
  })

  return [
    { name: `bullhorn_time_${ending}.csv`, label: 'Bullhorn time export', count: `${entries.length.toLocaleString()} time entries`,
      note: `Your system. What you pay from and bill from. ${(['A', 'B'] as const).map((k) => `${entries.filter((e) => e.client === k).length.toLocaleString()} at ${CLIENTS[k].name}`).join(', ')}.`, rows: bullhorn,
      header: ['Candidate', 'Placement ID', 'Client', 'Job Title', 'Date', 'Start', 'End', 'Break (min)', 'Hours', 'Pay Rate', 'Bill Rate', 'Entered Via', 'Status', 'Approved By', 'Comment'] },
    { name: `ukg_timeclock_pacific_cold_storage_${ending}.csv`, label: `UKG timeclock · ${CLIENTS.A.name}`, count: `${(ukg.length * 2).toLocaleString()} punches`, note: `${CLIENTS.A.name}, a warehouse in ${CLIENTS.A.city}, ${CLIENTS.A.state}. Raw in, out and meal punches.`, rows: ukg,
      header: ['Employee', 'ID', 'Date', 'Schedule', 'Absence', 'In', 'Out', 'Transfer', 'Paycode', 'Amount', 'Shift', 'Daily', 'Period'] },
    { name: `adp_time_lonestar_packaging_${ending}.csv`, label: `ADP time export · ${CLIENTS.B.name}`, count: `${adp.length.toLocaleString()} timecard rows`, note: `${CLIENTS.B.name}, a distribution center in ${CLIENTS.B.city}, ${CLIENTS.B.state}. Timecards with a $1.50/hr night differential.`, rows: adp,
      header: ['Employee', 'File #', 'Department', 'Date', 'Pay Code', 'In Time', 'Out Time', 'Total Hours'] },
  ]
}

// ---------- the same week as a Payroll cycle ----------

const RULE_FOR: Record<number, string> = { 1: 'SRC-VMS-01', 2: 'CS-01', 3: 'SRC-MISS-01', 4: 'CA-MB-01', 5: 'FED-RR-01', 6: 'SRC-WEEK-01', 7: 'CON-MARGIN-01' }

/**
 * The sample week as Payroll's records: every Bullhorn time entry, plus the one only ADP has, each carrying the
 * findings that land on it. Pay starts as submitted (hours × Bullhorn rate) and moves by each finding's correction.
 */
export function sampleCycle(prefix: string): { week: EngineShift[]; run: Run } {
  const sample = buildSample()
  const found = findings(sample, (day) => `day ${day + 1}`)
  const missing = found.find((f) => f.id === 3)?.cases.map((c) => c.target) ?? []
  const sources: Shift[] = [...sample.entries, ...missing]
  const week = sources.map((s, i): EngineShift => ({ id: `${prefix}${i + 1}`, worker: s.worker, fac: s.client === 'A' ? FACILITIES.sutter : FACILITIES.lonestar,
    role: s.job, rate: s.pay, day: s.day, sched: null, punches: [{ in: s.in, out: s.out }], meal: s.meal, geo: null, ...(s.diff ? { diff: s.diff } : {}) }))
  const rows = new Map<Shift, { rows: Row[]; delta: number }>()
  for (const finding of found) for (const item of finding.cases) {
    const current = rows.get(item.target) ?? { rows: [], delta: 0 }
    current.rows.push({ ruleId: RULE_FOR[finding.id], status: item.status, note: item.note, kindDefault: 'det', ...(item.effect ? { effect: item.effect } : {}) })
    current.delta += item.delta
    rows.set(item.target, current)
  }
  // Only entries with findings go through the engine; the rest are clean by construction.
  week.forEach((shift, i) => { if (!rows.has(sources[i])) shift._clean = true })
  const base = runEngine(week)
  const shifts = base.shifts.map((rs, i) => {
    const source = sources[i], found = rows.get(source)
    const naive = missing.includes(source) ? 0 : h(worked(source)) * source.pay
    const pay = Math.max(0, (missing.includes(source) ? 0 : naive) + (found?.delta ?? 0))
    // Keep the rules that passed for the trail; the findings come from the reconciliation, not the single-source engine.
    return { ...rs, rows: [...rs.rows.filter((row) => row.status === 'pass' || row.status === 'na' || (row.status === 'applied' && !row.effect)), ...(found?.rows ?? [])], naive, pay, payableMin: worked(source), rate: source.pay, held: false, flagged: !!found?.rows.some((row) => row.status === 'flag'),
      deltaUnder: Math.max(0, pay - naive), deltaOver: Math.max(0, naive - pay) }
  })
  const totals = shifts.reduce((t, r) => ({ under: t.under + r.deltaUnder, over: t.over + r.deltaOver, flags: t.flags + (r.flagged ? 1 : 0), held: 0 }), { under: 0, over: 0, flags: 0, held: 0 })
  return { week, run: { shifts, totals, ctx: base.ctx } }
}
