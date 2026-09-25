import { useEffect, useSyncExternalStore } from 'react'
import { authedFetch } from '@/lib/api'
import { viewerSession } from '@/lib/viewerSession'

export type MemoryKind = 'context' | 'autonomy' | 'style'
export type MemorySource = 'site' | 'call' | 'chat' | 'decisions' | 'send' | 'user'
export interface Instinct {
  id: string; kind: MemoryKind; text: string; source: MemorySource
  status: 'pending' | 'active' | 'forgotten' | 'replaced'
  until: string | null; ruleId: string | null; at: string
}
export interface MemoryProposal { ruleId: string; count: number; cycles: number; topReason: string }
export interface MemorySnapshot {
  instincts: Instinct[]; proposals: MemoryProposal[]
  lastRun: { trigger: 'site' | 'call' | 'send' | 'chat'; finishedAt: string; applied: number; dropped: number } | null
}
export interface CreateInstinct {
  kind: MemoryKind; text: string; source: 'chat' | 'user' | 'decisions'
  until?: string | null; ruleId?: string; status?: 'pending' | 'active'
}
export interface EditInstinct { text?: string; until?: string | null; status?: 'active' }
export type MemoryConflict = 'duplicate' | 'tombstone'
export class MemoryError extends Error {
  status: number
  reason: MemoryConflict | undefined
  constructor(status: number, reason?: MemoryConflict, message?: string) {
    super(message ?? (reason === 'duplicate' ? 'Already known' : reason === 'tombstone' ? 'You asked me to forget this' : 'Memory could not be updated. Try again.'))
    this.name = 'MemoryError'; this.status = status; this.reason = reason
  }
}

const account = () => viewerSession()?.email ?? 'development'
const empty: MemorySnapshot = { instincts: [], proposals: [], lastRun: null }
/** `readAt`: when the applied read was issued. A row created after it cannot be in the snapshot yet. */
interface MemoryState { snapshot: MemorySnapshot; loading: boolean; loaded: boolean; readAt: number; error: string | null }
const initial: MemoryState = { snapshot: empty, loading: false, loaded: false, readAt: 0, error: null }
const states = new Map<string, MemoryState>()
const revisions = new Map<string, number>()
const requests = new Map<string, Promise<void>>()
// A forgotten id is terminal on the server. Keep it terminal when older HTTP responses arrive later too.
const tombstones = new Map<string, Map<string, Instinct>>()
const listeners = new Set<() => void>()
export const subscribeMemory = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const state = (owner: string) => states.get(owner) ?? initial
function publish(owner: string, value: MemoryState) { states.set(owner, value); listeners.forEach(listener => listener()) }
export const getMemorySnapshot = () => state(account()).snapshot
/** True only when this client saw the server confirm the Forget; absence from a read is not proof. */
export const isForgotten = (id: string) => !!tombstones.get(account())?.has(id)
const changedAccount = () => new MemoryError(409, undefined, 'The account changed. Reopen memory and try again.')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const owner = account()
  // authedFetch supplies API_BASE and the current session bearer, as it does for journey requests.
  const response = await authedFetch(path, init)
  const body = await response.json().catch(() => ({})) as T & { reason?: string }
  if (owner !== account()) throw changedAccount()
  if (!response.ok) {
    const reason = body.reason === 'duplicate' || body.reason === 'tombstone' ? body.reason : undefined
    throw new MemoryError(response.status, reason)
  }
  return body
}
const json = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const instinctPath = (id: string) => `/memory/instincts/${encodeURIComponent(id)}`
export const getMemory = () => request<MemorySnapshot>('/memory')

/** Shared across Rules, chat and the desk; an old read cannot undo a later Keep or Forget. */
export function refreshMemory(): Promise<void> {
  const owner = account(), pending = requests.get(owner)
  if (pending) return pending
  const revision = revisions.get(owner) ?? 0, readAt = Date.now()
  publish(owner, { ...state(owner), loading: true, error: null })
  let stale = false
  const work = getMemory().then(snapshot => {
    if (owner !== account()) return
    stale = revision !== (revisions.get(owner) ?? 0)
    if (!stale) publish(owner, { snapshot: { ...snapshot, instincts: snapshot.instincts.filter(row => !tombstones.get(owner)?.has(row.id)) }, loading: false, loaded: true, readAt, error: null })
  }).catch((cause: unknown) => {
    if (owner === account()) publish(owner, { ...state(owner), loading: false, error: cause instanceof Error ? cause.message : 'Memory could not be loaded. Try again.' })
  }).finally(() => {
    requests.delete(owner)
    if (owner !== account()) states.delete(owner)
    else if (stale) void refreshMemory()
  })
  requests.set(owner, work)
  return work
}

async function mutate(path: string, init: RequestInit, proposalRuleId?: string): Promise<Instinct> {
  const owner = account()
  const result = await request<{ instinct: Instinct }>(path, init)
  if (owner !== account()) throw changedAccount()
  if (result.instinct.status === 'forgotten') {
    const forgotten = tombstones.get(owner) ?? new Map<string, Instinct>()
    forgotten.set(result.instinct.id, result.instinct)
    tombstones.set(owner, forgotten)
  }
  const instinct = tombstones.get(owner)?.get(result.instinct.id) ?? result.instinct
  const current = state(owner)
  const instincts = current.snapshot.instincts.filter(row => row.id !== instinct.id)
  if (instinct.status === 'active' || instinct.status === 'pending') instincts.push(instinct)
  instincts.sort((a, b) => b.at.localeCompare(a.at))
  revisions.set(owner, (revisions.get(owner) ?? 0) + 1)
  publish(owner, { ...current, error: null, snapshot: { ...current.snapshot, instincts,
    proposals: current.snapshot.proposals.filter(proposal => proposal.ruleId !== proposalRuleId) } })
  return instinct
}
export const createInstinct = (input: CreateInstinct) => mutate('/memory/instincts', json('POST', input))
export const editInstinct = (id: string, patch: EditInstinct) => mutate(instinctPath(id), json('PATCH', patch))
export const keepInstinct = (id: string) => editInstinct(id, { status: 'active' })
export const forgetInstinct = (id: string) => mutate(`${instinctPath(id)}/forget`, { method: 'POST' })
export const keepProposal = (ruleId: string) => mutate(`/memory/proposals/${encodeURIComponent(ruleId)}/keep`, { method: 'POST' }, ruleId)
export const dismissProposal = (ruleId: string) => mutate(`/memory/proposals/${encodeURIComponent(ruleId)}/dismiss`, { method: 'POST' }, ruleId)

/** Mount and focus refreshes share one in-flight request even when several panes are open. */
export function watchMemory(): () => void {
  const focus = () => { void refreshMemory() }
  void refreshMemory()
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('focus', focus)
  return () => window.removeEventListener('focus', focus)
}
export function useMemory() {
  const owner = account()
  const value = useSyncExternalStore(subscribeMemory, () => state(account()), () => state(account()))
  useEffect(() => watchMemory(), [owner])
  return { ...value, refresh: refreshMemory }
}

/** Consolidation outlives its initiating pane; both reads still run with Rules unmounted. */
export function scheduleMemoryRefresh(owner = account()): void {
  for (const delay of [5000, 30000]) setTimeout(() => { if (owner === account()) void refreshMemory() }, delay)
}
