import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runEngine, RULES, fmtHM, type Facility, type Shift, type RunShift, type Row, type Effect } from '../../src/bench/engine.js'
import { WEEKDAYS, byWeekday, type Cycle, type Calendar } from '../../src/lib/cycles.ts'
import type { TimeEntry, Prov } from './ingest.ts'

export const engineSha = createHash('sha256').update(readFileSync(new URL('../../src/bench/engine.js', import.meta.url))).digest('hex')
export interface FactInput { kind: string; key: string; value: Record<string, unknown>; updatedAt?: string }
export interface FileInput { id: string; sourceId?: string | null; sha256?: string; mappingId?: string | null; normalizedAt?: string | null; periodEnd?: string | null; status?: string; sample?: boolean; unparsed?: { row: number; reason: string }[] }
export interface SourceInput { id: string; set: 1 | 2 | 3; system: string; site?: string | null; method: 'upload' | 'simulated'; sample?: boolean; lastReceivedAt?: string | null }
export interface Gap { id: string; kind: string; key: string; count: number; example?: { file: string; row: number }; blocks: string[]; ask: string }
export interface FindingCase { shiftId: string; ruleId: string; seq: number; status: 'flag' | 'held' | 'applied'; note: string; effect?: Effect; delta: number; exposure: number | null; entryIds: string[]; worker: string; site: string; workDate: string }
export interface FindingGroup { id?: number; ruleId: string; tag: string; title: string; summary: string; why: string; hoursLabel: string; amount: number; amountLabel: string; action: string; draft?: string; deadline: 'invoice' | 'payroll' | 'anytime'; sources: string[]; dispute: 'Client dispute' | 'Worker dispute' | 'Margin'; cases: number }
export interface Site extends Facility { key: string; supervisor?: { name: string; role?: string } }
export interface CyclePayload {
  cycle: { id: string; start: string; end: string; cutoff: string; deadline: string; payDate: string; status: Cycle['status'] }
  sample: boolean; runId: string; runAt: string; sites: Site[]
  week: (Omit<Shift, 'fac'> & { fac: number; prov: Prov & { hoursOnly?: boolean }; entryIds: string[]; sample: boolean })[]
  results: Omit<RunShift, 'shift'>[]
  totals: { under: number; over: number; flags: number; held: number; gross: number; naive: number; shifts: number; workers: number }
  counts: { set1: number; set2: number; set3: number }
  groups: FindingGroup[]; extraGroups: FindingGroup[]; gaps: Gap[]
  intake: { sources: { id: string; name: string; short: string; set: 1 | 2 | 3; method: string; lastReceived: string | null; sample: boolean; site: string | null }[]; expected: { worker: string; client: string; day: number; source: string; onSite?: number }[]; received: string[] }
}
export interface PipelineInput { email: string; cycle: Cycle; calendar?: Calendar; entries: TimeEntry[]; files: FileInput[]; facts: FactInput[]; sources?: SourceInput[]; engineSha?: string; now?: Date; dismissed?: string[]; timezone?: string }
export interface BuiltShift { shift: Shift; workDate: string; originalDate: string; s1: TimeEntry[]; s2: TimeEntry[]; s3: TimeEntry[]; prov: Prov; entryIds: string[]; wrongWeek: boolean; movedWithLocation: boolean; hoursOnly: boolean }
const DAY = 86_400_000
export const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addDays = (date: string, n: number) => new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10)
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY)
const key = (e: TimeEntry) => `${e.workerKey}|${e.siteKey}|${e.workDate}`
const digest = (s: string) => createHash('sha256').update(s).digest('hex')
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const number = (v: unknown, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown) => typeof v === 'string' ? v : ''
const total = <T>(list: T[], f: (t: T) => number) => list.reduce((n, t) => n + f(t), 0)
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
export function calendarFrom(doc: Record<string, unknown> = {}): Calendar {
  return { frequency: ['Weekly', 'Biweekly', 'Semi-monthly', 'Monthly'].includes(str(doc.frequency)) ? doc.frequency as Calendar['frequency'] : 'Weekly', periodEndDay: WEEKDAYS.includes(doc.periodEndDay as Calendar['periodEndDay']) ? doc.periodEndDay as Calendar['periodEndDay'] : 'Sunday', payDay: WEEKDAYS.includes(doc.payDay as Calendar['payDay']) ? doc.payDay as Calendar['payDay'] : 'Friday', payDatesOfMonth: Array.isArray(doc.payDatesOfMonth) && doc.payDatesOfMonth.length ? doc.payDatesOfMonth.filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 31) : [20, 5], cutoffDays: number(doc.cutoffDays, 1), deadlineDays: number(doc.deadlineDays, 2) }
}
export function accountToday(facts: FactInput[], doc: Record<string, unknown> = {}, now = new Date()): Date {
  const timezone = str(facts.find(f => f.kind === 'account' && f.key === 'timezone')?.value.value) || str(doc.timezone) || 'America/New_York'
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return new Date(part('year'), part('month') - 1, part('day'))
}
function factsOf(facts: FactInput[]) { return new Map(facts.map(f => [`${f.kind}|${f.key}`, f.value])) }
function workweekStart(input: PipelineInput): number {
  const configured = str(factsOf(input.facts).get('account|workweekStart')?.value)
  if (WEEKDAYS.includes(configured as typeof WEEKDAYS[number])) return byWeekday(configured)
  const cal = input.calendar ?? calendarFrom()
  return cal.frequency === 'Weekly' || cal.frequency === 'Biweekly' ? (byWeekday(cal.periodEndDay) + 1) % 7 : 1
}
function weekOf(date: string, start: number): string { return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() - start + 7) % 7)) }
export function entryMinutes(e: TimeEntry): number { return e.start != null && e.end != null ? Math.max(0, e.end - e.start - (e.mealMin ?? 0)) : e.minutes ?? 0 }
const workMinutes = (entries: TimeEntry[]) => total(entries.filter(e => !e.dupOf && (e.kind === 'work' || e.kind === 'hours')), entryMinutes)
function mealFrom(entries: TimeEntry[]): [number, number] | null {
  const explicit = entries.find(e => e.kind === 'meal' && e.start != null && e.end != null)
  if (explicit) return [explicit.start!, explicit.end!]
  const pairs = entries.filter(e => !e.dupOf && e.kind === 'work' && e.start != null && e.end != null).sort((a, b) => a.start! - b.start!)
  for (let i = 1; i < pairs.length; i++) { const gap = pairs[i].start! - pairs[i - 1].end!; if (gap > 0 && gap <= 60) return [pairs[i - 1].end!, pairs[i].start!] }
  return null
}
function punchesFrom(entries: TimeEntry[], meal: [number, number] | null): Shift['punches'] {
  const punches = entries.filter(e => !e.dupOf && e.kind === 'work' && e.start != null && e.end !== e.start).sort((a, b) => a.start! - b.start!).map(e => ({ in: e.start!, out: e.end }))
  // Bridge only the chosen meal gap. Longer breaks remain separate pairs for CA-SS-01.
  if (meal) { for (let i = 1; i < punches.length; i++) if (punches[i - 1].out === meal[0] && punches[i].in === meal[1]) { punches.splice(i - 1, 2, { in: punches[i - 1].in, out: punches[i].out }); break } }
  return punches
}
// State floors verified for 2026: https://www.dol.gov/agencies/whd/mw-consolidated
// CA: https://www.dir.ca.gov/DIRNews/2025/2025-118.html ; city/site facts override these floors.
const STATE_MIN: Record<string, number> = { CA: 16.9, NY: 16, TX: 7.25, IL: 15 }

export function assemble(input: PipelineInput): { shifts: BuiltShift[]; sites: Site[]; gaps: Gap[]; entries: TimeEntry[]; workweekStart: number } {
  const facts = factsOf(input.facts), start = isoDate(input.cycle.start), end = isoDate(input.cycle.end), ww = workweekStart(input)
  const from = weekOf(start, ww), through = addDays(weekOf(end, ww), 7)
  const files = new Map(input.files.map(f => [f.id, f]))
  const aliased = new Set<string>()
  const active = input.entries.filter(e => !e.supersededBy && (!files.get(e.fileId)?.status || files.get(e.fileId)?.status === 'normalized')).map(e => {
    const alias = str(facts.get(`alias|${e.sourceId}|${e.workerExt ?? e.worker}`)?.workerKey)
    if (alias) aliased.add(e.id)
    return { ...e, flags: [...e.flags], workerKey: alias || e.workerKey }
  })
  // Different external IDs with the same name are not evidence that these are one person.
  // Keep them separate until explicit aliases resolve the ambiguity.
  const identities = new Map<string, TimeEntry[]>()
  for (const e of active) if (e.workerExt && !aliased.has(e.id)) { const id = `${e.sourceId}|${e.workerKey}`; identities.set(id, [...(identities.get(id) ?? []), e]) }
  const ambiguous = [...identities].filter(([, es]) => new Set(es.map(e => e.workerExt)).size > 1)
  for (const [, es] of ambiguous) for (const e of es) e.workerKey = `${e.workerKey}|${e.sourceId}|${e.workerExt}`
  const activeById = new Map(active.map(e => [e.id, e]))
  for (const [, es] of ambiguous) for (const e of es) if (e.dupOf && activeById.get(e.dupOf)?.workerKey !== e.workerKey) e.dupOf = null
  const all = active.filter(e => e.workDate >= from && e.workDate <= through)
  const sets = [new Map<string, TimeEntry[]>(), new Map<string, TimeEntry[]>(), new Map<string, TimeEntry[]>()]
  for (const e of all) { const group = sets[e.set - 1]; group.set(key(e), [...(group.get(key(e)) ?? []), e]) }
  const latest = new Map<string, TimeEntry>()
  for (const e of [...active].sort((a, b) => a.workDate.localeCompare(b.workDate))) if (e.set === 1 && e.payRate != null) latest.set(`${e.workerKey}|${e.siteKey}`, e)
  const sites = new Map<string, Site>(), gaps = new Map<string, Gap>()
  const gap = (kind: string, gapKey: string, e: TimeEntry, blocks: string[], ask: string, count = 1) => { const id = `${kind}:${gapKey}`, old = gaps.get(id); if (old) old.count += count; else gaps.set(id, { id, kind, key: gapKey, count, example: { file: e.fileId, row: e.prov.row }, blocks, ask }) }
  const shifts: BuiltShift[] = []
  for (const groupKey of new Set([...sets[0].keys(), ...sets[1].keys()])) {
    const s1 = sets[0].get(groupKey) ?? [], s2 = sets[1].get(groupKey) ?? []
    const any = s1[0] ?? s2[0], byStart = (a: TimeEntry, b: TimeEntry) => (a.start ?? 0) - (b.start ?? 0), first = s1.filter(e => !e.dupOf && ['work', 'hours'].includes(e.kind)).sort(byStart)[0] ?? s2.filter(e => !e.dupOf && ['work', 'hours'].includes(e.kind)).sort(byStart)[0]
    if (!first) continue
    const midnight = s2.some(e => e.start != null && e.end != null && e.end >= 1440 && e.start < 1440)
    const period = s2.map(e => files.get(e.fileId)?.periodEnd).find(p => p && any.workDate === addDays(p, 1))
    const wrongWeek = !s1.length && !!period && midnight && (period === end || period < start)
    const movedKey = `${any.workerKey}|${any.siteKey}|${period}`
    const movedGeo = wrongWeek ? sets[2].get(movedKey) ?? active.filter(e => e.set === 3 && key(e) === movedKey) : []
    const proposedId = `s_${digest(`${input.email}|${any.workerKey}|${any.siteKey}|${period ?? any.workDate}|${first.start ?? 0}`).slice(0, 12)}`
    const dismissed = input.dismissed?.includes(proposedId) ?? false
    const effectiveWrong = wrongWeek && !dismissed
    const workDate = effectiveWrong ? period! : any.workDate
    if (workDate < from || workDate > addDays(through, -1)) continue
    const s3 = effectiveWrong ? movedGeo : sets[2].get(groupKey) ?? []
    const movedWithLocation = effectiveWrong && s3.some(e => e.start != null && first.start != null && Math.abs(e.start - first.start) <= 30)
    let fac = sites.get(any.siteKey)
    const siteFact = facts.get(`site|${any.siteKey}`)
    if (!fac) { fac = { key: any.siteKey, name: any.site, city: str(siteFact?.city), state: str(siteFact?.state), vertical: str(siteFact?.vertical), ...(typeof siteFact?.lat === 'number' ? { lat: siteFact.lat } : {}), ...(typeof siteFact?.lng === 'number' ? { lng: siteFact.lng } : {}), geofence: all.some(e => e.set === 3 && e.siteKey === any.siteKey && e.workDate >= start && e.workDate <= end), badge: false, autoDeduct: siteFact?.autoDeduct === true, minWage: number(siteFact?.minWage, STATE_MIN[str(siteFact?.state)] ?? 0), ...(siteFact?.supervisor ? { supervisor: siteFact.supervisor as Site['supervisor'] } : {}) }; sites.set(any.siteKey, fac) }
    const inCycle = workDate >= start && workDate <= end
    if (!siteFact?.state && inCycle) gap('site', any.siteKey, any, ['State', 'Local'], `Where is ${any.site}? City and state is enough.`)
    if (siteFact?.state && siteFact.minWage == null && inCycle) gap('min_wage', any.siteKey, any, ['minimum wage', 'Local'], `What minimum wage applies at ${any.site}?`)
    if (siteFact?.state && !siteFact.tz && !facts.has('account|timezone') && !input.timezone && inCycle) gap('timezone', any.siteKey, any, ['time normalization'], `What time zone does ${any.site}'s clock use?`)
    const own = s1.filter(e => !e.dupOf), base = own.length ? own : s2.filter(e => !e.dupOf)
    const rateFact = facts.get(`rate|w:${any.workerKey}`) ?? facts.get(`rate|${any.siteKey}|${first.role ?? ''}`) ?? facts.get(`rate|${any.siteKey}|*`)
    const rate = own.find(e => e.payRate != null)?.payRate ?? latest.get(`${any.workerKey}|${any.siteKey}`)?.payRate ?? number(rateFact?.pay)
    if (!rate && inCycle) gap('rate', `${any.siteKey}|${first.role ?? '*'}`, any, ['pay'], `What do you pay ${first.role || 'workers'} at ${any.site}?`)
    const ownMeal = mealFrom(own), otherMeal = mealFrom(s2), length = own.find(e => e.mealMin != null)?.mealMin
    const meal = ownMeal ?? (otherMeal && (length == null || Math.abs(length - (otherMeal[1] - otherMeal[0])) <= 5) ? otherMeal : null)
    if (!ownMeal && otherMeal && length != null && Math.abs(length - (otherMeal[1] - otherMeal[0])) > 5) { for (const entry of own) if (!entry.flags.includes('meal_mismatch')) entry.flags = [...entry.flags, 'meal_mismatch'] }
    const mealMin = meal ? undefined : length ?? undefined
    if (fac.state === 'CA' && mealMin && inCycle) gap('meal_times', any.siteKey, any, ['CA-MB-01'], `The files have break minutes but not when the breaks started. Does ${any.site}'s clock have meal punches?`)
    const hoursOnly = base.every(e => e.start == null && e.kind === 'hours')
    const diffFact = facts.get(`differential|${any.siteKey}`), diffRows = [...own, ...s2].filter(e => e.kind === 'diff')
    const hasDiff = !!diffFact && (!diffFact.payCode || [...own, ...s2].some(e => e.payCode === diffFact.payCode))
    if (diffRows.length && !diffFact && inCycle) gap('differential', any.siteKey, any, ['FED-RR-01'], `${diffRows[0].payCode || 'Differential'} hours appear at ${any.site}. How much is it per hour?`)
    const capture = own[0]?.capture
    const shift: Shift = { id: `s_${digest(`${input.email}|${any.workerKey}|${any.siteKey}|${workDate}|${first.start ?? 0}`).slice(0, 12)}`, worker: any.worker, fac, role: first.role ?? '', rate, day: days(workDate, start), sched: [...own, ...s2].find(e => e.sched)?.sched ?? null, punches: hoursOnly ? [{ in: 0, out: workMinutes(base) }] : punchesFrom(base, meal), meal, geo: s3.length ? [Math.min(...s3.filter(e => e.start != null).map(e => e.start!)), Math.max(...s3.filter(e => e.end != null).map(e => e.end!))] : null, ...(mealMin != null ? { mealMin } : {}), ...(own.length && s2.length ? { vms: { min: workMinutes(s2) } } : {}), ...(hasDiff ? { diff: number(diffFact?.perHour) } : {}), capture: capture && capture !== 'location' ? capture : own.length ? 'import' : 'clock', ...(hoursOnly ? { _clean: true } : {}) }
    const edited = [...own, ...s2].find(e => e.edited)
    if (edited) shift.editedAfterApproval = `${input.sources?.find(s => s.id === edited.sourceId)?.system ?? 'File'} · ${edited.approvedBy ?? 'unknown editor'}`
    shifts.push({ shift, workDate, originalDate: any.workDate, s1, s2, s3, prov: first.prov, entryIds: [...s1, ...s2, ...s3].map(e => e.id), wrongWeek: effectiveWrong, movedWithLocation, hoursOnly })
    if (!period && !s1.length && midnight && inCycle && s2.every(e => !files.get(e.fileId)?.periodEnd)) gap('period', s2[0].fileId, any, ['SRC-WEEK-01'], `What period does this overnight export cover?`)
  }
  const inCycle = shifts.filter(b => b.workDate >= start && b.workDate <= end)
  for (const [siteKey, site] of sites) { const bs = inCycle.filter(b => b.shift.fac === site), one = bs.some(b => b.s1.length), two = bs.some(b => b.s2.length); if (one !== two && bs.length) gap('set_missing', `${siteKey}|${one ? 2 : 1}`, (bs[0].s1[0] ?? bs[0].s2[0]), ['SRC-VMS-01', 'SRC-MISS-01'], one ? `Can you send ${site.name}'s client-approved hours?` : `Can you send your worker-reported hours for ${site.name}?`, bs.length) }
  for (const [id, es] of ambiguous) if (es.some(e => e.workDate >= start && e.workDate <= end)) gap('worker', id, es[0], ['SRC-VMS-01', 'SRC-MISS-01'], `Do the different worker IDs for ${es[0].worker} identify the same person?`, es.length)
  const pairKeys = new Map<string, TimeEntry[]>()
  for (const e of all.filter(e => e.kind === 'work' && e.start != null)) { const id = `${e.siteKey}|${e.workDate}|${e.start}|${e.end}`; pairKeys.set(id, [...(pairKeys.get(id) ?? []), e]) }
  for (const es of pairKeys.values()) if (es.length === 2 && es.some(e => e.set === 1) && es.some(e => e.set === 2) && new Set(es.map(e => e.workerKey)).size > 1) gap('worker', `${es[0].siteKey}|${es.map(e => e.workerKey).sort().join('|')}`, es[0], ['SRC-VMS-01', 'SRC-MISS-01'], `Are ${[...new Set(es.map(e => e.worker))].slice(0, 2).join(' and ')} the same person?`)
  for (const file of input.files) if (file.unparsed?.length) { const id = `unparsed:${file.id}`; gaps.set(id, { id, kind: 'unparsed', key: file.id, count: file.unparsed.length, example: { file: file.id, row: file.unparsed[0].row }, blocks: ['missing rows'], ask: `Some rows in ${file.id} could not be read. Should their mapping be corrected?` }) }
  if (!facts.has('account|workweekStart') && ['Biweekly', 'Semi-monthly', 'Monthly'].includes(input.calendar?.frequency ?? '') && all.length) gap('workweek', 'workweekStart', all[0], ['FED-OT-40', 'FED-RR-01'], 'What day does your workweek start?')
  shifts.sort((a, b) => a.shift.worker.localeCompare(b.shift.worker) || a.workDate.localeCompare(b.workDate) || (a.shift.punches[0]?.in ?? 0) - (b.shift.punches[0]?.in ?? 0))
  return { shifts, sites: [...sites.values()], gaps: [...gaps.values()].sort((a, b) => b.count * b.blocks.length - a.count * a.blocks.length), entries: all, workweekStart: ww }
}

export function pipelineInputHash(input: Pick<PipelineInput, 'cycle' | 'calendar' | 'files' | 'facts' | 'engineSha' | 'dismissed' | 'timezone'>): string {
  return digest(canonical({ engine: input.engineSha ?? engineSha, cycle: [isoDate(input.cycle.start), isoDate(input.cycle.end), input.cycle.status], calendar: input.calendar ?? calendarFrom(), timezone: input.timezone ?? null, files: input.files.filter(f => !f.status || f.status === 'normalized').map(f => [f.id, f.sha256, f.mappingId, f.normalizedAt, f.periodEnd]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), facts: [...input.facts].sort((a, b) => `${a.kind}|${a.key}`.localeCompare(`${b.kind}|${b.key}`)), dismissed: [...(input.dismissed ?? [])].sort(), overrides: {} }))
}
const MAIN_RULES = ['SRC-VMS-01', 'CS-01', 'SRC-MISS-01', 'CA-MB-01', 'FED-RR-01', 'SRC-WEEK-01', 'CON-MARGIN-01']
interface Detail { row: FindingCase; built: BuiltShift; minutes: number; primary: boolean }
const effectedAmount = (row: Row, rate: number) => (row.effect?.premiumAmt ?? 0) + (row.effect?.premiumHours ?? 0) * rate + ((row.effect?.otPremiumMin ?? 0) + (row.effect?.premiumMin ?? 0) + (row.effect?.topUpMin ?? 0)) / 60 * rate
function templateGroup(ruleId: string, list: Detail[], input: PipelineInput, rates: boolean): FindingGroup {
  const n = list.length, minutes = total(list, x => x.minutes), amount = rates ? cents(total(list, x => x.row.exposure ?? 0)) : 0
  const site = list[0].built.shift.fac as Site, workers = new Set(list.map(x => x.row.worker)).size
  const sourceIds = new Set(list.flatMap(d => [...d.built.s1, ...d.built.s2].map(e => e.sourceId)))
  const sources = [...new Set((input.sources ?? []).filter(s => sourceIds.has(s.id)).map(s => s.system))]
  const ownSystem = input.sources?.find(s => s.set === 1 && sourceIds.has(s.id))?.system ?? 'the agency export'
  const clockSystem = input.sources?.find(s => s.set === 2 && sourceIds.has(s.id))?.system ?? 'the client clock'
  const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
  const base = { ruleId, sources, cases: n, amount, amountLabel: rates ? `${usd(amount)} owed` : '', draft: undefined as string | undefined }
  const first = list[0].built.shift, id = MAIN_RULES.indexOf(ruleId) + 1
  switch (ruleId) {
    case 'SRC-VMS-01': return { ...base, id, tag: 'Unsupported hours', title: `Hours ${site.name}'s clock doesn't support`, deadline: 'invoice', dispute: 'Client dispute', summary: `Across ${workers} workers, ${ownSystem} has ${fmtHM(minutes)} different from ${clockSystem}'s punches`, why: `The submitted time differs from ${site.name}'s approved hours. Confirm the discrepancy before changing pay.`, hoursLabel: `${fmtHM(minutes)} over-billed`, amountLabel: rates ? `${usd(amount)} billed` : '', action: `Review the differences with ${site.supervisor?.name ?? 'the site supervisor'} before correcting ${ownSystem}.`, ...(site.supervisor ? { draft: `Hi ${site.supervisor.name.split(' ')[0]}, did ${first.worker} work later than their clock-out? Please confirm the time in the attached file and row.` } : {}) }
    case 'CS-01': return { ...base, id, tag: 'Duplicate', title: 'Duplicate time entry', deadline: 'invoice', dispute: 'Client dispute', summary: `${n} time entries are in ${ownSystem} twice`, why: 'Clients find these in audits, then question every invoice', hoursLabel: `${fmtHM(minutes)} entered twice`, amountLabel: rates ? `${usd(amount)} overbilled` : '', action: `Remove the duplicate copies from ${ownSystem} before invoicing` }
    case 'SRC-MISS-01': return { ...base, id, tag: 'Missing time entry', title: 'Missing time entry, worker underpaid', deadline: 'payroll', dispute: 'Worker dispute', summary: `${n} time entries in ${clockSystem} never made it into ${ownSystem}`, why: 'If they miss payroll each needs an off-cycle check.', hoursLabel: `${fmtHM(minutes)} unpaid`, action: `Add the missing time entries to ${ownSystem} before payroll processing` }
    case 'CA-MB-01': return { ...base, id, tag: 'Meal break', title: 'California meal breaks', deadline: 'payroll', dispute: 'Worker dispute', summary: 'Missing, late or short meal breaks require review', why: 'The recorded meal times trigger the California meal rule.', hoursLabel: `${minutes / 60} premium hours owed`, action: `Review and pay ${minutes / 60} one-hour meal premiums this cycle` }
    case 'FED-RR-01': return { ...base, id, tag: 'Overtime rate', title: 'Overtime at the wrong rate', deadline: 'payroll', dispute: 'Worker dispute', summary: `Overtime omitted the recorded differential from the regular rate`, why: 'It repeats every week the setup stays wrong', hoursLabel: `${fmtHM(minutes)} OT underpaid`, action: `Review the overtime adjustment and fix the regular rate on ${site.name} placements` }
    case 'SRC-WEEK-01': return { ...base, id, tag: 'Wrong week', title: 'Overnight time entry in the wrong week', deadline: 'payroll', dispute: 'Worker dispute', summary: `${n} overnights were dated after the export's stated period`, why: 'Next week pays the shift as straight time, so overtime can be lost', hoursLabel: `${fmtHM(minutes)} OT missed`, amountLabel: rates ? `${usd(amount)} underpaid` : '', action: 'Move the supported time entries into this week and pay the overtime' }
    default: return { ...base, id, tag: 'Negative margin', title: 'Negative margin', deadline: 'anytime', dispute: 'Margin', summary: `${workers} workers at ${site.name} have bill rates below loaded pay`, why: 'Employer burden makes these hours cost more than they bill', hoursLabel: `${fmtHM(minutes)} below cost`, amountLabel: rates ? `${usd(amount)} lost` : '', action: 'Fix the bill rates on the affected placements' }
  }
}

/** Runs complete workweeks, then keeps the cycle's shifts. Per-shift rows retain the real engine's full trace. */
export function buildCycle(input: PipelineInput): { payload: CyclePayload; findings: FindingCase[]; inputHash: string } {
  const assembled = assemble(input), start = isoDate(input.cycle.start), end = isoDate(input.cycle.end), facts = factsOf(input.facts)
  const weeks = new Map<string, BuiltShift[]>()
  for (const b of assembled.shifts) { const week = weekOf(b.workDate, assembled.workweekStart); weeks.set(week, [...(weeks.get(week) ?? []), b]) }
  const kept: { built: BuiltShift; result: RunShift; worked: number; weekWorked: number }[] = []
  for (const [week, bs] of weeks) {
    const engineShifts = bs.map(b => ({ ...b.shift, worker: (b.s1[0] ?? b.s2[0]).workerKey, day: days(b.workDate, week) }))
    const run = runEngine(engineShifts)
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i], result = run.shifts[i]
      if (b.workDate < start || b.workDate > end) continue
      kept.push({ built: b, result: { ...result, payrollContext: { workerKey: result.shift.worker, workweek: week,
        workerWorkedMin: run.ctx.weeklyWorked(result.shift.worker),
        workerDailyOtMin: (run.ctx.byWorker.get(result.shift.worker) ?? []).reduce((n, shift) => n + (shift._dailyOtMin ?? 0), 0) },
        shift: { ...result.shift, worker: b.shift.worker, day: days(b.workDate, start) } }, worked: run.ctx.workedMin(result.shift), weekWorked: run.ctx.weeklyWorked(result.shift.worker) })
    }
  }
  const hasSet1 = new Set(kept.filter(x => x.built.s1.length).map(x => (x.built.shift.fac as Site).key))
  const details: Detail[] = []
  const ownEntries = assembled.entries.filter(e => e.set === 1 && e.workDate >= start && e.workDate <= end)
  const hasRates = ownEntries.length > 0 && ownEntries.every(e => e.payRate != null && e.billRate != null)
  const burden = number(facts.get('account|burden')?.value, 0.2), offCycleCost = number(facts.get('account|offCycleCost')?.value, 60)
  const seq = new Map<string, number>()
  const add = (b: BuiltShift, result: RunShift, row: Row, exposure: number | null, minutes: number, primary = MAIN_RULES.includes(row.ruleId), evidence = b.entryIds) => {
    const k = `${b.shift.id}|${row.ruleId}`, sequence = seq.get(k) ?? 0; seq.set(k, sequence + 1)
    details.push({ built: b, minutes, primary, row: { shiftId: b.shift.id, ruleId: row.ruleId, seq: sequence, status: row.status as FindingCase['status'], note: row.note, ...(row.effect ? { effect: row.effect } : {}), delta: cents(result.pay - result.naive), exposure: exposure == null ? null : cents(exposure), entryIds: evidence, worker: b.shift.worker, site: b.shift.fac.name, workDate: b.workDate } })
  }
  for (const { built: b, result, worked, weekWorked } of kept) {
    const duplicateRows = b.s1.filter(e => e.dupOf)
    result.naive += total(duplicateRows, e => entryMinutes(e) / 60 * (e.payRate ?? b.shift.rate))
    const missing = !b.s1.length && hasSet1.has((b.shift.fac as Site).key) && !b.wrongWeek
    if (missing || b.wrongWeek) result.naive = 0
    for (const row of result.rows) {
      if (!['flag', 'held'].includes(row.status) && !(row.status === 'applied' && row.effect)) continue
      let exposure = effectedAmount(row, result.rate), minutes = worked
      if (row.ruleId === 'SRC-VMS-01') { minutes = Math.abs(worked - (b.shift.vms?.min ?? worked)); exposure = minutes / 60 * (b.s1.find(e => e.billRate != null)?.billRate ?? 0) }
      else if (row.ruleId === 'CA-MB-01') { minutes = (row.effect?.premiumHours ?? 0) * 60; exposure = minutes / 60 * result.rate }
      else if (row.ruleId === 'FED-RR-01') { minutes = b.shift.diff ? exposure / (1.5 * b.shift.diff) * 60 : 0 }
      // Re-dated shifts have their own full engine output. Their newly created overtime is an extra,
      // while the seven reconciliation groups retain the pre-correction exposure definition.
      add(b, result, row, exposure, minutes, MAIN_RULES.includes(row.ruleId) && !(b.wrongWeek && row.ruleId === 'FED-RR-01'))
    }
    for (const duplicate of duplicateRows) { const row: Row = { ruleId: 'CS-01', status: 'flag', kindDefault: 'det', note: 'Same worker, site, day and times were entered twice; duplicate excluded from payable hours' }; result.rows.push(row); add(b, result, row, entryMinutes(duplicate) / 60 * (duplicate.billRate ?? 0), entryMinutes(duplicate), true, [duplicate.dupOf!, duplicate.id]) }
    if (missing) { const row: Row = { ruleId: 'SRC-MISS-01', status: 'flag', kindDefault: 'det', note: 'Client-approved time has no matching worker-reported entry' }; result.rows.push(row); add(b, result, row, workMinutes(b.s2) / 60 * (b.shift.rate + (b.shift.diff ?? 0)) + offCycleCost, workMinutes(b.s2)) }
    if (b.wrongWeek) { const overtime = Math.max(0, weekWorked - 2400), row: Row = { ruleId: 'SRC-WEEK-01', status: b.movedWithLocation ? 'applied' : 'flag', kindDefault: 'det', note: `Overnight dated ${b.originalDate} belongs to the export period ending ${b.workDate}${b.movedWithLocation ? '; location confirms the start' : '; confirm the start date'}` }; result.rows.push(row); add(b, result, row, overtime / 60 * 0.5 * (b.shift.rate + (b.shift.diff ?? 0)), overtime) }
    result.flagged = result.rows.some(r => r.status === 'flag' || r.status === 'held')
    result.deltaUnder = Math.max(0, result.pay - result.naive); result.deltaOver = Math.max(0, result.naive - result.pay)
  }
  if (hasRates) {
    const thin = new Map<string, { entry: TimeEntry; built: BuiltShift; result: RunShift }[]>()
    for (const { built, result } of kept) for (const entry of built.s1) if (!entry.dupOf && entry.kind === 'work' && entry.billRate! < entry.payRate! * (1 + burden)) { const id = `${entry.workerKey}|${entry.siteKey}`; thin.set(id, [...(thin.get(id) ?? []), { entry, built, result }]) }
    for (const es of thin.values()) { const { built, result } = es[0], row: Row = { ruleId: 'CON-MARGIN-01', status: 'flag', kindDefault: 'det', note: `Bill rate is below pay plus ${Math.round(burden * 100)}% employer burden` }; result.rows.push(row); result.flagged = true; add(built, result, row, total(es, e => entryMinutes(e.entry) / 60 * (e.entry.payRate! * (1 + burden) - e.entry.billRate!)), total(es, e => entryMinutes(e.entry)), true, es.map(e => e.entry.id)) }
  }
  const groups = MAIN_RULES.flatMap(ruleId => { const list = details.filter(d => d.primary && d.row.ruleId === ruleId); return list.length ? [templateGroup(ruleId, list, input, hasRates)] : [] })
  const extraRules = [...new Set(details.filter(d => !d.primary).map(d => d.row.ruleId))]
  const extraGroups = extraRules.map((ruleId): FindingGroup => { const list = details.filter(d => !d.primary && d.row.ruleId === ruleId), rule = RULES.find(r => r.id === ruleId), amount = cents(total(list, d => Math.abs(d.row.exposure ?? d.row.delta))); return { ruleId, tag: ruleId, title: rule?.sentence ?? ruleId, summary: `${list.length} engine findings${list.some(d => d.built.wrongWeek) ? ` (${list.filter(d => d.built.wrongWeek).length} on re-dated shifts)` : ''}`, why: rule?.source.doc ?? '', hoursLabel: fmtHM(total(list, d => d.minutes)), amount, amountLabel: `$${amount.toFixed(2)}`, action: 'Review the engine evidence', deadline: 'payroll', sources: [], dispute: 'Worker dispute', cases: list.length } })
  const totals = kept.reduce((t, { result: r }) => ({ under: t.under + (r.held ? 0 : r.deltaUnder), over: t.over + (r.held ? 0 : r.deltaOver), flags: t.flags + Number(r.flagged), held: t.held + Number(r.held), gross: t.gross + r.pay, naive: t.naive + r.naive, shifts: t.shifts + 1, workers: 0 }), { under: 0, over: 0, flags: 0, held: 0, gross: 0, naive: 0, shifts: 0, workers: 0 })
  totals.workers = new Set(kept.map(x => (x.built.s1[0] ?? x.built.s2[0]).workerKey)).size
  const inputHash = pipelineInputHash(input), siteIndex = new Map(assembled.sites.map((s, i) => [s, i]))
  const entryIds = new Set(kept.flatMap(x => x.built.entryIds))
  const counted = assembled.entries.filter(e => entryIds.has(e.id)), counts = { set1: counted.filter(e => e.set === 1).length, set2: counted.filter(e => e.set === 2).length, set3: counted.filter(e => e.set === 3).length }
  const payload: CyclePayload = { cycle: { id: input.cycle.id, start, end, cutoff: isoDate(input.cycle.cutoff), deadline: isoDate(input.cycle.deadline), payDate: isoDate(input.cycle.payDate), status: input.cycle.status }, sample: counted.length > 0 ? counted.every(e => e.sample) : assembled.entries.length > 0 && assembled.entries.every(e => e.sample), runId: `r_${inputHash.slice(0, 16)}`, runAt: (input.now ?? new Date()).toISOString(), sites: assembled.sites, week: kept.map(({ built: b, result: r }) => ({ ...r.shift, fac: siteIndex.get(b.shift.fac as Site)!, prov: { ...b.prov, ...(b.hoursOnly ? { hoursOnly: true } : {}) }, entryIds: b.entryIds, sample: [...b.s1, ...b.s2, ...b.s3].some(e => e.sample) })), results: kept.map(({ result: r }) => ({ rows: r.rows, pay: r.pay, naive: r.naive, held: r.held, flagged: r.flagged, deltaUnder: r.deltaUnder, deltaOver: r.deltaOver, payableMin: r.payableMin, rate: r.rate, payrollContext: r.payrollContext })), totals, counts, groups, extraGroups, gaps: assembled.gaps, intake: { sources: (input.sources ?? []).map(s => ({ id: s.id, name: s.system, short: s.system, set: s.set, method: s.method, lastReceived: s.lastReceivedAt ?? null, sample: s.sample ?? false, site: s.site ?? null })), expected: kept.map(({ built: b }) => ({ worker: b.shift.worker, client: b.shift.fac.name, day: days(b.workDate, start), source: b.s2[0]?.sourceId ?? b.s1[0]?.sourceId ?? '', ...(b.shift.geo ? { onSite: b.shift.geo[1] - b.shift.geo[0] } : {}) })), received: kept.filter(x => x.built.s2.length).map(({ built: b }) => `${b.shift.fac.name}|${b.shift.worker}|${days(b.workDate, start)}`) } }
  return { payload, findings: details.map(d => d.row), inputHash }
}
