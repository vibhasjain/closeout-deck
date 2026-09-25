import { useEffect, useSyncExternalStore } from 'react'
import { authedFetch } from '@/lib/api'
import { getCycle, getDataSnapshot, invalidate, publishCycle, refreshCycle, useData, type CyclePayload, type FindingGroup } from '@/lib/data'
import { viewerSession } from '@/lib/viewerSession'
import { flushOnboarding } from '@/lib/onboarding'

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

export function useJourneyCycle(cycleId: string) {
  const data = useData()
  const cycle = data.payloads.find(item => item.cycle.id === cycleId)
  const running = !cycle?.runAt
  const owner = account()
  useEffect(() => {
    if (!cycle || running) void refreshCycle(cycleId)
    if (!running) return
    // Poll server progress; time never changes the task's Running/Done state.
    const poll = window.setInterval(() => { void refreshCycle(cycleId) }, 2000)
    return () => window.clearInterval(poll)
  }, [cycleId, owner, running, !!cycle]) // eslint-disable-line react-hooks/exhaustive-deps -- depend on presence, not each server snapshot
  return { cycle, loading: !cycle && !data.error, error: data.error }
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
  if (account() === owner) await invalidate()
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
  const response = await transport(`${cyclePath(cycleId)}/send`, input)
  if (response.status === 409 || response.status === 422) {
    const body = await response.json()
    await invalidate()
    return { ...body, status: response.status } as SendResult
  }
  const body = await read<{ batch: JourneyBatch; csvUrl: string }>(response)
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
