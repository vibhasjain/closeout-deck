import type { NavigateFunction } from 'react-router-dom'
import { parseActions, parseCards, type Action } from '@/lib/chat'
import { applyAction, isAction, safeModelText, validatedActions } from '@/lib/chatActions'
import { flushOnboarding, getOnboarding, updateOnboarding, type ChatMessage } from '@/lib/onboarding'
import { ONBOARD_ALLOWED_ACTIONS } from '@/lib/onboardingFlow'
import { callOwner, readStoredCall, recoverStoredCall, setCallRetryFallback, type SavedCall, type StoredCall } from '@/lib/callRecovery'
import { callEndTranscript, type CallPurpose } from '@/lib/live'

export interface VoiceAudit { actions: Action[]; skipped: string[] }
export function createVoiceAudit(): VoiceAudit { return { actions: [], skipped: [] } }

export async function applyVoiceActions(actions: Action[], purpose: CallPurpose, audit: VoiceAudit, navigate: NavigateFunction, params: URLSearchParams, cycleId?: string) {
  const failed: Action[] = []
  const checked = validatedActions(actions, getOnboarding().firm)
  audit.skipped.push(...checked.skipped)
  for (const action of checked.actions) {
    if (purpose === 'onboard' && !ONBOARD_ALLOWED_ACTIONS.includes(action.type)) { audit.skipped.push(`${action.type} is unavailable during setup`); continue }
    if (JSON.stringify(action).length > 16_000) { audit.skipped.push(`${action.type}: action is too large to record`); continue }
    try {
      await applyAction(action, patch => updateOnboarding(typeof patch === 'function' ? patch(getOnboarding()) : patch), navigate, params, cycleId)
      audit.actions.push(action)
    } catch (error) {
      failed.push(action)
      console.warn('Voice action skipped', action.type, error)
      audit.skipped.push(`${action.type}: ${error instanceof Error ? error.message : 'could not apply'}`.slice(0, 200))
    }
  }
  await flushOnboarding().catch(error => { console.warn('Voice state save pending', error) })
  return failed
}

/** Preserve every action while each history row stays inside the server's audit limits. */
function auditChunks(audit: VoiceAudit) {
  const chunks: VoiceAudit[] = [createVoiceAudit()]
  for (const action of audit.actions) {
    let chunk = chunks.at(-1)!
    if (chunk.actions.length === 30 || JSON.stringify([...chunk.actions, action]).length > 16_384) { chunk = createVoiceAudit(); chunks.push(chunk) }
    chunk.actions.push(action)
  }
  audit.skipped.forEach((item, index) => {
    const at = Math.floor(index / 10)
    while (chunks.length <= at) chunks.push(createVoiceAudit())
    chunks[at].skipped.push(item.slice(0, 200))
  })
  return chunks
}

export function recordVoiceCall(call: SavedCall, audit: VoiceAudit, scope?: string, at = Date.now()) {
  const state = getOnboarding(), id = `call-${call.callId}`
  const previous = state.chat.find(message => message.id === id)
  const text = safeModelText(parseCards(parseActions(call.final).text).text, state.firm)
  const chunks = auditChunks(audit)
  const messages: ChatMessage[] = chunks.map((chunk, index) => ({
    id: index ? `${id}-actions-${index}` : id, role: 'agent', at: (previous?.at ?? at) + index, scope,
    text: index ? 'More actions from your call.' : text || previous?.text || '',
    actions: chunk.actions, skipped: chunk.skipped,
    ...(index ? {} : { cards: [{ kind: 'call' as const, callId: call.callId, seconds: call.seconds }], callTranscript: callEndTranscript(call.transcript.map(turn => ({ ...turn, endMs: turn.startMs }))) }),
    callSaveError: call.saveError, callServerSaved: call.serverSaved, callSaving: !!call.saveError || !!call.saving, callPurpose: call.purpose ?? previous?.callPurpose,
  }))
  const replacements = new Map(messages.map(message => [message.id, message]))
  updateOnboarding({ chat: [...state.chat.map(message => replacements.get(message.id) ?? message), ...messages.filter(message => !state.chat.some(old => old.id === message.id))] })
}

export function restoreVoiceAudit(callId: string): VoiceAudit {
  const rows = getOnboarding().chat.filter(message => message.id === `call-${callId}` || message.id.startsWith(`call-${callId}-actions-`))
  return { actions: rows.flatMap(message => message.actions ?? []).filter(isAction), skipped: rows.flatMap(message => message.skipped ?? []) }
}

export async function recoverVoiceCall(navigate: NavigateFunction, params: URLSearchParams) {
  const email = callOwner()
  if (!email) return
  const recover = (record: StoredCall, serverSaved = false) => {
    const audit = restoreVoiceAudit(record.sessionId)
    return recoverStoredCall(email, {
      onSkipped: skipped => { audit.skipped.push(...skipped) },
      onActions: async (actions, purpose) => { await applyVoiceActions(actions, purpose, audit, navigate, params) },
      onCompleted: (call, value) => recordVoiceCall(call, audit, getOnboarding().chat.find(message => message.id === `call-${value.sessionId}`)?.scope, value.startedAt),
    }, record, serverSaved)
  }
  const fromCard = (id: string) => {
    const message = getOnboarding().chat.find(row => row.id === `call-${id}`)
    const card = message?.cards?.find(card => card.kind === 'call')
    if (!message || !card || card.kind !== 'call') throw new Error('The saved call could not be found. Reload and retry saving.')
    return recover({ sessionId: id, purpose: message.callPurpose ?? 'desk', startedAt: message.at, seconds: card.seconds, transcript: message.callTranscript ?? [] }, message.callServerSaved === true)
  }
  setCallRetryFallback(fromCard)
  const stored = readStoredCall(email)
  if (stored) await recover(stored)
  // Released calls can still be consolidating when a new call acquires the one live key.
  // Their provisional chat rows are a second durable journal until saving completes.
  for (const message of getOnboarding().chat.filter(row => row.callSaving && row.cards?.some(card => card.kind === 'call'))) {
    const card = message.cards!.find(card => card.kind === 'call')!
    if (card.kind === 'call' && card.callId !== stored?.sessionId) await fromCard(card.callId)
  }
}
