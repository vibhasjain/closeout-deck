import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Batch, Decision, Dispute, Message, Thread } from './journey.ts'

/** P7 records (migration 0003). Every call is scoped by the session email. */
export interface JourneyStore {
  listDecisions(email: string, cycleId?: string): Promise<Decision[]>
  /** Idempotent per (email, cycle, group): a repeat updates the row and keeps its id. */
  upsertDecision(email: string, decision: Decision): Promise<Decision>
  listThreads(email: string, cycleId?: string): Promise<Thread[]>
  upsertThread(email: string, thread: Thread): Promise<void>
  listMessages(email: string, threadIds: string[]): Promise<Message[]>
  addMessage(email: string, message: Message): Promise<void>
  listBatches(email: string): Promise<Batch[]>
  /** Never re-send: an existing batch for the cycle wins and is returned with created false. */
  createBatch(email: string, batch: Batch): Promise<{ batch: Batch; created: boolean }>
  listDisputes(email: string): Promise<Dispute[]>
  upsertDispute(email: string, dispute: Dispute): Promise<void>
  /** Removing Sample data removes the journey records of its cycles. */
  deleteCycles(email: string, cycleIds: string[]): Promise<void>
}

const clone = <T>(value: T): T => structuredClone(value)

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
    async listThreads(email, cycleId) { return clone(account(email).threads.filter(t => !cycleId || t.cycleId === cycleId)) },
    async upsertThread(email, thread) { put(account(email).threads, thread) },
    async listMessages(email, threadIds) { const ids = new Set(threadIds); return clone(account(email).messages.filter(m => ids.has(m.threadId))) },
    async addMessage(email, message) {
      if (!account(email).threads.some(t => t.id === message.threadId)) throw new Error('thread_not_found')
      account(email).messages.push(clone(message))
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
      const { data, error } = await request.order(order).range(offset, offset + 999)
      if (error) throw new Error(`journey_${name}_read_failed`)
      rows.push(...(data as Row[]).map(row => fromRow<T>(row)))
      if (data.length < 1000) return rows
    }
  }
  async function upsert(name: string, email: string, value: object, onConflict = 'id') {
    const { error } = await table(name).upsert(toRow(value, email), { onConflict })
    if (error) throw new Error(`journey_${name}_write_failed`)
  }
  return {
    listDecisions: (email, cycleId) => list<Decision>('decisions', email, cycleId ? { cycle_id: cycleId } : {}, 'at'),
    async upsertDecision(email, decision) {
      const [old] = await list<Decision>('decisions', email, { cycle_id: decision.cycleId, group_id: decision.groupId })
      const saved = { ...decision, id: old?.id ?? decision.id }
      await upsert('decisions', email, saved, 'email,cycle_id,group_id')
      return saved
    },
    listThreads: (email, cycleId) => list<Thread>('threads', email, cycleId ? { cycle_id: cycleId } : {}, 'created_at'),
    upsertThread: (email, thread) => upsert('threads', email, thread),
    async listMessages(email, threadIds) {
      const rows: Message[] = []
      // Keep PostgREST filter URLs short.
      for (let offset = 0; offset < threadIds.length; offset += 100) {
        const { data, error } = await table('messages').select('*').eq('email', email).in('thread_id', threadIds.slice(offset, offset + 100)).order('at').limit(5000)
        if (error) throw new Error('journey_messages_read_failed')
        rows.push(...(data as Row[]).map(row => fromRow<Message>(row)))
      }
      return rows
    },
    async addMessage(email, message) {
      const { error } = await table('messages').insert(toRow(message, email))
      if (error) throw new Error('journey_messages_write_failed')
    },
    listBatches: email => list<Batch>('batches', email, {}, 'created_at'),
    async createBatch(email, batch) {
      const { error } = await table('batches').insert(toRow(batch, email))
      if (!error) return { batch, created: true }
      // 23505: the unique (email, cycle_id) row already exists. The first send stands.
      if (error.code !== '23505') throw new Error('journey_batches_write_failed')
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
        if (error) throw new Error(`journey_${name}_delete_failed`)
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
