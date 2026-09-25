import { useEffect, useState, useSyncExternalStore } from 'react'
import { authedFetch } from '@/lib/api'
import { getCycle, getDataSnapshot, invalidate, onDataInvalidated, publishCycle, refreshCycle, refreshCycleList, useData, type CyclePayload, type CycleReadResult, type DataSnapshot, type FindingGroup } from '@/lib/data'
import { viewerSession } from '@/lib/viewerSession'
import { flushOnboarding } from '@/lib/onboarding'
import { scheduleMemoryRefresh } from '@/lib/memory'
import { ownsRun, pipelineRunning, usePipeline } from '@/lib/pipeline'

export type JourneyFormName = 'connect' | 'gaps' | 'send' | 'dispute'
export interface NextStep {
  kind: 'get_timesheets' | 'chase_missing' | 'review' | 'send' | 'done'
  label: string; detail: string
  counts: { missingSets: number; gaps: number; openGroups: number }
}
export interface JourneyDecision {
  id: string; cycleId: string; groupId: string; shiftIds: string[]
  decision: 'approved' | 'dismissed' | 'escalated'; reason: string | null; by: 'user' | 'agent'; at: string
}
export interface JourneyBatch {
  id: string; cycleId: string; destination: string; workers: number; gross: number; held: number; csvPath?: string; createdAt: string
}
export interface JourneyMessage {
  id: string; threadId: string; dir: 'out' | 'in' | 'note'; text: string; status: 'draft' | 'not_sent_demo' | 'recorded'; at: string
}
export interface JourneyThread {
  id: string; cycleId: string; shiftId?: string | null; disputeId?: string | null
  counterparty: { kind: 'worker' | 'site'; name: string; contact?: string; gapIds?: string[] }
  status: 'open' | 'waiting' | 'resolved'; createdAt: string; messages: JourneyMessage[]
}
export interface JourneyDispute {
  id: string; cycleId: string; worker: string; description: string; source: 'paste' | 'upload' | 'simulated'
  status: 'open' | 'adjusted' | 'rejected'; adjustment?: { hours: number; amount: number; next_cycle_id: string } | null; createdAt: string
}
export type DecisionInput = { groupId: string; decision: JourneyDecision['decision']; reason?: string; shiftIds?: string[] }
export type SendResult = { status: 201; batch: JourneyBatch; csvUrl: string } | { status: 409; batch: JourneyBatch } | { status: 422; reason: string; nextStep?: NextStep; open?: { missingSets: number[]; gaps: string[]; groups: string[] }; openItems?: unknown[] }
/** Use the stable rule identity everywhere; numeric display aliases must not create a second decision. */
export const groupId = (group: Pick<FindingGroup, 'id' | 'ruleId'>) => group.ruleId
const account = () => viewerSession()?.email ?? 'development'
const cyclePath = (id: string) => `/data/cycles/${encodeURIComponent(id)}`
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export class JourneyError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
async function read<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { reason?: string; error?: string }
  if (!response.ok) throw new JourneyError(response.status, body.reason ?? body.error ?? `The request could not be completed (${response.status}).`)
  return body
}
async function transport(path: string, body?: unknown) {
  const owner = account()
  // Server recomputation reads the canonical rules, never-contact list and payroll profile.
  if (body !== undefined) await flushOnboarding()
  if (owner !== account()) throw new JourneyError(409, 'The account changed. Reopen this cycle and try again.')
  const response = await authedFetch(path, body === undefined ? undefined : json(body))
  if (owner !== account()) throw new JourneyError(409, 'The account changed. Reopen this cycle and try again.')
  return response
}
const request = async <T>(path: string, body?: unknown) => read<T>(await transport(path, body))

/** Wait for server progress with bounded backoff; fresh intake wakes a sleeping card. */
export function watchJourneyCycle(cycleId: string, receive: (result: CycleReadResult) => void) {
  let stopped = false, pending = false, again = false, attempt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const poll = async () => {
    if (stopped) return
    if (pending) { again = true; return }
    pending = true
    const result = await refreshCycle(cycleId)
    pending = false
    if (stopped) return
    receive(result)
    if (again) { again = false; void poll(); return }
    // Only a failed read retries on a timer. No data yet (empty) waits for the next invalidation.
    if (result.state === 'error' || result.state === 'running' || pipelineRunning(cycleId)) timer = setTimeout(() => { void poll() }, Math.min(2000 * 2 ** Math.min(attempt++, 4), 30000))
  }
  const unsubscribe = onDataInvalidated(() => {
    clearTimeout(timer)
    attempt = 0
    const data = getDataSnapshot()
    if (!pipelineRunning(cycleId) && data.owner === account() && data.payloads.some(item => item.cycle.id === cycleId && item.runAt)) receive({ state: 'done', error: null })
    else void poll()
  })
  void poll()
  return () => { stopped = true; clearTimeout(timer); unsubscribe() }
}

/** What a card knows from the shared list: fetch a cycle's detail only when the list says it has a run we don't hold. */
export function journeyRead(data: Pick<DataSnapshot, 'loaded' | 'list' | 'payloads'>, cycleId: string) {
  const cycle = data.payloads.find(item => item.cycle.id === cycleId)
  const row = data.list.find(item => item.id === cycleId)
  // N8: a row with pending adjustments has journey state to read even before it has a run.
  const pending = !cycle && !!row?.adjustments
  return { cycle, row, running: (!cycle?.runAt && !!row?.runAt) || pending, empty: data.loaded && !cycle?.runAt && !row?.runAt && !pending }
}

/** `card`: the task card's message id; a pipeline run shows only on the card it posted. */
export function useJourneyCycle(cycleId: string, card?: string) {
  const data = useData()
  const { cycle, row, running: reading, empty } = journeyRead(data, cycleId)
  const pipeline = usePipeline(cycleId)
  const ours = ownsRun(pipeline, card)
  const piped = ours && pipeline.running
  const running = reading || piped
  const owner = account()
  const key = `${owner}:${cycleId}`
  const [read, setRead] = useState<{ key: string; result: CycleReadResult } | null>(null)
  useEffect(() => {
    if (!running) return
    return watchJourneyCycle(cycleId, result => setRead({ key, result }))
  }, [cycleId, key, running])
  const current = read?.key === key ? read.result : undefined
  const none = !piped && (empty || current?.state === 'empty')
  return { cycle, row, running: running && !none, pipelineRunning: piped, empty: none, loading: !cycle && !none && !current, error: (ours ? pipeline.error : null) ?? (running && current ? current.error : data.cycleErrors[cycleId] ?? null) }
}

export async function decide(cycleId: string, input: DecisionInput) {
  const owner = account()
  const data = getDataSnapshot()
  const cycle = (data.owner === owner ? data.payloads.find(item => item.cycle.id === cycleId) : undefined)
    ?? (/^\d+$/.test(input.groupId) ? await getCycle(cycleId) : undefined)
  if (owner !== account()) throw new JourneyError(409, 'The account changed. Reopen this cycle and try again.')
  const group = [...(cycle?.groups ?? []), ...(cycle?.extraGroups ?? [])].find(item => item.ruleId === input.groupId || String(item.id) === input.groupId)
  const result = await request<{ decision: JourneyDecision; cycle: CyclePayload }>(`${cyclePath(cycleId)}/decisions`, { ...input, groupId: group?.ruleId ?? input.groupId })
  publishCycle(result.cycle, owner)
  if (account() === owner) await refreshCycleList()
  return result
}

interface ThreadsSnapshot { threads: JourneyThread[]; loading: boolean; loaded: boolean; error: string | null }
const emptyThreads: ThreadsSnapshot = { threads: [], loading: false, loaded: false, error: null }
const threadSnapshots = new Map<string, ThreadsSnapshot>()
const threadRequests = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const threadKey = (cycleId: string) => `${account()}:${cycleId}`
function publishThreads(key: string, value: ThreadsSnapshot) { threadSnapshots.set(key, value); listeners.forEach(listener => listener()) }
export const getThreads = (cycleId: string) => request<{ threads: JourneyThread[] }>(`/data/threads?${new URLSearchParams({ cycleId })}`)
export function refreshThreads(cycleId: string): Promise<void> {
  const key = threadKey(cycleId)
  const pending = threadRequests.get(key)
  if (pending) return pending.then(() => refreshThreads(cycleId))
  publishThreads(key, { ...(threadSnapshots.get(key) ?? emptyThreads), loading: true, error: null })
  const work = getThreads(cycleId).then(({ threads }) => {
    publishThreads(key, { threads, loading: false, loaded: true, error: null })
  }).catch((cause: unknown) => {
    publishThreads(key, { ...(threadSnapshots.get(key) ?? emptyThreads), loading: false, loaded: true, error: cause instanceof Error ? cause.message : 'The conversation could not be loaded.' })
  }).finally(() => { threadRequests.delete(key) })
  threadRequests.set(key, work)
  return work
}
export function useJourneyThreads(cycleId: string) {
  const key = threadKey(cycleId)
  const value = useSyncExternalStore(subscribe, () => threadSnapshots.get(key) ?? emptyThreads, () => threadSnapshots.get(key) ?? emptyThreads)
  useEffect(() => { if (cycleId && !threadSnapshots.get(key)?.loaded && !threadRequests.has(key)) void refreshThreads(cycleId) }, [cycleId, key])
  return value
}
export async function askGaps(cycleId: string, input: { gapIds: string[]; message?: string }) {
  const result = await request<{ threads: JourneyThread[]; skipped: string[] }>(`${cyclePath(cycleId)}/asks`, input)
  await Promise.all([invalidate(), refreshThreads(cycleId)])
  return { ...result, skipped: result.skipped ?? [] }
}
export async function recordMessage(threadId: string, input: { dir: JourneyMessage['dir']; text: string }) {
  const result = await request<{ message: JourneyMessage; thread?: JourneyThread }>(`/data/threads/${encodeURIComponent(threadId)}/messages`, input)
  const owner = account()
  const affected = [...threadSnapshots].filter(([key, value]) => key.startsWith(`${owner}:`) && value.threads.some(thread => thread.id === threadId))
  const cycles = new Set(affected.map(([key]) => key.slice(owner.length + 1)))
  if (result.thread?.cycleId) cycles.add(result.thread.cycleId)
  await Promise.all([invalidate(), ...[...cycles].map(cycleId => refreshThreads(cycleId))])
  return result
}
export async function sendPayroll(cycleId: string, input: { destination?: string } = {}): Promise<SendResult> {
  const owner = account()
  const response = await transport(`${cyclePath(cycleId)}/send`, input)
  if (response.status === 409 || response.status === 422) {
    const body = await response.json()
    await invalidate()
    return { ...body, status: response.status } as SendResult
  }
  const body = await read<{ batch: JourneyBatch; csvUrl: string }>(response)
  if (response.status === 201) scheduleMemoryRefresh(owner)
  await invalidate()
  return { status: 201, ...body }
}
/** CSV requests carry the session bearer; a plain anchor cannot authenticate. */
export async function downloadBatch(batchId: string, csvUrl?: string): Promise<void> {
  // The returned URL may be relative or signed; use the canonical bearer-protected route.
  void csvUrl
  const response = await authedFetch(`/data/batches/${encodeURIComponent(batchId)}/csv`)
  if (!response.ok) throw new JourneyError(response.status, 'The CSV could not be downloaded. Try again.')
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url; link.download = `payroll-${batchId}.csv`; document.body.append(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const getDisputes = () => request<{ disputes: JourneyDispute[] }>('/data/disputes')
export async function createDispute(input: { cycleId: string; worker: string; description: string; source: JourneyDispute['source'] }) {
  const result = await request<{ dispute: JourneyDispute; thread: JourneyThread }>('/data/disputes', input)
  await Promise.all([invalidate(), refreshThreads(input.cycleId)])
  return result
}
export async function simulateDispute(cycleId: string) {
  const result = await request<{ dispute: JourneyDispute; thread: JourneyThread }>('/data/disputes/simulate', { cycleId })
  await Promise.all([invalidate(), refreshThreads(cycleId)])
  return result
}
export async function resolveDispute(id: string, input: { decision: 'adjust' | 'reject'; hours?: number; amount?: number; note: string }) {
  const result = await request<{ dispute: JourneyDispute; thread?: JourneyThread }>(`/data/disputes/${encodeURIComponent(id)}/resolve`, input)
  await Promise.all([invalidate(), refreshThreads(result.dispute.cycleId)])
  return result
}
