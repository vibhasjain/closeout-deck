import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface StateRow {
  doc: unknown
  updated_at: string
}

export type StateResult = { status: 200; row: StateRow } | { status: 409; row: StateRow | null }
export type StateDecision = { kind: 'upsert'; row: StateRow } | { kind: 'conflict'; row: StateRow }

export function conditionalState(
  current: StateRow | null,
  doc: unknown,
  baseUpdatedAt: string | null,
  now = new Date(),
): StateDecision {
  if (current && current.updated_at !== baseUpdatedAt) return { kind: 'conflict', row: current }
  // Ensure two accepted writes cannot reuse a version in the same millisecond.
  const previousTime = current ? Date.parse(current.updated_at) : -Infinity
  const updated_at = new Date(Math.max(now.getTime(), previousTime + 1)).toISOString()
  return { kind: 'upsert', row: { doc, updated_at } }
}

export interface StateStore {
  get(email: string): Promise<StateRow | null>
  put(email: string, doc: unknown, baseUpdatedAt: string | null): Promise<StateResult>
}

export function createStateStore(client: SupabaseClient): StateStore {
  async function get(email: string): Promise<StateRow | null> {
    const { data, error } = await client.from('closeout_state')
      .select('doc,updated_at').eq('email', email).maybeSingle()
    if (error) throw error
    return data as StateRow | null
  }

  return {
    get,
    async put(email, doc, baseUpdatedAt) {
      const current = await get(email)
      const decision = conditionalState(current, doc, baseUpdatedAt)
      if (decision.kind === 'conflict') return { status: 409, row: decision.row }

      if (current) {
        // The timestamp filter makes the read/compare/write atomic across server instances.
        const { data, error } = await client.from('closeout_state')
          .update(decision.row).eq('email', email).eq('updated_at', current.updated_at)
          .select('doc,updated_at').maybeSingle()
        if (error) throw error
        if (data) return { status: 200, row: data as StateRow }
      } else {
        // Insert instead of unconditional upsert: a concurrent creator must not be overwritten.
        const { data, error } = await client.from('closeout_state')
          .insert({ email, ...decision.row }).select('doc,updated_at').single()
        if (!error) return { status: 200, row: data as StateRow }
        if (error.code !== '23505') throw error
      }
      return { status: 409, row: await get(email) }
    },
  }
}

export function stateStoreFromEnv(env: NodeJS.ProcessEnv): StateStore {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('state_unavailable')
  return createStateStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }))
}
