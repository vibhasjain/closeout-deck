import { API_BASE } from '@/lib/api'
import { parseActions, parseCards, stream, type Card, type Action } from '@/lib/chat'
import { applyAction, isAction } from '@/lib/chatActions'
import { flushOnboarding, getOnboarding, updateOnboarding, type FirmFacts, type Onboarding } from '@/lib/onboarding'
import { signOut, viewerSession } from '@/lib/viewerSession'

export const authHeaders = () => {
  const token = viewerSession()?.sessionToken
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

export async function readFirm(domain: string, signal?: AbortSignal): Promise<FirmFacts> {
  const response = await fetch(`${API_BASE}/firm`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ domain }), signal })
  if (response.status === 401) signOut()
  if (!response.ok) throw new Error('I couldn’t read that firm. Check the website and try again.')
  const { firm } = await response.json()
  if (!firm || typeof firm.name !== 'string' || !isAction({ type: 'set_firm', patch: firm })) throw new Error('The firm read was incomplete. Try again.')
  return firm
}

export interface OnboardReply { question: string; card: Card; actions: Action[]; sessionId?: string }

/** A failed or malformed reply has no side effects and never selects a replacement question. */
export async function requestOnboarding(message: string, signal?: AbortSignal): Promise<OnboardReply> {
  await flushOnboarding()
  const { firm, profile, covered } = getOnboarding()
  let text = '', finished = false, sessionId: string | undefined
  for await (const event of stream(message, { firm, profile, covered }, 'onboard', signal)) {
    if (event.error) throw new Error(event.error)
    if (event.text) text += event.text
    if (event.sessionId) sessionId = event.sessionId
    if (event.done) { finished = true; if (event.final !== undefined) text = event.final }
  }
  if (!finished) throw new Error('The connection ended before the Closeout Agent finished. Try again.')
  const parsed = parseCards(text)
  const reply = parseActions(parsed.text)
  if (parsed.invalid || parsed.cards.length !== 1 || reply.actions.some((action) => !isAction(action))) {
    throw new Error('The Closeout Agent sent a card I couldn’t read. Try again.')
  }
  const card = parsed.cards[0]
  if (card.kind === 'question' && !reply.text.trim()) throw new Error('The Closeout Agent’s question was empty. Try again.')
  return { question: reply.text, card, actions: reply.actions, sessionId }
}

export function applyOnboardReply(reply: OnboardReply) {
  let state = getOnboarding()
  const allowed = ['set_profile', 'set_firm', 'add_source', 'set_authority', 'never_contact', 'cover_topic', 'set_calendar', 'add_cohort', 'add_rule', 'note']
  for (const action of reply.actions) {
    if (!allowed.includes(action.type)) continue
    applyAction(action, (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) } }, () => {}, new URLSearchParams())
  }
  const patch: Partial<Onboarding> = { ...state, setupRequest: null }
  if (reply.sessionId) patch.chatSessionId = reply.sessionId
  if (reply.card.kind === 'onboard_complete') patch.setupStep = 'writing'
  else patch.setupHistory = [...state.setupHistory, { question: reply.question, card: reply.card }]
  updateOnboarding(patch)
}

/** P5 is optional. Only a missing endpoint saves names; upload failures remain retryable. */
export async function uploadOnboardingFiles(files: File[], signal?: AbortSignal, set?: 1 | 2 | 3): Promise<string[]> {
  for (const file of files) {
    const response = await fetch(`${API_BASE}/files`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), ...(set ? { 'X-Set': String(set) } : {}) }, body: file, signal })
    if (response.status === 401) signOut()
    if (response.status === 404 || response.status === 501) break
    if (!response.ok) throw new Error('The upload failed. Try those files again.')
  }
  return files.map((file) => file.name)
}

export function finishOnboarding(names: string[]) {
  const state = getOnboarding()
  updateOnboarding({ forwarded: true, setupStep: 'ready', neverContact: names,
    chat: state.chat.some((message) => message.id === 'onboard-first-closeout') ? state.chat : [...state.chat, {
      id: 'onboard-first-closeout', role: 'agent', at: Date.now(), text: "Let's run last week together.",
      cards: [{ kind: 'question', input: 'choice', topics: ['workerHours'], choice: { yours: 'Use your timesheets', sample: 'Use sample timesheets' } }],
    }],
  })
}
