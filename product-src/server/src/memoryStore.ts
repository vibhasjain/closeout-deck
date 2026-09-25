import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dataFailure } from './datastore.ts'
import { RULES } from '../../src/bench/engine.js'
import type { Decision } from './journey.ts'
import { isPlainObject } from './validation.ts'

/** P9 memory (migration 0005). An instinct changes what the Closeout Agent says, suggests or asks. */
export const KINDS = ['context', 'autonomy', 'style'] as const
export type Kind = typeof KINDS[number]
export type Source = 'site' | 'call' | 'chat' | 'decisions' | 'send' | 'user'
export type Status = 'pending' | 'active' | 'forgotten' | 'replaced'
export type Trigger = 'site' | 'call' | 'send' | 'chat'
export const TRIGGERS: readonly Trigger[] = ['site', 'call', 'send', 'chat']
export interface InstinctRow {
  id: string; kind: Kind; text: string; source: Source; status: Status
  until: string | null; ruleId: string | null; replacedBy: string | null; at: string; updatedAt: string
}
export type Instinct = Pick<InstinctRow, 'id' | 'kind' | 'text' | 'source' | 'status' | 'until' | 'ruleId' | 'at'>
export interface Dropped { op: unknown; reason: string }
export interface MemoryRun {
  id: string; trigger: Trigger; ref: string | null; startedAt: string; finishedAt: string | null
  ops: unknown[]; dropped: Dropped[]; error: string | null
}
export interface Proposal { ruleId: string; count: number; cycles: number; topReason: string }

export const MAX_TEXT = 280
export const MAX_OPS = 20
export const ACTIVE_CAP = 60
export const RULE_IDS = new Set<string>(RULES.map(rule => rule.id))
export const newInstinctId = () => `i_${randomBytes(8).toString('hex')}`
export const live = (row: InstinctRow) => row.status === 'active' || row.status === 'pending'
export const publicInstinct = ({ id, kind, text, source, status, until, ruleId, at }: InstinctRow): Instinct => ({ id, kind, text, source, status, until, ruleId, at })

/** Tombstone and duplicate matching: lowercase, punctuation stripped, whitespace collapsed. */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\p{P}+/gu, '').replace(/\s+/g, ' ').trim()
}

/** One fact on one line: control characters and whitespace runs become single spaces. Null when empty or too long. */
export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()
  return text && text.length <= MAX_TEXT ? text : null
}

/** A real calendar date that is not before the account's own today (YYYY-MM-DD), the same day the one-pager renders against. */
export function validUntil(value: unknown, today: string): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= today
}
/** Only a canonical engine rule id links an instinct to a rule. */
export const validRuleId = (value: unknown): value is string => typeof value === 'string' && RULE_IDS.has(value)
/** Trusted provenance decides confirmation: only what the user said (a call, chat) is active; anything inferred waits for Keep. */
export const saidByUser = (sources: readonly Source[]) => sources.every(source => source === 'call' || source === 'chat')

/** Why a new or edited text may not be stored: the user forgot it, or it is already known. */
export function textConflict(text: string, rows: InstinctRow[], except?: string): 'tombstone' | 'duplicate' | null {
  const key = normalizeText(text)
  if (rows.some(row => row.status === 'forgotten' && normalizeText(row.text) === key)) return 'tombstone'
  if (rows.some(row => row.id !== except && live(row) && normalizeText(row.text) === key)) return 'duplicate'
  return null
}

export type PlannedOp =
  | { op: 'add'; row: InstinctRow }
  | { op: 'replace'; id: string; row: InstinctRow; merged: boolean }
  | { op: 'expire'; id: string }

/**
 * Validate a consolidation's ops in order against the account's rows, as each earlier op would leave them.
 * Pure: nothing is written. Every bad op is dropped with a reason.
 */
export function planOps(raw: unknown[], rows: InstinctRow[], run: { sources: Source[]; today: string; now?: Date }): { plan: PlannedOp[]; dropped: Dropped[] } {
  const now = run.now ?? new Date(), at = now.toISOString()
  const state = rows.map(row => ({ ...row }))
  const plan: PlannedOp[] = [], dropped: Dropped[] = [], touched = new Set<string>()
  const drop = (op: unknown, reason: string) => { dropped.push({ op: small(op), reason }) }
  raw.forEach((op, index) => {
    if (index >= MAX_OPS) return drop(op, 'too_many_ops')
    if (!isPlainObject(op) || !['add', 'replace', 'expire'].includes(op.op as string)) return drop(op, 'invalid_op')
    if (op.op === 'expire' || op.op === 'replace') {
      const target = typeof op.id === 'string' ? state.find(row => row.id === op.id && live(row)) : undefined
      if (!target) return drop(op, 'unknown_id')
      // One run never builds on a row and then undoes it: a row an earlier op replaced or merged into is off limits.
      if (touched.has(target.id)) return drop(op, 'conflict')
      if (op.op === 'expire') {
        target.status = 'forgotten'
        touched.add(target.id)
        plan.push({ op: 'expire', id: target.id })
        return
      }
    }
    const text = cleanText(op.text)
    if (!text) return drop(op, 'invalid_text')
    if (op.until !== undefined && op.until !== null && !validUntil(op.until, run.today)) return drop(op, 'invalid_until')
    const until = typeof op.until === 'string' ? op.until : null
    // A merged follow-up run may label which trigger an op came from (a label only: it never decides status).
    const source = run.sources.includes(op.source as Source) ? op.source as Source : run.sources[0]
    if (op.op === 'replace') {
      const target = state.find(row => row.id === op.id)!
      if (textConflict(text, state, target.id) === 'tombstone') return drop(op, 'tombstone')
      // Replacing into a text another live instinct already holds merges into that one (never demoting an active fact)
      // instead of duplicating it. Otherwise the new row keeps the old row's kind, status and rule; the store re-checks atomically.
      const key = normalizeText(text), same = state.find(row => row.id !== target.id && live(row) && normalizeText(row.text) === key)
      const row: InstinctRow = same ? { ...same, status: same.status === 'active' || target.status === 'active' ? 'active' : 'pending', updatedAt: at }
        : { ...target, id: newInstinctId(), text, until, source, replacedBy: null, at, updatedAt: at }
      target.status = 'replaced'; target.replacedBy = row.id
      if (same) Object.assign(same, row); else state.push(row)
      touched.add(target.id).add(row.id)
      plan.push({ op: 'replace', id: target.id, row, merged: Boolean(same) })
      return
    }
    if (!KINDS.includes(op.kind as Kind)) return drop(op, 'invalid_kind')
    if (op.ruleId !== undefined && op.ruleId !== null && !validRuleId(op.ruleId)) return drop(op, 'invalid_rule')
    // The model's status is ignored: an add is active only when every trigger of this run is something the user said.
    const status: Status = saidByUser(run.sources) ? 'active' : 'pending'
    const conflict = textConflict(text, state)
    if (conflict) return drop(op, conflict)
    if (state.filter(row => row.status === 'active').length >= ACTIVE_CAP) return drop(op, 'cap')
    const row: InstinctRow = { id: newInstinctId(), kind: op.kind as Kind, text, source, status, until,
      ruleId: typeof op.ruleId === 'string' ? op.ruleId : null, replacedBy: null, at, updatedAt: at }
    state.push(row)
    plan.push({ op: 'add', row })
  })
  return { plan, dropped }
}

/** A dropped op is kept for the run log, bounded. */
function small(op: unknown): unknown {
  let json: string | undefined
  try { json = JSON.stringify(op) } catch { /* unserializable */ }
  return json === undefined ? String(op) : json.length > 2_000 ? json.slice(0, 2_000) : op
}

/**
 * Suggested rules, computed on read: an engine rule dismissed at least 3 times across at least 2 cycles.
 * A rule with any source:'decisions' instinct (kept or forgotten) is never proposed again.
 * ponytail: legacy numeric group aliases are skipped; P7 canonicalizes them to rule ids on every cycle read.
 */
export function proposals(decisions: Decision[], rows: InstinctRow[]): Proposal[] {
  const decided = new Set(rows.filter(row => row.source === 'decisions' && row.ruleId).map(row => row.ruleId))
  const byRule = new Map<string, Decision[]>()
  for (const d of decisions) {
    if (d.decision !== 'dismissed' || !RULE_IDS.has(d.groupId) || decided.has(d.groupId)) continue
    byRule.set(d.groupId, [...byRule.get(d.groupId) ?? [], d])
  }
  const result: Proposal[] = []
  for (const [ruleId, list] of byRule) {
    const cycles = new Set(list.map(d => d.cycleId)).size
    if (list.length < 3 || cycles < 2) continue
    // The most frequent reason; a tie goes to the most recent.
    const reasons = new Map<string, { count: number; at: string }>()
    for (const d of list) {
      const reason = (d.reason ?? '').trim()
      if (!reason) continue
      const seen = reasons.get(reason)
      reasons.set(reason, { count: (seen?.count ?? 0) + 1, at: !seen || d.at > seen.at ? d.at : seen.at })
    }
    const [topReason = ''] = [...reasons].sort((a, b) => b[1].count - a[1].count || b[1].at.localeCompare(a[1].at)).map(([reason]) => reason)
    result.push({ ruleId, count: list.length, cycles, topReason })
  }
  return result.sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId))
}

export function proposalText(proposal: Proposal): string {
  const text = `Usually dismisses ${proposal.ruleId} findings${proposal.topReason ? `; most often: ${proposal.topReason}` : ''}`.replace(/\s+/g, ' ')
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + '…' : text
}

export interface MemoryStore {
  /** Every instinct of the account, any status. */
  listInstincts(email: string): Promise<InstinctRow[]>
  insertInstinct(email: string, row: InstinctRow): Promise<void>
  /** Compare-and-set: updates only while the row is in one of `from`; null when it is not. */
  updateInstinct(email: string, id: string, patch: Partial<Omit<InstinctRow, 'id'>>, from: Status[]): Promise<InstinctRow | null>
  /**
   * The replace pair, atomically: false (nothing written) unless the old row is this account's and active or pending.
   * When row.id is already a live instinct the old row merges into it (active if either was); otherwise row is inserted with the old status.
   */
  replaceInstinct(email: string, oldId: string, row: InstinctRow): Promise<boolean>
  saveRun(email: string, run: MemoryRun): Promise<void>
  /** The most recent runs, newest first; optionally only runs whose recorded trigger is one of `triggers`. */
  listRuns(email: string, limit?: number, triggers?: Trigger[]): Promise<MemoryRun[]>
}

const clone = <T>(value: T): T => structuredClone(value)

export function createMemoryMemoryStore(): MemoryStore {
  const instincts = new Map<string, InstinctRow[]>(), runs = new Map<string, MemoryRun[]>()
  const rows = (email: string) => { let list = instincts.get(email); if (!list) instincts.set(email, list = []); return list }
  return {
    async listInstincts(email) { return clone(rows(email)) },
    async insertInstinct(email, row) {
      if ([...instincts.values()].some(list => list.some(old => old.id === row.id))) throw new Error('memory_instincts_write_failed')
      rows(email).push(clone(row))
    },
    async updateInstinct(email, id, patch, from) {
      const row = rows(email).find(item => item.id === id && from.includes(item.status))
      if (!row) return null
      Object.assign(row, clone(patch))
      return clone(row)
    },
    async replaceInstinct(email, oldId, row) {
      const list = rows(email), old = list.find(item => item.id === oldId && live(item)), same = list.find(item => item.id === row.id)
      if (!old || (same && !live(same))) return false
      const now = new Date().toISOString()
      if (same) { if (old.status === 'active') same.status = 'active'; same.updatedAt = now }
      else list.push(clone({ ...row, status: old.status }))
      old.status = 'replaced'; old.replacedBy = row.id; old.updatedAt = now
      return true
    },
    async saveRun(email, run) {
      const list = runs.get(email) ?? [], index = list.findIndex(item => item.id === run.id)
      if (index >= 0) list[index] = clone(run); else list.push(clone(run))
      runs.set(email, list)
    },
    async listRuns(email, limit = 10, triggers) {
      return clone([...runs.get(email) ?? []].filter(run => !triggers || triggers.includes(run.trigger)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit))
    },
  }
}

type Row = Record<string, unknown>
const iso = (value: unknown) => value == null ? null : new Date(String(value)).toISOString()
const fromRow = (row: Row): InstinctRow => ({ id: String(row.id), kind: row.kind as Kind, text: String(row.text), source: row.source as Source,
  status: row.status as Status, until: row.until == null ? null : String(row.until), ruleId: row.rule_id == null ? null : String(row.rule_id),
  replacedBy: row.replaced_by == null ? null : String(row.replaced_by), at: iso(row.at)!, updatedAt: iso(row.updated_at)! })
const toRow = (email: string, row: Partial<InstinctRow>): Row => {
  const names: Record<string, string> = { ruleId: 'rule_id', replacedBy: 'replaced_by', updatedAt: 'updated_at' }
  return { ...Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined).map(([key, value]) => [names[key] ?? key, value])), email }
}

export function createMemoryStore(client: SupabaseClient): MemoryStore {
  const instincts = () => client.from('closeout_instincts'), runs = () => client.from('closeout_memory_runs')
  return {
    async listInstincts(email) {
      const rows: InstinctRow[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await instincts().select('*').eq('email', email).order('at').order('id').range(offset, offset + 999)
        if (error) throw dataFailure('memory_instincts_read_failed', error)
        rows.push(...(data as Row[]).map(fromRow))
        if (data.length < 1000) return rows
      }
    },
    async insertInstinct(email, row) {
      const { error } = await instincts().insert(toRow(email, row))
      if (error) throw dataFailure('memory_instincts_write_failed', error)
    },
    async updateInstinct(email, id, patch, from) {
      const { data, error } = await instincts().update(toRow(email, patch)).eq('email', email).eq('id', id).in('status', from).select('*').maybeSingle()
      if (error) throw dataFailure('memory_instincts_write_failed', error)
      return data ? fromRow(data as Row) : null
    },
    async replaceInstinct(email, oldId, row) {
      const { data, error } = await client.rpc('closeout_replace_instinct', { p_email: email, p_old_id: oldId, p_new: toRow(email, row) })
      if (error) throw dataFailure('memory_instincts_write_failed', error)
      return data === true
    },
    async saveRun(email, run) {
      const { error } = await runs().upsert({ id: run.id, email, trigger: run.trigger, ref: run.ref, started_at: run.startedAt,
        finished_at: run.finishedAt, ops: run.ops, dropped: run.dropped, error: run.error }, { onConflict: 'id' })
      if (error) throw dataFailure('memory_runs_write_failed', error)
    },
    async listRuns(email, limit = 10, triggers) {
      let request = runs().select('*').eq('email', email)
      if (triggers) request = request.in('trigger', triggers)
      const { data, error } = await request.order('started_at', { ascending: false }).limit(limit)
      if (error) throw dataFailure('memory_runs_read_failed', error)
      return (data as Row[]).map(row => ({ id: String(row.id), trigger: row.trigger as Trigger, ref: row.ref == null ? null : String(row.ref),
        startedAt: iso(row.started_at)!, finishedAt: iso(row.finished_at), ops: Array.isArray(row.ops) ? row.ops : [],
        dropped: Array.isArray(row.dropped) ? row.dropped as Dropped[] : [], error: row.error == null ? null : String(row.error) }))
    },
  }
}

export function memoryStoreFromEnv(env: NodeJS.ProcessEnv): MemoryStore {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('data_unavailable')
  return createMemoryStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }))
}
