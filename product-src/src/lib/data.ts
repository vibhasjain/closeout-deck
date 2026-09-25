import { useEffect, useSyncExternalStore } from 'react'
import { dayLabels, runEngine, type Effect, type Facility, type RunShift, type Shift } from '@/bench/engine.js'
import { authedFetch } from '@/lib/api'
import { cycleLabel, cycleWeeks, recentCycles, type Cycle } from '@/lib/cycles'
import type { DeskCycle } from '@/lib/desk'
import { flushOnboarding, getOnboarding, updateOnboarding, type Onboarding } from '@/lib/onboarding'
import { viewerSession } from '@/lib/viewerSession'
import type { JourneyBatch, JourneyDecision, NextStep } from '@/lib/journey'

/** JSON wire types mirror the data service without importing Node modules into the app. */
export interface DataProvenance { file: string; sheet?: string; row: number; cols: Partial<Record<string, string>>; hoursOnly?: boolean; fileId?: string; sample?: boolean; system?: string }
export interface DataSite extends Facility { key: string; supervisor?: { name: string; role?: string } }
export interface DataGap { id: string; kind: string; key: string; count: number; example?: { file: string; row: number }; blocks: string[]; ask: string }
export interface FindingGroup { id?: number; ruleId: string; tag: string; title: string; summary: string; why: string; hoursLabel: string; amount: number; amountLabel: string; action: string; draft?: string; deadline: 'invoice' | 'payroll' | 'anytime'; sources: string[]; dispute: 'Client dispute' | 'Worker dispute' | 'Margin'; cases: number }
export interface FindingCase { shiftId: string; ruleId: string; seq: number; status: 'flag' | 'held' | 'applied'; note: string; effect?: Effect; delta: number; exposure: number | null; entryIds: string[]; worker: string; site: string; workDate: string }
export interface SourceRecord { id: string; set: 1 | 2 | 3; system: string; site: string | null; method: 'upload' | 'simulated'; sample: boolean; createdAt: string; lastReceivedAt: string | null }
export interface FileRecord {
  id: string; sourceId: string | null; mappingId: string | null; mappingAuthor?: 'library' | 'agent' | 'user' | null; name: string; mime: string; bytes: number; sha256: string; storagePath: string
  status: 'received' | 'needs_mapping' | 'normalized' | 'needs_extraction' | 'rejected'; fingerprint: string | null; setHint: 1 | 2 | 3 | null
  periodEnd: string | null; firstDate: string | null; lastDate: string | null; rowCount: number | null; entryCount: number | null
  unparsed: { row: number; reason: string }[]; sample: boolean; receivedAt: string; normalizedAt: string | null
}
export interface UploadedFile extends FileRecord { set: 1 | 2 | 3 | undefined; rows: number | null; entries: number | null; replaced: number; cycles: string[]; gaps: DataGap[] }
export interface TimeEntry {
  id: string; fileId: string; sourceId: string; set: 1 | 2 | 3; kind: 'work' | 'meal' | 'diff' | 'hours' | 'geo'
  worker: string; workerKey: string; workerExt: string | null; site: string; siteKey: string; role: string | null
  workDate: string; start: number | null; end: number | null; mealMin: number | null; minutes: number | null
  sched: [number, number] | null; payRate: number | null; billRate: number | null
  capture: 'clock' | 'web' | 'manual' | 'import' | 'location' | null; payCode: string | null; approvedBy: string | null
  edited: boolean | null; comment: string | null; dupOf: string | null; supersededBy: string | null; flags: string[]; prov: DataProvenance; sample: boolean
}
export interface FactInput { kind: 'site' | 'rate' | 'differential' | 'alias' | 'account'; key: string; value: Record<string, unknown> }
export interface CycleDates { id: string; start: string; end: string; cutoff: string; deadline: string; payDate: string; status: Cycle['status'] }
export interface CyclePayload {
  cycle: CycleDates; sample: boolean; runId: string | null; runAt: string | null; sites: DataSite[]
  decisions?: JourneyDecision[]; batch?: JourneyBatch | null; nextStep?: NextStep
  week: (Omit<Shift, 'fac'> & { fac: number; sample?: boolean; prov: DataProvenance; entryIds: string[] })[]
  results: Omit<RunShift, 'shift'>[]
  totals: { under: number; over: number; flags: number; held: number; gross: number; naive: number; shifts: number; workers: number }
  counts: { set1: number; set2: number; set3: number }; groups: FindingGroup[]; extraGroups: FindingGroup[]; gaps: DataGap[]
  intake: { sources: { id: string; name: string; short: string; set: 1 | 2 | 3; method: string; sample?: boolean; site?: string | null; lastReceived: string | null }[]; expected: { worker: string; client: string; day: number; source: string; onSite?: number }[]; received: string[] }
}
export interface CycleSummary extends CycleDates { sample: boolean; runAt: string | null; totals: CyclePayload['totals'] | null; counts: CyclePayload['counts']; findings: number }
export interface CycleList { cycles: CycleSummary[]; sources: SourceRecord[] }
export interface SampleResult { cycleId: string; files: string[]; entries: number; groups: FindingGroup[] }

export class DataError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code === 'duplicate_file' ? 'This file has already been uploaded.' : `The time entries could not be updated (${code}).`)
    this.status = status; this.code = code
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authedFetch(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new DataError(response.status, body.error ?? String(response.status))
  }
  return response.json() as Promise<T>
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export const getCycles = () => request<CycleList>('/data/cycles')
export const getCycle = (id: string) => request<CyclePayload>(`/data/cycles/${encodeURIComponent(id)}`)
export const getFiles = () => request<{ files: FileRecord[] }>('/files')
export const getFile = (id: string) => request<{ file: FileRecord; profile: string; mappingId: string | null }>(`/files/${encodeURIComponent(id)}`)
export function getEntries(cycle: string, options: { shift?: string; offset?: number } = {}) {
  const params = new URLSearchParams({ cycle })
  if (options.shift) params.set('shift', options.shift)
  if (options.offset !== undefined) params.set('offset', String(options.offset))
  return request<{ entries: TimeEntry[] }>(`/data/entries?${params}`)
}
export const getFindings = (cycle: string) => request<{ groups: FindingGroup[]; cases: FindingCase[] }>(`/data/findings?${new URLSearchParams({ cycle })}`)
async function mutated<T>(work: () => Promise<T>): Promise<T> {
  // The pipeline reads the canonical state doc, including this calendar.
  await flushOnboarding()
  const result = await work()
  updateOnboarding({ dataSource: 'server' })
  await invalidate()
  return result
}
export const seedSample = () => mutated(() => request<SampleResult>('/data/sample', { method: 'POST' }))
export const setFact = (fact: FactInput) => mutated(() => request<{ ok: true; cycles: string[] }>('/data/facts', json(fact)))
export const connectSource = (source: { set: 1 | 2 | 3; system?: string; site?: string }) => mutated(() => request<{ files: FileRecord[]; cycles: string[] }>('/data/connect', json(source)))
export function uploadFile(file: File, options: { set: 1 | 2; system?: string; site?: string; sourceId?: string }) {
  const headers = new Headers({ 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), 'X-Set': String(options.set) })
  if (options.system) headers.set('X-System', encodeURIComponent(options.system))
  if (options.site) headers.set('X-Site', encodeURIComponent(options.site))
  return mutated(() => request<{ file: UploadedFile }>('/files', { method: 'POST', headers, body: file }))
}

const date = (value: string) => new Date(`${value}T00:00:00`)
const restoreDates = (c: CycleDates): Cycle => ({ ...c, start: date(c.start), end: date(c.end), cutoff: date(c.cutoff), deadline: date(c.deadline), payDate: date(c.payDate) })
const statusTag = (cycle: Cycle, cal: Onboarding): DeskCycle['statusTag'] => cal.approvedCycles.includes(cycle.id) ? 'Approved' : cycle.status === 'in-progress' ? 'In Progress' : cycle.status === 'needs-review' ? 'Pending' : 'Paid'
const remembered = (cycle: Cycle, cal: Onboarding) => cal.customRules.filter(rule => rule.autoApply && !rule.draft && rule.sourceRuleId
  && (rule.effectiveCycleStart ? cycle.start >= date(rule.effectiveCycleStart) : cycle.status === 'in-progress')).map(rule => rule.sourceRuleId!)
const daysOf = (cycle: Cycle) => cycleWeeks(cycle).flatMap(dayLabels).slice(0, Math.round((Date.UTC(cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate()) - Date.UTC(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate())) / 86_400_000) + 1)
/** Keep the server's pay and rule rows; the extra engine pass restores callable context only. */
export function hydrate(payload: CyclePayload, cal: Onboarding, files: FileRecord[] = []): DeskCycle {
  if (payload.results.length !== payload.week.length) throw new Error('The time-entry results are incomplete.')
  const cycle = restoreDates(payload.cycle)
  const week = payload.week.map(shift => {
    const fac = payload.sites[shift.fac]
    if (!fac) throw new Error('The time-entry site could not be read.')
    const file = files.find(file => file.id === shift.prov.file)
    const source = payload.intake.sources.find(source => source.id === file?.sourceId)
    return { ...shift, fac, prov: { ...shift.prov, ...(file ? { fileId: file.id, file: file.name, sample: file.sample, system: source?.short ?? source?.name } : {}) } }
  })
  const ctx = runEngine(week).ctx
  return { ...cycle, week, run: { shifts: payload.results.map((result, i) => ({ ...result, shift: week[i] })), totals: payload.totals, ctx },
    days: daysOf(cycle), scripted: false, label: cycleLabel(cycle), statusTag: payload.batch ? 'Paid' : statusTag(cycle, cal), rememberedRuleIds: remembered(cycle, cal),
    decisions: payload.decisions, batch: payload.batch, nextStep: payload.nextStep,
    server: true, sample: payload.sample, sites: payload.sites, groups: payload.groups, extraGroups: payload.extraGroups, gaps: payload.gaps, intake: payload.intake,
  }
}
function emptyCycle(cycle: Cycle, cal: Onboarding): DeskCycle {
  return { ...cycle, week: [], run: runEngine([]), days: daysOf(cycle), scripted: false, label: cycleLabel(cycle), statusTag: statusTag(cycle, cal),
    server: true, sample: false, sites: [], groups: [], extraGroups: [], gaps: [], intake: { sources: [], expected: [], received: [] } }
}

export interface DataSnapshot { owner: string; loaded: boolean; loading: boolean; error: string | null; list: CycleSummary[]; sources: SourceRecord[]; files: FileRecord[]; payloads: CyclePayload[] }
const initial = (owner = ''): DataSnapshot => ({ owner, loaded: false, loading: false, error: null, list: [], sources: [], files: [], payloads: [] })
let snapshot = initial()
const listeners = new Set<() => void>()
const emit = (next: DataSnapshot) => { snapshot = next; listeners.forEach(listener => listener()) }
const owner = () => viewerSession()?.email ?? 'development'
let pending: Promise<void> | null = null
let pendingOwner = ''
let revision = 0
const cycleVersions = new Map<string, number>()
export const getDataSnapshot = () => snapshot
/** Mutation responses and chat cards publish into the same snapshot as Payroll. */
export function publishCycle(payload: CyclePayload, account = owner()) {
  if (owner() !== account) return
  if (snapshot.owner !== account) emit(initial(account))
  revision++
  const key = `${account}:${payload.cycle.id}`
  cycleVersions.set(key, (cycleVersions.get(key) ?? 0) + 1)
  const summary: CycleSummary = { ...payload.cycle, sample: payload.sample, runAt: payload.runAt, totals: payload.totals, counts: payload.counts, findings: payload.groups.length + payload.extraGroups.length }
  emit({ ...snapshot, error: null, payloads: [...snapshot.payloads.filter(item => item.cycle.id !== payload.cycle.id), payload],
    list: snapshot.list.some(item => item.id === payload.cycle.id) ? snapshot.list.map(item => item.id === payload.cycle.id ? summary : item) : [...snapshot.list, summary] })
}
const cycleRequests = new Map<string, Promise<void>>()
export function refreshCycle(id: string): Promise<void> {
  const account = owner(), key = `${account}:${id}`
  const pending = cycleRequests.get(key)
  if (pending) return pending
  const generation = cycleVersions.get(key) ?? 0
  const work = getCycle(id).then(payload => {
    if ((cycleVersions.get(key) ?? 0) === generation) publishCycle(payload, account)
  }).catch((cause: unknown) => {
    if (owner() === account && (cycleVersions.get(key) ?? 0) === generation) emit({ ...snapshot, error: cause instanceof Error ? cause.message : 'The cycle could not be loaded.' })
  }).finally(() => { cycleRequests.delete(key) })
  cycleRequests.set(key, work)
  return work
}
/** Refreshes atomically. Failed refreshes retain this account's last successful data and expose a retryable error. */
export async function invalidate(): Promise<void> {
  revision++
  return loadData()
}
export async function loadData(): Promise<void> {
  const account = owner()
  if (pending && pendingOwner === account) return pending
  if (snapshot.owner !== account) emit(initial(account))
  pendingOwner = account
  const work = (async () => {
    let generation: number
    do {
      generation = revision
      emit({ ...snapshot, loading: true, error: null })
      try {
        const [list, { files }] = await Promise.all([getCycles(), getFiles()])
        const payloads = await Promise.all(list.cycles.filter(cycle => cycle.runAt !== null).map(cycle => getCycle(cycle.id)))
        if (owner() !== account) return
        if (generation !== revision) continue
        for (const payload of payloads) {
          const key = `${account}:${payload.cycle.id}`
          cycleVersions.set(key, (cycleVersions.get(key) ?? 0) + 1)
        }
        emit({ owner: account, loaded: true, loading: false, error: null, list: list.cycles, sources: list.sources, files, payloads })
        if ((payloads.length || list.sources.length || files.length) && getOnboarding().dataSource !== 'server') updateOnboarding({ dataSource: 'server' })
      } catch (cause) {
        if (owner() !== account) return
        emit({ ...snapshot, loading: false, error: cause instanceof Error ? cause.message : 'Time entries could not be loaded.' })
      }
      // A mutation can finish while these GETs are in flight. Every waiter waits for
      // one more pass so an older snapshot cannot swallow its invalidation.
    } while (generation !== revision && owner() === account)
  })()
  pending = work
  await work
  if (pending === work) pending = null
}

export function useData(enabled = true): DataSnapshot {
  const value = useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener) }, getDataSnapshot, getDataSnapshot)
  const account = owner()
  useEffect(() => { if (enabled && (snapshot.owner !== account || (!snapshot.loaded && !snapshot.error))) void loadData() }, [enabled, account])
  return value.owner && value.owner !== account ? initial(account) : value
}
let cycleCache: { owner: string; snapshot: DataSnapshot; cal: Onboarding; cycles: DeskCycle[] } | undefined
export function serverCycles(cal: Onboarding): DeskCycle[] {
  if (cycleCache?.owner === owner() && cycleCache.snapshot === snapshot && cycleCache.cal === cal) return cycleCache.cycles
  const available = snapshot.owner === owner() ? snapshot : initial()
  const periods = available.list.length ? available.list.map(restoreDates) : recentCycles(cal, 26)
  const payloads = new Map(available.payloads.map(payload => [payload.cycle.id, payload]))
  const cycles = periods.filter(cycle => payloads.has(cycle.id) || cycle.status !== 'reviewed').map(cycle => {
    const payload = payloads.get(cycle.id)
    return payload ? hydrate({ ...payload, cycle: { ...payload.cycle, status: cycle.status } }, cal, available.files) : emptyCycle(cycle, cal)
  })
  if (!cycles.length) cycles.push(emptyCycle(recentCycles(cal, 1)[0], cal))
  cycleCache = { owner: owner(), snapshot, cal, cycles }
  return cycles
}
