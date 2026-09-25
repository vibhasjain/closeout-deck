/* eslint-disable react-refresh/only-export-components -- The scoped chat module exports its provider and page hooks together. */
import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUp, Loader2, Mic, Phone, Plus, Square } from 'lucide-react'
import { AgentAvatar } from '@/components/chat/AgentAvatar'
import { Chip } from '@/components/ui'
import { Message } from '@/components/chat/Message'
import { memoryHistory } from '@/components/memory/chatMemory'
import { CallBar } from '@/components/voice/CallBar'
import { useVoiceCall } from '@/lib/useVoiceCall'
import { useDictation } from '@/lib/useDictation'
import { VOICE_ENABLED } from '@/lib/flags'
import { dayDivider } from '@/components/chat/dayDivider'
import { appendTrace, limitCards, parseActions, parseCards, stream } from '@/lib/chat'
import type { ChatContext } from '@/lib/chat'
import { CHAT_POST_EVENT, reportIngest, type ChatPost } from '@/lib/chatBus'
import { invalidate } from '@/lib/data'
import { FREQUENCIES, WEEKDAYS, effectiveAuthority, inboxAddress, flushOnboarding, getOnboarding, useOnboarding } from '@/lib/onboarding'
import type { ChatMessage } from '@/lib/onboarding'
import { viewerSession } from '@/lib/viewerSession'
import { applyAction, validatedActions, safeModelCard, safeModelText, type ChatUpdate } from '@/lib/chatActions'
export { applyAction, isAction, actionSummary } from '@/lib/chatActions'
export { postToChat } from '@/lib/chatBus'

const PageContext = createContext<Partial<ChatContext>>({})
const SetPageContext = createContext<Dispatch<SetStateAction<Partial<ChatContext>>>>(() => {})
const SuggestionsContext = createContext<string[]>([])
const SetSuggestionsContext = createContext<Dispatch<SetStateAction<string[]>>>(() => {})
const COMPOSER_FOCUS_EVENT = 'closeout:focus-chat-composer'

/** Let a case send its exact correction prompt to the always-mounted composer. */
export function focusChatComposer(prefill: string) {
  window.dispatchEvent(new CustomEvent<string>(COMPOSER_FOCUS_EVENT, { detail: prefill }))
}

/** Mount around both ChatPane and the routed pages inside the router. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<Partial<ChatContext>>({})
  const [suggestions, setSuggestions] = useState<string[]>([])
  return (
    <SetPageContext.Provider value={setContext}>
      <SetSuggestionsContext.Provider value={setSuggestions}>
        <PageContext.Provider value={context}>
          <SuggestionsContext.Provider value={suggestions}>{children}</SuggestionsContext.Provider>
        </PageContext.Provider>
      </SetSuggestionsContext.Provider>
    </SetPageContext.Provider>
  )
}

export function useChatContext(): ChatContext {
  const partial = useContext(PageContext)
  const [state] = useOnboarding()
  const { pathname } = useLocation()
  return {
    ...partial,
    page: partial.page ?? pathname,
    calendar: {
      ...partial.calendar,
      frequency: state.frequency, periodEndDay: state.periodEndDay, payDay: state.payDay,
      payDatesOfMonth: state.payDatesOfMonth, cutoffDays: state.cutoffDays, deadlineDays: state.deadlineDays,
      cohorts: state.cohorts, frequencies: FREQUENCIES, weekdays: WEEKDAYS,
    },
    discrepancies: partial.discrepancies?.slice(0, 10),
    connections: state.connections,
    firm: state.firm, profile: state.profile, sources: state.sources,
    inbox: inboxAddress(viewerSession()?.email ?? null), authorityConfigured: state.authorityConfigured, authority: effectiveAuthority(state),
  }
}

/** JSON dependencies let pages pass inline context without a provider update loop. */
export function useSetChatContext(partial: Partial<ChatContext>, active = true) {
  const setContext = useContext(SetPageContext)
  const serialized = JSON.stringify(partial)
  useEffect(() => {
    if (!active) return
    setContext(JSON.parse(serialized) as Partial<ChatContext>)
    return () => setContext({})
  }, [serialized, setContext, active])
}

export function useChatSuggestions() {
  return useContext(SuggestionsContext)
}

export function useSetChatSuggestions(suggestions: string[], active = true) {
  const setSuggestions = useContext(SetSuggestionsContext)
  const serialized = JSON.stringify(suggestions)
  useEffect(() => {
    if (!active) return
    setSuggestions(JSON.parse(serialized) as string[])
    return () => setSuggestions([])
  }, [serialized, setSuggestions, active])
}

/** H3: only the newest actionable card keeps a black button; older ones are superseded. */
export function newestActionableCard(messages: ChatMessage[]): { id: string; index: number } | undefined {
  for (let m = messages.length - 1; m >= 0; m--) {
    const cards = messages[m].cards ?? []
    for (let index = cards.length - 1; index >= 0; index--) {
      if (['form', 'findings', 'choice', 'question'].includes(cards[index].kind)) return { id: messages[m].id, index }
    }
  }
}

function selectionScope(selection?: object): string | undefined {
  if (!selection) return undefined
  if ('scope' in selection && typeof selection.scope === 'string') return selection.scope
  if ('key' in selection && typeof selection.key === 'string') return selection.key
  if ('shiftId' in selection && typeof selection.shiftId === 'string') return `shift:${selection.shiftId}`
  return undefined
}

export function ChatPane({ scope: explicitScope, headerAction, onCallingChange }: { scope?: string; headerAction?: ReactNode; onCallingChange?(calling: boolean): void } = {}) {
  const [state, write] = useOnboarding()
  const context = useChatContext()
  const suggestions = useChatSuggestions()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [reply, setReply] = useState('')
  const [traces, setTraces] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [requestScope, setRequestScope] = useState<string | undefined>()
  const latest = useRef(state)
  const request = useRef(0)
  const busy = useRef(false)
  const queued = useRef<ChatPost[]>([])
  const sendRef = useRef<(text: string, options?: ChatPost) => Promise<void>>(async () => {})
  const scrollRef = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const activeRequest = useRef<{ controller: AbortController; text: string; scope?: string; fileIds: string[]; traces: string[]; agentId?: string } | null>(null)
  const scope = explicitScope ?? selectionScope(context.selection)
  const voice = useVoiceCall('desk', context.cycle?.id, scope, () => context)
  const dictation = useDictation(draft, setDraft)
  const calling = !!voice.snapshot && voice.snapshot.status !== 'ended'
  // Keep "Show all" in the URL, but only for the case where it was chosen.
  const showAll = !scope || (params.get('chat') === 'all' && params.get('chatScope') === scope)
  const history = memoryHistory(state.chat)
  const messages = showAll ? history : history.filter((message) => message.scope === scope)
  const liveCard = newestActionableCard(messages)
  const showRequest = showAll || requestScope === scope

  useEffect(() => { onCallingChange?.(calling) }, [calling, onCallingChange])
  useEffect(() => { latest.current = state }, [state])
  useEffect(() => () => {
    request.current += 1
    activeRequest.current?.controller.abort()
  }, [])
  useEffect(() => {
    let focusFrame = 0
    function focus(event: Event) {
      const prefill = (event as CustomEvent<unknown>).detail
      if (typeof prefill !== 'string') return
      setDraft(prefill)
      composer.current?.focus()
      window.cancelAnimationFrame(focusFrame)
      focusFrame = window.requestAnimationFrame(() => {
        const input = composer.current
        input?.focus()
        input?.setSelectionRange(prefill.length, prefill.length)
      })
    }
    window.addEventListener(COMPOSER_FOCUS_EVENT, focus)
    return () => {
      window.removeEventListener(COMPOSER_FOCUS_EVENT, focus)
      window.cancelAnimationFrame(focusFrame)
    }
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.chat, reply, traces, sending, thinking, error, scope, showAll])
  useLayoutEffect(() => {
    const el = composer.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [draft])

  // Advance the snapshot on every write so several actions in one reply accumulate.
  const update = useCallback<ChatUpdate>((patch) => {
    const current = getOnboarding()
    const next = typeof patch === 'function' ? patch(current) : patch
    latest.current = { ...current, ...next }
    write(next)
  }, [write])

  const send = useCallback(async (text: string, options?: ChatPost) => {
    const message = text.trim()
    if (!message || calling) return
    if (busy.current) { if (options) queued.current.push(options); return }
    const previous = memoryHistory(latest.current.chat).at(-1)
    // Only a typed answer to the agent's mapping question continues an ingest turn; any other send is a chat turn.
    const answersMapping = !options && previous?.role === 'agent' && previous.cards?.some(card => card.kind === 'question')
    const fileIds = options?.mode === 'ingest' && options.context && 'fileIds' in options.context
      ? [...options.context.fileIds] : answersMapping ? [...(previous?.ingestFileIds ?? [])] : []
    const mode = options?.mode ?? (fileIds.length ? 'ingest' : 'chat')
    const turnContext = options?.context ?? (mode === 'ingest' ? { fileIds } : context)
    const requestId = ++request.current
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: message, at: Date.now(), scope,
      ...(options?.contextChip ? { contextChip: options.contextChip } : {}), ...(fileIds.length ? { ingestFileIds: [...fileIds] } : {}) }
    busy.current = true
    const pending: NonNullable<typeof activeRequest.current> = { controller: new AbortController(), text: '', scope, fileIds, traces: [] as string[] }
    activeRequest.current = pending
    update((current) => ({ chat: [...current.chat, user] }))
    setDraft('')
    setError(null)
    setReply('')
    setTraces([])
    setThinking(false)
    setRequestScope(scope)
    setSending(true)
    const timer = window.setTimeout(() => {
      if (request.current === requestId) setThinking(true)
    }, 300)
    let textSoFar = ''
    let completed = false
    try {
      await flushOnboarding().catch(() => { /* durable sync retries separately; the current profile is in turnContext */ })
      if (request.current !== requestId || pending.controller.signal.aborted) return
      for await (const event of stream(message, turnContext, mode, pending.controller.signal)) {
        if (request.current !== requestId) return
        if (event.ingest) {
          if (event.ingest.status === 'normalized') {
            const at = fileIds.indexOf(event.ingest.fileId)
            if (at >= 0) fileIds.splice(at, 1)
          }
          reportIngest(event.ingest)
          void invalidate()
        }
        if (event.facts) void invalidate()
        if (event.trace) {
          pending.traces = appendTrace(pending.traces, event.trace)
          setTraces(pending.traces)
        }
        if (event.text) {
          textSoFar += event.text
          pending.text = textSoFar
          setReply(textSoFar)
        }
        if (event.error) throw new Error(event.error)
        if (event.done) {
          const cards = parseCards(event.final ?? textSoFar)
          const parsed = parseActions(cards.text)
          const validated = validatedActions(parsed.actions, latest.current.firm)
          const skipped = [...(parsed.skipped ?? []), ...validated.skipped, ...(cards.invalid ? ['invalid card'] : [])]
          const safeCards = cards.cards.flatMap((card) => {
            const safe = safeModelCard(card, latest.current.firm)
            if (JSON.stringify(safe) !== JSON.stringify(card)) skipped.push('card URL')
            return safe ? [safe] : []
          })
          for (const action of validated.actions) if (action.type === 'open_form'
            && !safeCards.some(card => card.kind === 'form' && card.form === action.form && card.cycleId === action.cycleId)) {
            safeCards.push({ kind: 'form', form: action.form, cycleId: action.cycleId })
          }
          const bounded = limitCards(safeCards)
          if (bounded.skipped) skipped.push('extra cards')
          const skippedNotes = () => [...new Set(skipped)].slice(0, 10).map(item => item.slice(0, 200))
          const agent: ChatMessage = { id: crypto.randomUUID(), role: 'agent', text: safeModelText(parsed.text, latest.current.firm), actions: [], pendingActions: validated.actions, skipped: skippedNotes(), cards: bounded.cards, traces: pending.traces, at: Date.now(), scope,
            ...(fileIds.length ? { ingestFileIds: [...fileIds] } : {}) }
          // Persist the reply before any mutation. Pending actions have no Applied line.
          pending.agentId = agent.id
          update((current) => ({
            chat: [...current.chat, agent], chatSessionId: event.sessionId ?? current.chatSessionId,
          }))
          completed = true
          setReply('')
          setTraces([])
          const applied: typeof validated.actions = []
          const saveProgress = (remaining: typeof validated.actions) => update(current => ({
            chat: current.chat.map(message => message.id === agent.id
              ? { ...message, actions: [...applied], pendingActions: remaining, skipped: skippedNotes() } : message),
          }))
          for (let index = 0; index < validated.actions.length; index++) {
            if (request.current !== requestId || pending.controller.signal.aborted) {
              skipped.push(...validated.actions.slice(index).map(action => `${action.type}: stopped before applying`))
              saveProgress([])
              break
            }
            const action = validated.actions[index]
            try {
              const result = action.type !== 'open_form' ? await applyAction(action, update, navigate, params, context.cycle?.id) : undefined
              applied.push(result ?? action)
            } catch (cause) { skipped.push(`${action.type}: ${cause instanceof Error ? cause.message : 'could not apply'}`) }
            // Even when Stop arrives during a request, retain the outcome of that request.
            saveProgress(validated.actions.slice(index + 1))
          }
          break
        }
      }
      if (!completed && request.current === requestId) throw new Error('The reply ended before it finished. Please try again.')
    } catch (cause) {
      if (request.current === requestId) setError(cause instanceof Error ? cause.message : 'Could not reach the agent. Please try again.')
    } finally {
      window.clearTimeout(timer)
      if (request.current === requestId) {
        activeRequest.current = null
        busy.current = false
        setSending(false)
        setThinking(false)
        const next = queued.current.shift()
        if (next) void sendRef.current(next.text, next)
      }
    }
  }, [calling, context, navigate, params, scope, update])

  useEffect(() => { sendRef.current = send }, [send])
  useEffect(() => {
    const post = (event: Event) => {
      if (calling) return
      const turn = (event as CustomEvent<ChatPost>).detail
      if (turn && typeof turn.text === 'string') {
        setParams((current) => { const next = new URLSearchParams(current); next.set('agent', '1'); return next })
        void sendRef.current(turn.text, turn)
      }
    }
    window.addEventListener(CHAT_POST_EVENT, post)
    return () => window.removeEventListener(CHAT_POST_EVENT, post)
  }, [calling, setParams])

  function submitDraft() {
    if (dictation.finishing || calling) return
    if (dictation.active) void dictation.stop().then(text => send(text)).catch(() => {})
    else void send(draft)
  }
  function startDeskCall() {
    dictation.dismiss()
    void voice.start()
  }

  function stop() {
    const pending = activeRequest.current
    request.current += 1
    pending?.controller.abort()
    // Keep the saved reply while an in-flight action settles; the loop skips every later action.
    const text = safeModelText(parseCards(parseActions(pending?.text ?? '').text).text.replace(/```(?:action|card)[\s\S]*$/, '').trim(), latest.current.firm)
    if (!pending?.agentId && (text || pending?.traces.length)) update((current) => ({ chat: [...current.chat, {
      id: crypto.randomUUID(), role: 'agent', text, traces: pending?.traces, at: Date.now(), scope: pending?.scope,
      ...(pending?.fileIds.length ? { ingestFileIds: [...pending.fileIds] } : {}),
    }] }))
    activeRequest.current = null
    busy.current = false
    setReply('')
    setTraces([])
    setError(null)
    setSending(false)
    setThinking(false)
  }

  function attach(files: FileList | null) {
    if (!files?.length) return
    const names = Array.from(files, (file) => file.name).join(', ')
    update((current) => ({ chat: [...current.chat, {
      id: crypto.randomUUID(), role: 'user', text: `Attached ${names}`, at: Date.now(), scope,
    }] }))
  }

  function toggleScope() {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (!showAll && scope) {
        next.set('chat', 'all')
        next.set('chatScope', scope)
      } else {
        next.delete('chat')
        next.delete('chatScope')
      }
      return next
    })
  }

  return (
    <section className="queue chat" data-composer-action={sending ? 'stop' : draft.trim() ? 'send' : 'phone'} aria-label="Closeout Agent conversation">
      <header className="chat-header">
        <div className="chat-heading">
          <AgentAvatar size={20} working={sending} />
          <h2>Closeout Agent</h2>
        </div>
        {headerAction && <div className="chat-header-actions">{headerAction}</div>}
      </header>
      {calling && voice.snapshot && <CallBar snapshot={voice.snapshot} onMute={voice.mute} onEnd={() => { void voice.end().catch(() => {}) }} onRetry={() => { if (voice.snapshot?.errorKind === 'save') void voice.retrySave().catch(() => {}); else startDeskCall() }} onRetryTurn={voice.retryTurn} onKeepTyping={() => { voice.dismiss(); composer.current?.focus() }} />}
      <div ref={scrollRef} className="chat-log" role="log" aria-live="polite" aria-label="Conversation with Closeout Agent">
        {scope && (
          <div className="flex shrink-0 items-center justify-between gap-2">
            <span className="chat-scope-label">This case</span>
            <button type="button" className="lnk" onClick={toggleScope}>{showAll ? 'Show this case' : 'Show all'}</button>
          </div>
        )}
        {messages.length === 0 && !(showRequest && (sending || reply || error)) && (
          <div className="chat-empty">
            <AgentAvatar size={32} />
            <p>Ask the Closeout Agent about your Payroll</p>
          </div>
        )}
        {messages.map((message, index) => {
          const divider = dayDivider(message.at, messages[index - 1]?.at)
          return (
            <Fragment key={message.id}>
              {divider && <div className="chat-day-divider"><span>{divider}</span></div>}
              <Message message={message} liveCard={message.id === liveCard?.id ? liveCard.index : -1} onAnswer={index === messages.length - 1 && !sending && !calling ? (answer) => { void send(answer) } : undefined} />
            </Fragment>
          )
        })}
        {showRequest && (reply || traces.length > 0) && <Message message={{ id: 'streaming', role: 'agent', traces, text: safeModelText(parseCards(parseActions(reply).text).text.replace(/```(?:action|card)[\s\S]*$/, '').trim(), state.firm), at: 0, scope: requestScope }} />}
        {showRequest && sending && thinking && (
          <div className="chat-busy">
            <Loader2 size={12} aria-hidden="true" />
            <span>Working</span>
          </div>
        )}
        {showRequest && error && <p className="chat-error" role="alert">{error}</p>}
      </div>
      {suggestions.length > 0 && (
        <div className="chips chat-suggestions">
          {suggestions.map((suggestion) => (
            <Chip key={suggestion} disabled={sending || calling} onClick={() => { void send(suggestion) }}>{suggestion}</Chip>
          ))}
        </div>
      )}
      {dictation.error && <div className="call-error" role="alert"><p>{dictation.error}</p><div className="call-error-actions"><button type="button" className="btn" onClick={dictation.start}>Retry</button><button type="button" className="btn" onClick={() => { dictation.dismiss(); composer.current?.focus() }}>Keep typing</button></div></div>}
      {dictation.status && <p className="chat-dictate-status" role="status">{dictation.status}</p>}
      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); submitDraft() }}>
        <input ref={filePicker} className="chat-file-input" type="file" multiple tabIndex={-1} aria-label="Attach files"
          onChange={(event) => { attach(event.target.files); event.target.value = '' }} />
        <button type="button" className="icon-btn chat-attach" aria-label="Attach files" disabled={sending || calling}
          onClick={() => filePicker.current?.click()}>
          <Plus size={16} aria-hidden="true" />
        </button>
        <textarea
          ref={composer} className="chat-input" aria-label="Message the Closeout Agent" placeholder="Ask the Closeout Agent…" rows={1} value={draft} readOnly={dictation.active || dictation.finishing || calling}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submitDraft()
            }
          }}
        />
        {VOICE_ENABLED && <button type="button" className="icon-btn chat-dictate" aria-label={dictation.active ? 'Stop dictation' : 'Dictate message'} aria-pressed={dictation.active}
          disabled={sending || calling || dictation.finishing} onClick={() => { if (dictation.active) void dictation.stop().catch(() => {}); else dictation.start() }}>{dictation.finishing || dictation.state === 'connecting' ? <Loader2 className="chat-dictate-spinner" size={16} aria-hidden /> : dictation.active ? <Square size={14} fill="currentColor" aria-hidden /> : <Mic size={16} aria-hidden />}</button>}
        <button type={sending || !draft.trim() ? 'button' : 'submit'} className="icon-btn chat-send" data-action={sending ? 'stop' : draft.trim() ? 'send' : 'phone'} aria-label={sending ? 'Stop reply' : draft.trim() || !VOICE_ENABLED ? 'Send message' : 'Call your Closeout Agent'}
          disabled={!sending && (dictation.finishing || calling || (!VOICE_ENABLED && !draft.trim()))} onClick={sending ? stop : !draft.trim() && VOICE_ENABLED ? startDeskCall : undefined}>
          {sending ? <Square size={14} fill="currentColor" aria-hidden="true" /> : draft.trim() || !VOICE_ENABLED ? <ArrowUp size={16} aria-hidden="true" /> : <Phone size={16} aria-hidden="true" />}
        </button>
      </form>
    </section>
  )
}
