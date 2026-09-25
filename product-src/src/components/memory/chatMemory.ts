import type { Action } from '@/lib/chat'
import type { ChatMessage } from '@/lib/onboarding'
import { createInstinct, MemoryError } from '@/lib/memory'

type RememberAction = Extract<Action, { type: 'remember' }>
export type MemoryResolution = 'pending' | 'active' | 'forgotten' | 'duplicate' | 'tombstone'
export type RememberReceipt = RememberAction & { memory: { state: MemoryResolution; id?: string } }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export function validRememberAction(value: Record<string, unknown>): boolean {
  if (!['context', 'autonomy', 'style'].includes(String(value.kind)) || typeof value.text !== 'string'
    || !value.text.trim() || value.text.trim().length > 280
    || !Object.keys(value).every(key => ['type', 'kind', 'text', 'until'].includes(key))) return false
  if (value.until === undefined) return true
  if (typeof value.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.until)) return false
  const date = new Date(`${value.until}T00:00:00Z`)
  // The server owns the account's timezone and checks whether the day has passed.
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.until
}

export function isRememberReceipt(value: unknown): value is RememberReceipt {
  if (!record(value) || value.type !== 'remember' || !record(value.memory)) return false
  const { memory, ...action } = value
  return validRememberAction(action) && ['pending', 'active', 'forgotten', 'duplicate', 'tombstone'].includes(String(memory.state))
    && (['duplicate', 'tombstone'].includes(String(memory.state)) || typeof memory.id === 'string' && !!memory.id)
}

/** The receipt rides in the existing bounded actions field of the canonical chat row. */
export async function rememberAction(action: RememberAction): Promise<RememberReceipt> {
  try {
    const instinct = await createInstinct({ kind: action.kind, text: action.text, ...(action.until ? { until: action.until } : {}), source: 'chat' })
    return { ...action, text: instinct.text, memory: { id: instinct.id, state: instinct.status === 'active' ? 'active' : 'pending' } }
  } catch (error) {
    if (error instanceof MemoryError && error.status === 409 && error.reason) return { ...action, memory: { state: error.reason } }
    throw error
  }
}

interface Resolution { type: 'memory_resolution'; messageId: string; instinctId: string; state: 'active' | 'forgotten' }
function isResolution(value: unknown): value is Resolution {
  return record(value) && value.type === 'memory_resolution' && typeof value.messageId === 'string'
    && typeof value.instinctId === 'string' && (value.state === 'active' || value.state === 'forgotten')
}

/** History is append-only: fold subsequent receipts onto the original line without replaying an action. */
export function memoryHistory(messages: ChatMessage[]): ChatMessage[] {
  const resolutions = new Map<string, Resolution['state']>()
  for (const message of messages) for (const action of message.actions ?? []) if (isResolution(action)) {
    const key = `${action.messageId}:${action.instinctId}`
    if (resolutions.get(key) !== 'forgotten') resolutions.set(key, action.state)
  }
  return messages.filter(message => message.text || !message.actions?.length || !message.actions.every(isResolution)).map(message => ({
    ...message, actions: message.actions?.map(action => {
      if (!isRememberReceipt(action) || !action.memory.id) return action
      const state = resolutions.get(`${message.id}:${action.memory.id}`)
      return state ? { ...action, memory: { ...action.memory, state } } : action
    }),
  }))
}

export function recordMemoryResolution(messages: ChatMessage[], messageId: string, instinctId: string, state: Resolution['state']): ChatMessage[] {
  const message = memoryHistory(messages).find(row => row.id === messageId)
  if (!message || message.actions?.some(action => isRememberReceipt(action) && action.memory.id === instinctId && (action.memory.state === state || action.memory.state === 'forgotten'))) return messages
  return [...messages, { id: crypto.randomUUID(), role: 'agent', text: '', at: Date.now(), scope: message.scope,
    actions: [{ type: 'memory_resolution', messageId, instinctId, state } satisfies Resolution] }]
}
