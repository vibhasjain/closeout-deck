import type { ChatMode, IngestEvent, TurnContext } from './chat'

export const CHAT_POST_EVENT = 'closeout:post-to-chat'
export const INGEST_RESULT_EVENT = 'closeout:ingest-result'
export interface ChatPost { text: string; mode?: ChatMode; context?: TurnContext; contextChip?: string }

/** Intake can start a turn in the persistent conversation without owning its transport. */
export function postToChat(turn: ChatPost) {
  window.dispatchEvent(new CustomEvent<ChatPost>(CHAT_POST_EVENT, { detail: turn }))
}

export function reportIngest(result: IngestEvent) {
  window.dispatchEvent(new CustomEvent<IngestEvent>(INGEST_RESULT_EVENT, { detail: result }))
}
