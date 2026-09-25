import { API_BASE } from '@/lib/api'
import { parseActions, parseCards, stream, type Card, type Action, type OnboardContext } from '@/lib/chat'
import { applyAction, isAction, safeModelCard, safeModelText, validatedActions } from '@/lib/chatActions'
import { effectiveAuthority, flushOnboarding, getOnboarding, inboxAddress, updateOnboarding, type FirmFacts, type Onboarding } from '@/lib/onboarding'
import { signOut, viewerSession } from '@/lib/viewerSession'

export const authHeaders = () => {
  const token = viewerSession()?.sessionToken
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

export async function readFirm(domain: string, signal?: AbortSignal): Promise<FirmFacts> {
  const response = await fetch(`${API_BASE}/firm`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ domain }), signal })
  if (response.status === 401) signOut()
  if (!response.ok) throw new Error('The firm website could not be read. Check the website and try again.')
  const { firm } = await response.json()
  if (!firm || typeof firm.name !== 'string' || !isAction({ type: 'set_firm', patch: firm })) throw new Error('The firm read was incomplete. Try again.')
  return firm
}

export interface OnboardReply { question: string; card: Card; actions: Action[]; sessionId?: string; skipped?: string[] }

export function onboardContext(): OnboardContext {
  const state = getOnboarding()
  return { firm: state.firm, profile: state.profile, covered: state.covered, sources: state.sources,
    inbox: inboxAddress(viewerSession()?.email ?? null), authorityConfigured: state.authorityConfigured, authority: effectiveAuthority(state) }
}

async function agentTurn(message: string, context: OnboardContext, signal?: AbortSignal) {
  // The in-turn context still carries current edits when an unrelated state save fails.
  await flushOnboarding().catch(() => {})
  let text = '', finished = false, sessionId: string | undefined
  for await (const event of stream(message, context, 'onboard', signal)) {
    if (event.error) throw new Error(event.error)
    if (event.text) text += event.text
    if (event.sessionId) sessionId = event.sessionId
    if (event.done) { finished = true; if (event.final !== undefined) text = event.final }
  }
  if (!finished) throw new Error('The connection ended before the Closeout Agent finished. Try again.')
  const parsed = parseCards(text)
  const reply = parseActions(parsed.text)
  const { actions, skipped } = validatedActions(reply.actions, context.firm)
  skipped.push(...(reply.skipped ?? []))
  if (parsed.invalid) skipped.push('card')
  const cards = parsed.cards.flatMap((card) => {
    const safe = safeModelCard(card, context.firm)
    if (JSON.stringify(safe) !== JSON.stringify(card)) skipped.push('card URL')
    return safe ? [safe] : []
  })
  return { question: safeModelText(reply.text, context.firm), cards, actions, skipped, sessionId }
}

/** Keep valid parts of model output and ask a corrective follow-up only if no usable card remains. */
export async function requestOnboarding(message: string, signal?: AbortSignal): Promise<OnboardReply> {
  if (getOnboarding().forwarded) updateOnboarding({ forwarded: false })
  const reply = await agentTurn(message, onboardContext(), signal)
  const card = reply.cards[0]
  if (!card || (card.kind === 'question' && !reply.question.trim())) {
    const state = applyReplyActions(reply.actions)
    updateOnboarding({ ...state, setupRequest: 'Your last reply did not contain a readable question card. The valid actions were saved. Send the next question with one valid card, or your closing line with onboard_complete.',
      setupNotice: skippedNote([...reply.skipped, 'card']), ...(reply.sessionId ? { chatSessionId: reply.sessionId } : {}) })
    throw new Error('The last card was unreadable. Retry asks the agent to correct it; saved answers are still available.')
  }
  if (reply.cards.length > 1) reply.skipped.push('extra cards')
  return { ...reply, card }
}

const skippedNote = (skipped: string[]) => skipped.length ? `Skipped: ${[...new Set(skipped)].join(', ')}.` : null
const allowed = ['set_profile', 'set_firm', 'add_source', 'remove_source', 'remove_rule', 'set_authority', 'never_contact', 'cover_topic', 'set_calendar', 'add_cohort', 'add_rule', 'note']
function applyReplyActions(actions: Action[]) {
  let state = getOnboarding()
  for (const action of actions) {
    if (!allowed.includes(action.type)) continue
    applyAction(action, (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) } }, () => {}, new URLSearchParams())
  }
  return state
}
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

export function applyOnboardReply(reply: OnboardReply) {
  const before = getOnboarding()
  const checked = validatedActions(reply.actions, before.firm)
  const state = applyReplyActions(checked.actions)
  const history = [...state.setupHistory]
  const at = history.length - 1
  if (at >= 0 && history[at].answer !== undefined) {
    history[at] = { ...history[at], effects: {
      addedSources: state.sources.filter((source) => !before.sources.some((old) => same(old, source))),
      removedSources: before.sources.filter((source) => !state.sources.some((next) => same(next, source))),
      addedRuleIds: state.customRules.filter((rule) => !before.customRules.some((old) => old.id === rule.id)).map((rule) => rule.id),
      removedRules: before.customRules.filter((rule) => !state.customRules.some((next) => next.id === rule.id)),
    } }
  }
  const skipped = [...(reply.skipped ?? []), ...checked.skipped]
  const patch: Partial<Onboarding> = { ...state, forwarded: false, setupHistory: history, setupRequest: null, setupNotice: skippedNote(skipped) }
  if (reply.sessionId) patch.chatSessionId = reply.sessionId
  // An explicit ask-first answer is safe consent. Any wider model-proposed scope waits for Rulebook acceptance.
  if (history[at]?.card.topics.includes('authority') && /\b(ask (?:me )?(?:first|before)|nothing (?:on your own|without)|spend nothing)\b/i.test(history[at].answer ?? '')) {
    patch.authorityConfigured = true
    patch.authority = { autoFix: false, limit: 0, weeklyCap: 0, textSupervisors: false, textWorkers: false, briefing: state.authority.briefing }
    patch.authoritySuggestion = null
  }
  if (reply.card.kind === 'onboard_complete') {
    patch.setupStep = 'writing'
    patch.setupClosing = reply.question
    patch.chat = [...state.chat.filter((message) => message.id !== 'onboard-closing'), { id: 'onboard-closing', role: 'agent', text: reply.question, at: Date.now(), actions: checked.actions, ...(skipped.length ? { skipped } : {}) }]
  } else patch.setupHistory = [...history, { question: reply.question, card: reply.card }]
  updateOnboarding(patch)
}

/** Undo source and rule effects of replaced answers without deleting unrelated later edits. */
export function rollbackOnboardingAnswer(index: number) {
  const state = getOnboarding()
  let sources = [...state.sources], customRules = [...state.customRules]
  for (const entry of state.setupHistory.slice(index).reverse()) {
    if (!entry.effects) continue
    const { addedSources, removedSources, addedRuleIds, removedRules } = entry.effects
    sources = sources.filter((source) => !addedSources.some((added) => same(source, added)))
    for (const source of removedSources) if (!sources.some((current) => same(current, source))) sources.push(source)
    customRules = customRules.filter((rule) => !addedRuleIds.includes(rule.id))
    for (const rule of removedRules) if (!customRules.some((current) => current.id === rule.id)) customRules.push(rule)
  }
  updateOnboarding({ sources, customRules })
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

let kickoff: Promise<void> | null = null
export async function finishOnboarding(names: string[]) {
  updateOnboarding({ neverContact: [...new Set(names.map((name) => name.trim()).filter(Boolean))] })
  if (getOnboarding().chat.some((message) => message.id === 'onboard-first-closeout')) {
    updateOnboarding({ forwarded: true, setupStep: 'ready', kickoffPending: false }); return
  }
  if (kickoff) return kickoff
  updateOnboarding({ kickoffPending: true })
  kickoff = (async () => {
    const context = onboardContext()
    const missingSets = ([1, 2, 3] as const).filter((set) => !context.sources.some((source) => source.set === set))
    const reply = await agentTurn(getOnboarding().setupRequest || 'Finish setup and start my first closeout using the sources I have provided.', { ...context, phase: 'first_closeout', missingSets })
    const seen = new Set<number>(), skipped = [...reply.skipped]
    const cards = reply.cards.filter((card) => {
      if (card.kind === 'question' && card.input === 'choice' && card.set && missingSets.includes(card.set) && !seen.has(card.set)) { seen.add(card.set); return true }
      skipped.push('unexpected kickoff card'); return false
    })
    if (!reply.question || missingSets.some((set) => !seen.has(set))) {
      const state = applyReplyActions(reply.actions)
      updateOnboarding({ ...state, setupRequest: `Correct the first-closeout handoff: your previous output was missing a closing request or choice cards. Send one choice card with its set number for each missing set: ${missingSets.join(', ')}. The valid actions were already saved.`,
        setupNotice: skippedNote([...skipped, 'missing kickoff choices']) })
      throw new Error('The agent did not finish the first-closeout choices. Your profile is saved; ask the agent to continue.')
    }
    const state = applyReplyActions(reply.actions)
    updateOnboarding({ ...state, forwarded: true, setupStep: 'ready', kickoffPending: false, setupRequest: null, setupNotice: skippedNote(skipped),
      ...(reply.sessionId ? { chatSessionId: reply.sessionId } : {}),
      chat: [...state.chat, { id: 'onboard-first-closeout', role: 'agent', at: Date.now(), text: reply.question, cards, actions: reply.actions, ...(skipped.length ? { skipped } : {}) }],
    })
  })()
  try { await kickoff } finally { kickoff = null }
}
