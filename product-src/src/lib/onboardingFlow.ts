import { API_BASE } from '@/lib/api'
import { appendTrace, limitCards, parseActions, parseCards, stream, type QuestionCard, type Action, type OnboardContext } from '@/lib/chat'
import { applyAction, authorityPatch, isAction, safeModelCard, safeModelText, skippedLine, validatedActions } from '@/lib/chatActions'
import { getDataSnapshot, loadData } from '@/lib/data'
import { ASK_FIRST, effectiveAuthority, flushOnboarding, getOnboarding, inboxAddress, updateOnboarding, type FirmFacts, type Onboarding } from '@/lib/onboarding'
import { expireSession, viewerSession } from '@/lib/viewerSession'

export const authHeaders = () => {
  const token = viewerSession()?.sessionToken
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

export async function readFirm(domain: string, signal?: AbortSignal): Promise<FirmFacts> {
  const response = await fetch(`${API_BASE}/firm`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ domain }), signal })
  if (response.status === 401) expireSession()
  if (!response.ok) throw new Error('The firm website could not be read. Check the website and try again.')
  const { firm } = await response.json()
  if (!firm || typeof firm.name !== 'string' || !isAction({ type: 'set_firm', patch: firm })) throw new Error('The firm read was incomplete. Try again.')
  return firm
}

export interface OnboardReply { question: string; card: QuestionCard | { kind: 'onboard_complete' }; actions: Action[]; sessionId?: string; skipped?: string[]; traces?: string[] }

export function onboardContext(): OnboardContext {
  const state = getOnboarding()
  return { firm: state.firm, profile: state.profile, covered: state.covered, sources: state.sources,
    inbox: inboxAddress(viewerSession()?.email ?? null), authorityConfigured: state.authorityConfigured, authority: effectiveAuthority(state) }
}

async function agentTurn(message: string, context: OnboardContext, signal?: AbortSignal) {
  // The in-turn context still carries current edits when an unrelated state save fails.
  await flushOnboarding().catch(() => {})
  let text = '', finished = false, sessionId: string | undefined
  let traces: string[] = []
  for await (const event of stream(message, context, 'onboard', signal)) {
    if (event.error) throw new Error(event.error)
    if (event.text) text += event.text
    if (event.trace) traces = appendTrace(traces, event.trace)
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
  return { question: safeModelText(reply.text, context.firm), cards, actions, skipped, sessionId, traces }
}

/** Keep valid parts of model output and ask a corrective follow-up only if no usable card remains. */
export async function requestOnboarding(message: string, signal?: AbortSignal): Promise<OnboardReply> {
  if (getOnboarding().forwarded) updateOnboarding({ forwarded: false })
  // ponytail: the retry note lives in memory; a reload drops it and the notice alone remains.
  const reply = await agentTurn(retry ? `${message}\n\n${retry}` : message, onboardContext(), signal)
  retry = ''
  const card = reply.cards.find((item): item is QuestionCard | { kind: 'onboard_complete' } => item.kind === 'question' || item.kind === 'onboard_complete')
  if (!card || (card.kind === 'question' && !reply.question.trim())) {
    const state = applyReplyActions(reply.actions)
    updateOnboarding({ ...state, setupRequest: 'Your last reply did not contain a readable question card. The valid actions were saved. Send the next question with one valid card, or your closing line with onboard_complete.',
      setupNotice: skippedNote([...reply.skipped, 'card']), ...(reply.sessionId ? { chatSessionId: reply.sessionId } : {}) })
    throw new Error('The last card was unreadable. Retry asks the agent to correct it; saved answers are still available.')
  }
  if (reply.cards.length > 1) reply.skipped.push('extra cards')
  return { ...reply, card }
}

/** Setup has no retry button: the next answer carries the correction, and the notice says so. */
let retry = ''
function skippedNote(skipped: string[]) {
  if (!skipped.length) return null
  const { text, retry: again } = skippedLine([...new Set(skipped)])
  if (again) retry = `App note: the app could not save these parts of your previous reply: ${[...new Set(skipped)].join(', ')}. Send them again in the documented action formats, recording only what I said.`
  return again ? `${text} I'll try again with your next answer.` : text
}
export const ONBOARD_ALLOWED_ACTIONS = ['set_profile', 'set_firm', 'add_source', 'remove_source', 'remove_rule', 'set_authority', 'never_contact', 'cover_topic', 'set_calendar', 'add_cohort', 'add_rule', 'note']
function applyReplyActions(actions: Action[]) {
  let state = getOnboarding()
  for (const action of actions) {
    if (!ONBOARD_ALLOWED_ACTIONS.includes(action.type)) continue
    applyAction(action, (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) } }, () => {}, new URLSearchParams())
  }
  return state
}
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/** Arrangements the agent may not add on its own: its offer to take forwards is not how the firm works until the user says so. */
const ARRANGED = /\b(?:forward\w*|screenshots?|photos?|to me)\b/gi
const AGREED = /^\s*(?:yes|yeah|yep|sure|ok(?:ay)?|sounds good|please do|that works|do that)\b/i
/** ponytail: a word check, not a meaning check; it catches the invented forwarding/screenshot arrangements QA saw. */
function inventsArrangement(action: Action, state: Onboarding): boolean {
  if (action.type !== 'set_profile' && action.type !== 'add_source') return false
  const latest = state.setupHistory.at(-1)
  const said = [...state.setupHistory.map((entry) => entry.answer ?? ''), state.firm?.summary ?? '',
    ...(latest?.answer && AGREED.test(latest.answer) ? [latest.question] : [])].join(' ')
  const text = JSON.stringify(action.type === 'set_profile' ? action.value : [action.label, action.how ?? ''])
  return [...text.matchAll(ARRANGED)].some(([word]) => !new RegExp(`\\b${word.slice(0, 5)}`, 'i').test(said))
}

type AuthorityPatch = Partial<Onboarding['authority']>
/** P6: an explicit answer to the authority goal is consent and applies now; only an amount the user never said stays a suggestion. */
function authorityConsent(before: Onboarding, answer: string, actions: Action[]): { state: Pick<Onboarding, 'authority' | 'authorityConfigured' | 'authoritySuggestion'>; saved: AuthorityPatch; suggested: AuthorityPatch | null } | null {
  const amounts = [...answer.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)].map((match) => Number(match[1].replace(/,/g, '')))
  // An ask-first answer with no amounts is a blanket restriction, whatever the model proposed.
  if (!amounts.length && /\b(ask (?:me )?(?:first|before)|nothing (?:on your own|without)|spend nothing)\b/i.test(answer)) {
    return { state: { authorityConfigured: true, authority: { ...ASK_FIRST, briefing: before.authority.briefing }, authoritySuggestion: null },
      saved: { autoFix: false, textSupervisors: false, textWorkers: false }, suggested: null }
  }
  const patches = actions.flatMap((action) => action.type === 'set_authority' ? [authorityPatch(action.patch)] : [])
  if (!patches.length) return null
  const saved: AuthorityPatch = {}, suggestion: AuthorityPatch = {}
  for (const [key, value] of Object.entries(Object.assign({}, ...patches) as AuthorityPatch)) {
    Object.assign(typeof value !== 'number' || value === 0 || amounts.some((amount) => amount >= value) ? saved : suggestion, { [key]: value })
  }
  // Unstated permissions stay off and an unstated weekly cap stays unset: "ask before anything over $100" sets no weekly total.
  const base = before.authorityConfigured ? before.authority : { ...ASK_FIRST, briefing: before.authority.briefing }
  const authority = { ...base, ...saved }
  // The Rulebook may offer the suggested weekly cap as an optional change the user confirms; the profile never states it.
  const offered = authority.autoFix && authority.weeklyCap === null && suggestion.weeklyCap === undefined && before.authority.weeklyCap ? { weeklyCap: before.authority.weeklyCap } : {}
  const all = { ...offered, ...suggestion }
  return { state: { authorityConfigured: true, authority, authoritySuggestion: Object.keys(all).length ? all : null }, saved, suggested: Object.keys(suggestion).length ? suggestion : null }
}

export function applyOnboardReply(reply: OnboardReply) {
  const before = getOnboarding()
  const checked = validatedActions(reply.actions, before.firm)
  const invented = checked.actions.filter((action) => inventsArrangement(action, before))
  checked.actions = checked.actions.filter((action) => !invented.includes(action))
  checked.skipped.push(...invented.map((action) => `${action.type}: it recorded something the user did not say`))
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
  const answer = history[at]?.card.topics.includes('authority') ? history[at].answer : undefined
  const consent = answer === undefined ? null : authorityConsent(before, answer, checked.actions)
  if (consent) Object.assign(patch, consent.state)
  // The Applied line says exactly what was saved now and what still waits in the Rulebook.
  const shown: unknown[] = consent ? [...checked.actions.filter((action) => action.type !== 'set_authority'),
    ...(Object.keys(consent.saved).length ? [{ type: 'set_authority', patch: consent.saved, consent: true }] : []),
    ...(consent.suggested ? [{ type: 'set_authority', patch: consent.suggested }] : [])] : checked.actions
  if (reply.card.kind === 'onboard_complete') {
    patch.setupStep = 'writing'
    patch.setupClosing = reply.question
    patch.chat = [...state.chat.filter((message) => message.id !== 'onboard-closing'), { id: 'onboard-closing', role: 'agent', text: reply.question, traces: reply.traces, at: Date.now(), actions: shown, ...(skipped.length ? { skipped } : {}) }]
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
    if (response.status === 401) expireSession()
    if (response.status === 404 || response.status === 501) break
    if (!response.ok) throw new Error('The upload failed. Try those files again.')
  }
  return files.map((file) => file.name)
}

/** A set counts only when time entries or a connected source exist for it. Setup source plans are not data. */
async function setsWithoutData(): Promise<(1 | 2 | 3)[]> {
  await loadData()
  const data = getDataSnapshot()
  return ([1, 2, 3] as const).filter((set) => !data.sources.some((source) => source.set === set) && !data.list.some((cycle) => cycle.counts[`set${set}`] > 0))
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
    const missingSets = await setsWithoutData()
    const reply = await agentTurn(getOnboarding().setupRequest || 'Finish setup and start my first closeout using the sources I have provided.', { ...context, phase: 'first_closeout', missingSets })
    const seen = new Set<number>(), skipped = [...reply.skipped]
    const cards = reply.cards.filter((card) => {
      if (card.kind === 'task' || card.kind === 'findings' || card.kind === 'form') return true
      if (card.kind === 'choice' && card.set && missingSets.includes(card.set) && !seen.has(card.set)) { seen.add(card.set); return true }
      if (card.kind === 'question' && card.input === 'choice' && card.set && missingSets.includes(card.set) && !seen.has(card.set)) { seen.add(card.set); return true }
      skipped.push('unexpected kickoff card'); return false
    })
    if (!reply.question || (!cards.some(card => card.kind === 'task' || (card.kind === 'form' && card.form === 'connect')) && missingSets.some((set) => !seen.has(set)))) {
      const state = applyReplyActions(reply.actions)
      updateOnboarding({ ...state, setupRequest: `Correct the first-closeout handoff: your previous output was missing a closing request or choice cards. Send one choice card with its set number for each missing set: ${missingSets.join(', ')}. The valid actions were already saved.`,
        setupNotice: skippedNote([...skipped, 'missing kickoff choices']) })
      throw new Error('The agent did not finish the first-closeout choices. Your profile is saved; ask the agent to continue.')
    }
    const state = applyReplyActions(reply.actions)
    const bounded = limitCards(cards)
    if (bounded.skipped) skipped.push('extra cards')
    updateOnboarding({ ...state, forwarded: true, setupStep: 'ready', kickoffPending: false, setupRequest: null, setupNotice: skippedNote(skipped),
      ...(reply.sessionId ? { chatSessionId: reply.sessionId } : {}),
      chat: [...state.chat, { id: 'onboard-first-closeout', role: 'agent', at: Date.now(), text: reply.question, traces: reply.traces, cards: bounded.cards, actions: reply.actions, ...(skipped.length ? { skipped } : {}) }],
    })
  })()
  try { await kickoff } finally { kickoff = null }
}
