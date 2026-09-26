import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dataFailure } from './datastore.ts'
import type { Batch, Decision, Dispute, Message, Thread } from './journey.ts'

/** P7 records (migration 0003). Every call is scoped by the session email. */
export interface JourneyStore {
  listDecisions(email: string, cycleId?: string): Promise<Decision[]>
  /** Idempotent per (email, cycle, group): a repeat updates the row and keeps its id. */
  upsertDecision(email: string, decision: Decision): Promise<Decision>
  /** Collapse legacy numeric aliases to canonical rule ids; the latest at/id wins. */
  canonicalizeDecisions(email: string, cycleId: string, aliases: Record<string, string>): Promise<Decision[]>
  listThreads(email: string, cycleId?: string): Promise<Thread[]>
  upsertThread(email: string, thread: Thread): Promise<void>
  listMessages(email: string, threadIds: string[]): Promise<Message[]>
  addMessage(email: string, message: Message): Promise<void>
  /** Thread, all messages, and optional dispute commit together or none do. */
  saveConversation(email: string, thread: Thread, messages: Message[], dispute?: Dispute): Promise<void>
  listBatches(email: string): Promise<Batch[]>
  /** Never re-send: an existing batch for the cycle wins and is returned with created false. */
  createBatch(email: string, batch: Batch): Promise<{ batch: Batch; created: boolean }>
  listDisputes(email: string): Promise<Dispute[]>
  upsertDispute(email: string, dispute: Dispute): Promise<void>
  /** Removing Sample data removes the journey records of its cycles. */
  deleteCycles(email: string, cycleIds: string[]): Promise<void>
  /** Start over: every journey record of the account. */
  deleteAccount(email: string): Promise<void>
}

const clone = <T>(value: T): T => structuredClone(value)
const messageOrder = (a: Message, b: Message) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
function canonicalDecisions(email: string, cycleId: string, decisions: Decision[], aliases: Record<string, string>) {
  const latest = new Map<string, Decision>()
  for (const decision of [...decisions].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    const groupId = aliases[decision.groupId] ?? decision.groupId
    const id = 'd_' + createHash('sha256').update(`${email}|${cycleId}|${groupId}`).digest('hex').slice(0, 16)
    latest.set(groupId, { ...decision, groupId, id })
  }
  return [...latest.values()]
}
function validateConversation(thread: Thread, messages: Message[], dispute?: Dispute) {
  const ids = new Set<string>()
  for (const message of messages) {
    if (message.threadId !== thread.id || !message.text.trim() || message.text.length > 4000 || ids.has(message.id)) throw new Error('journey_messages_write_failed')
    ids.add(message.id)
  }
  if (dispute && (thread.disputeId !== dispute.id || thread.cycleId !== dispute.cycleId)) throw new Error('journey_disputes_write_failed')
}

export function createMemoryJourneyStore(): JourneyStore {
  const accounts = new Map<string, { decisions: Decision[]; threads: Thread[]; messages: Message[]; batches: Batch[]; disputes: Dispute[] }>()
  const account = (email: string) => {
    let a = accounts.get(email)
    if (!a) accounts.set(email, a = { decisions: [], threads: [], messages: [], batches: [], disputes: [] })
    return a
  }
  const put = <T extends { id: string }>(list: T[], value: T) => { const i = list.findIndex(x => x.id === value.id); if (i >= 0) list[i] = clone(value); else list.push(clone(value)) }
  return {
    async listDecisions(email, cycleId) { return clone(account(email).decisions.filter(d => !cycleId || d.cycleId === cycleId)) },
    async upsertDecision(email, decision) {
      const list = account(email).decisions, old = list.find(d => d.cycleId === decision.cycleId && d.groupId === decision.groupId)
      const saved = { ...decision, id: old?.id ?? decision.id }
      put(list, saved)
      return clone(saved)
    },
    async canonicalizeDecisions(email, cycleId, aliases) {
      const a = account(email), canonical = canonicalDecisions(email, cycleId, a.decisions.filter(d => d.cycleId === cycleId), aliases)
      a.decisions = [...a.decisions.filter(d => d.cycleId !== cycleId), ...clone(canonical)]
      return clone(canonical)
    },
    async listThreads(email, cycleId) { return clone(account(email).threads.filter(t => !cycleId || t.cycleId === cycleId)) },
    async upsertThread(email, thread) { put(account(email).threads, thread) },
    async listMessages(email, threadIds) { const ids = new Set(threadIds); return clone(account(email).messages.filter(m => ids.has(m.threadId)).sort(messageOrder)) },
    async addMessage(email, message) {
      if (!account(email).threads.some(t => t.id === message.threadId)) throw new Error('thread_not_found')
      account(email).messages.push(clone(message))
    },
    async saveConversation(email, thread, messages, dispute) {
      validateConversation(thread, messages, dispute)
      const a = account(email)
      if (messages.some(m => a.messages.some(old => old.id === m.id))) throw new Error('journey_messages_write_failed')
      // Validate and clone before replacing the account: failures cannot publish partial writes.
      const next = clone(a)
      put(next.threads, thread)
      next.messages.push(...clone(messages))
      if (dispute) put(next.disputes, dispute)
      accounts.set(email, next)
    },
    async listBatches(email) { return clone(account(email).batches) },
    async createBatch(email, batch) {
      const existing = account(email).batches.find(b => b.cycleId === batch.cycleId)
      if (existing) return { batch: clone(existing), created: false }
      account(email).batches.push(clone(batch))
      return { batch: clone(batch), created: true }
    },
    async listDisputes(email) { return clone(account(email).disputes) },
    async upsertDispute(email, dispute) { put(account(email).disputes, dispute) },
    async deleteCycles(email, cycleIds) {
      const a = account(email), gone = new Set(cycleIds)
      const threads = new Set(a.threads.filter(t => gone.has(t.cycleId)).map(t => t.id))
      a.decisions = a.decisions.filter(d => !gone.has(d.cycleId)); a.threads = a.threads.filter(t => !threads.has(t.id))
      a.messages = a.messages.filter(m => !threads.has(m.threadId)); a.batches = a.batches.filter(b => !gone.has(b.cycleId))
      a.disputes = a.disputes.filter(d => !gone.has(d.cycleId))
    },
    async deleteAccount(email) { accounts.delete(email) },
  }
}

type Row = Record<string, unknown>
/** Top-level keys only: jsonb contents (counterparty, adjustment) are stored verbatim. */
const toRow = (value: object, email: string): Row => ({ ...Object.fromEntries(Object.entries(value).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v])), email })
function fromRow<T>(row: Row): T {
  const out = Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'email').map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]))
  if ('gross' in out) out.gross = Number(out.gross)
  return out as T
}

export function createJourneyStore(client: SupabaseClient): JourneyStore {
  const table = (name: string) => client.from(`closeout_${name}`)
  async function list<T>(name: string, email: string, filter: Row = {}, order = 'id'): Promise<T[]> {
    const rows: T[] = []
    for (let offset = 0; ; offset += 1000) {
      let request = table(name).select('*').eq('email', email)
      for (const [key, value] of Object.entries(filter)) request = request.eq(key, value as string)
      request = request.order(order)
      if (order !== 'id') request = request.order('id')
      const { data, error } = await request.range(offset, offset + 999)
      if (error) throw dataFailure(`journey_${name}_read_failed`, error)
      rows.push(...(data as Row[]).map(row => fromRow<T>(row)))
      if (data.length < 1000) return rows
    }
  }
  async function upsert(name: string, email: string, value: object, onConflict = 'id') {
    const { error } = await table(name).upsert(toRow(value, email), { onConflict })
    if (error) throw dataFailure(`journey_${name}_write_failed`, error)
  }
  return {
    listDecisions: (email, cycleId) => list<Decision>('decisions', email, cycleId ? { cycle_id: cycleId } : {}, 'at'),
    async upsertDecision(email, decision) {
      const [old] = await list<Decision>('decisions', email, { cycle_id: decision.cycleId, group_id: decision.groupId })
      const saved = { ...decision, id: old?.id ?? decision.id }
      await upsert('decisions', email, saved, 'email,cycle_id,group_id')
      return saved
    },
    async canonicalizeDecisions(email, cycleId, aliases) {
      const old = await list<Decision>('decisions', email, { cycle_id: cycleId }, 'at')
      const canonical = canonicalDecisions(email, cycleId, old, aliases)
      if (old.length === canonical.length && old.every(d => canonical.some(c => c.id === d.id && c.groupId === d.groupId))) return canonical
      const { error } = await client.rpc('closeout_replace_decisions', { p_email: email, p_cycle_id: cycleId, p_decisions: canonical.map(d => toRow(d, email)) })
      if (error) throw dataFailure('journey_decisions_write_failed', error)
      return canonical
    },
    listThreads: (email, cycleId) => list<Thread>('threads', email, cycleId ? { cycle_id: cycleId } : {}, 'created_at'),
    upsertThread: (email, thread) => upsert('threads', email, thread),
    async listMessages(email, threadIds) {
      const rows: Message[] = []
      // Keep PostgREST filter URLs short.
      for (let offset = 0; offset < threadIds.length; offset += 100) {
        let cursor: Message | undefined
        for (;;) {
          let request = table('messages').select('*').eq('email', email).in('thread_id', threadIds.slice(offset, offset + 100)).order('at').order('id').limit(1000)
          if (cursor) request = request.or(`at.gt.${cursor.at},and(at.eq.${cursor.at},id.gt.${cursor.id})`)
          const { data, error } = await request
          if (error) throw dataFailure('journey_messages_read_failed', error)
          if (!data.length) break
          const page = (data as Row[]).map(row => fromRow<Message>(row))
          rows.push(...page)
          cursor = page.at(-1)!
          // Continue even if the server has a configured row cap smaller than 1000.
        }
      }
      return rows.sort(messageOrder)
    },
    async addMessage(email, message) {
      const { error } = await table('messages').insert(toRow(message, email))
      if (error) throw dataFailure('journey_messages_write_failed', error)
    },
    async saveConversation(email, thread, messages, dispute) {
      validateConversation(thread, messages, dispute)
      const { error } = await client.rpc('closeout_save_conversation', { p_email: email, p_thread: toRow(thread, email),
        p_messages: messages.map(m => toRow(m, email)), p_dispute: dispute ? toRow(dispute, email) : null })
      if (error) throw dataFailure('journey_conversation_write_failed', error)
    },
    listBatches: email => list<Batch>('batches', email, {}, 'created_at'),
    async createBatch(email, batch) {
      const { error } = await table('batches').insert(toRow(batch, email))
      if (!error) return { batch, created: true }
      // 23505: the unique (email, cycle_id) row already exists. The first send stands.
      if (error.code !== '23505') throw dataFailure('journey_batches_write_failed', error)
      const [existing] = await list<Batch>('batches', email, { cycle_id: batch.cycleId })
      if (!existing) throw new Error('journey_batches_read_failed')
      return { batch: existing, created: false }
    },
    listDisputes: (email) => list<Dispute>('disputes', email, {}, 'created_at'),
    upsertDispute: (email, dispute) => upsert('disputes', email, dispute),
    async deleteCycles(email, cycleIds) {
      if (!cycleIds.length) return
      // Messages cascade with their threads.
      for (const name of ['decisions', 'threads', 'batches', 'disputes']) {
        const { error } = await table(name).delete().eq('email', email).in('cycle_id', cycleIds)
        if (error) throw dataFailure(`journey_${name}_delete_failed`, error)
      }
    },
    async deleteAccount(email) {
      for (const name of ['messages', 'threads', 'decisions', 'batches', 'disputes']) {
        const { error } = await table(name).delete().eq('email', email)
        if (error) throw dataFailure(`journey_${name}_delete_failed`, error)
      }
    },
  }
}

export function journeyStoreFromEnv(env: NodeJS.ProcessEnv): JourneyStore {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('data_unavailable')
  return createJourneyStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }))
}
