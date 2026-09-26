import type { ChatMessage } from '@/lib/onboarding'

interface Options {
  request(method: 'GET' | 'POST', body?: { messages: ChatMessage[] }): Promise<Response>
  read(): ChatMessage[]
  /** Replace the local transcript without re-queuing it. */
  apply(chat: ChatMessage[]): void
  loadPending(): ChatMessage[]
  savePending(messages: ChatMessage[]): void
}
const BATCH = 50
// Leave headroom beneath the route's 512 KiB JSON cap, including multibyte text.
const BATCH_BYTES = 480 * 1024
function serverMessage(message: ChatMessage): ChatMessage {
  const record = { ...message }
  // The transcript has its own /live-session/:id/end contract and can be much
  // larger than a history row. Retain it locally, not in the append payload.
  delete record.callTranscript
  delete record.callLive
  return record
}
function batchOf(messages: ChatMessage[]) {
  const batch: ChatMessage[] = []
  let bytes = 16
  for (const message of messages.slice(0, BATCH)) {
    const size = new TextEncoder().encode(JSON.stringify(serverMessage(message))).length + 1
    if (batch.length && bytes + size > BATCH_BYTES) break
    batch.push(message); bytes += size
  }
  return batch
}
export const isChatMessage = (value: unknown): value is ChatMessage => !!value && typeof value === 'object'
  && typeof (value as ChatMessage).id === 'string' && ((value as ChatMessage).role === 'user' || (value as ChatMessage).role === 'agent')
  && typeof (value as ChatMessage).text === 'string' && typeof (value as ChatMessage).at === 'number'
function union(...lists: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const list of lists) for (const message of list) {
    const card = message.cards?.find(card => card.kind === 'call')
    const key = card?.kind === 'call' ? `call:${card.callId}` : `message:${message.id}`
    const previous = byId.get(key)
    if (!previous) byId.set(key, message)
    // The history service omits call transcripts and local save state; older versions also omit traces.
    // Keep locally received evidence when canonical rows are refreshed.
    else {
      const oldCard = previous.cards?.find(card => card.kind === 'call')
      // History may contain both a recovery snapshot and a completed row under
      // different ids. Keep the furthest progressed representation of the call.
      const newer = card?.kind === 'call' && oldCard?.kind === 'call'
        && (card.seconds > oldCard.seconds || (card.seconds === oldCard.seconds && previous.callSaving === true && message.callSaving === false))
      const preferred = newer ? message : previous, fallback = newer ? previous : message
      const preferredSeconds = preferred.cards?.find(card => card.kind === 'call')?.seconds ?? 0
      const fallbackSeconds = fallback.cards?.find(card => card.kind === 'call')?.seconds ?? 0
      const settled = preferred.callSaving === false || (preferredSeconds > fallbackSeconds && preferred.callSaving !== true)
      byId.set(key, { ...preferred,
        ...(!preferred.traces?.length && fallback.traces?.length ? { traces: fallback.traces } : {}),
        ...(!preferred.callTranscript?.length && fallback.callTranscript?.length ? { callTranscript: fallback.callTranscript } : {}),
        ...(!Object.hasOwn(preferred, 'callServerSaved') && Object.hasOwn(fallback, 'callServerSaved') ? { callServerSaved: fallback.callServerSaved } : {}),
        ...(!settled && !Object.hasOwn(preferred, 'callSaveError') && Object.hasOwn(fallback, 'callSaveError') ? { callSaveError: fallback.callSaveError } : {}),
        ...(!settled && !Object.hasOwn(preferred, 'callSaving') && Object.hasOwn(fallback, 'callSaving') ? { callSaving: fallback.callSaving } : {}),
        // The server only receives finalized cards. Never revive a local "live"
        // label when a same-duration finalized server row wins hydration.
        ...(!Object.hasOwn(preferred, 'callLive') && Object.hasOwn(fallback, 'callLive') ? { callLive: false } : {}),
      })
    }
  }
  return [...byId.values()].sort((a, b) => a.at - b.at)
}

/** The transcript is append-only rows on the server (GET/POST /chat/history), not part of the state document.
 * Pending actions are durably queued locally first; send the immutable row once their outcomes are known. */
export function createChatHistory(options: Options) {
  let queue: ChatMessage[] | null = null
  let loaded = false
  let sending: Promise<void> | null = null
  const active = new Set<string>()
  const restored = (message: ChatMessage): ChatMessage => message.pendingActions?.length && !active.has(message.id)
    ? { ...message, pendingActions: [], skipped: ['Action outcome unconfirmed after reload; review the cycle before trying again', ...(message.skipped ?? [])].slice(0, 10) }
    : message
  const pending = () => queue ??= options.loadPending().filter(isChatMessage).map(restored)
  const save = (next: ChatMessage[]) => { queue = next; options.savePending(next) }

  async function flush(): Promise<void> {
    if (sending) return sending
    sending = (async () => {
      for (;;) {
        const batch = batchOf(pending().filter(message => !message.pendingActions?.length && !message.callSaving))
        if (!batch.length) break
        const response = await options.request('POST', { messages: batch.map(serverMessage) })
        if (response.status === 400 && batch.length > 1) {
          // Isolate a legacy malformed row so its valid neighbors are still saved.
          for (const message of batch) {
            const single = await options.request('POST', { messages: [serverMessage(message)] })
            if (!single.ok && single.status !== 400) throw new Error('Your conversation could not be saved. It is kept here and retried.')
            save(pending().filter((item) => item.id !== message.id))
          }
          continue
        }
        // Rejected legacy rows remain in the local transcript, but cannot poison every later append.
        if (!response.ok && response.status !== 400) throw new Error('Your conversation could not be saved. It is kept here and retried.')
        const sent = new Set(batch.map((message) => message.id))
        save(pending().filter((message) => !sent.has(message.id)))
      }
    })().finally(() => { sending = null })
    return sending
  }

  /** Called with the store's transcript before and after every write. */
  function appended(previous: ChatMessage[], next: ChatMessage[]) {
    const known = new Map(previous.map((message) => [message.id, message]))
    const added = next.filter((message) => !known.has(message.id) || !!known.get(message.id)?.pendingActions?.length || !!known.get(message.id)?.callSaving)
    if (!added.length) return
    for (const message of added) {
      if (message.pendingActions?.length) active.add(message.id)
      else active.delete(message.id)
    }
    const changed = new Set(added.map(message => message.id))
    save(union(pending().filter(message => !changed.has(message.id)), added))
    if (loaded) void flush().catch(() => { /* kept durably; the next line or load retries */ })
  }

  /** Read the server transcript and upload local or legacy lines it does not have yet. */
  async function load(legacy: unknown[] = []) {
    const response = await options.request('GET')
    if (!response.ok) throw new Error('Your conversation could not be loaded.')
    const body: unknown = await response.json()
    const server = Array.isArray((body as { messages?: unknown })?.messages) ? (body as { messages: unknown[] }).messages.filter(isChatMessage) : []
    const onServer = new Set(server.map((message) => message.id))
    const known = union(options.read(), legacy.filter(isChatMessage)).map(restored)
    save(union(pending(), known.filter((message) => !onServer.has(message.id))))
    options.apply(union(server, known, pending()))
    loaded = true
    await flush()
  }
  return { appended, load, flush }
}
