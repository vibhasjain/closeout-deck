/* eslint-disable react-refresh/only-export-components -- The scoped chat module exports its provider and page hooks together. */
import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Plus, Send, Square } from 'lucide-react'
import { ThinkingOrb } from 'thinking-orbs'
import { Chip } from '@/components/ui'
import { Message } from '@/components/chat/Message'
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

function selectionScope(selection?: object): string | undefined {
  if (!selection) return undefined
  if ('scope' in selection && typeof selection.scope === 'string') return selection.scope
  if ('key' in selection && typeof selection.key === 'string') return selection.key
  if ('shiftId' in selection && typeof selection.shiftId === 'string') return `shift:${selection.shiftId}`
  return undefined
}

export function ChatPane({ scope: explicitScope, headerAction }: { scope?: string; headerAction?: ReactNode } = {}) {
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
  // Keep "Show all" in the URL, but only for the case where it was chosen.
  const showAll = !scope || (params.get('chat') === 'all' && params.get('chatScope') === scope)
  const messages = showAll ? state.chat : state.chat.filter((message) => message.scope === scope)
  const showRequest = showAll || requestScope === scope

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
    if (!message) return
    if (busy.current) { if (options) queued.current.push(options); return }
    const previous = latest.current.chat.at(-1)
    const fileIds = options?.mode === 'ingest' && options.context && 'fileIds' in options.context
      ? [...options.context.fileIds] : options?.mode ? [] : [...(previous?.ingestFileIds ?? [])]
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
              if (action.type !== 'open_form') await applyAction(action, update, navigate, params, context.cycle?.id)
              applied.push(action)
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
  }, [context, navigate, params, scope, update])

  useEffect(() => { sendRef.current = send }, [send])
  useEffect(() => {
    const post = (event: Event) => {
      const turn = (event as CustomEvent<ChatPost>).detail
      if (turn && typeof turn.text === 'string') {
        setParams((current) => { const next = new URLSearchParams(current); next.set('agent', '1'); return next })
        void sendRef.current(turn.text, turn)
      }
    }
    window.addEventListener(CHAT_POST_EVENT, post)
    return () => window.removeEventListener(CHAT_POST_EVENT, post)
  }, [setParams])

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
    <section className="queue chat" aria-label="Closeout Agent conversation">
      <header className="chat-header">
        <div className="chat-heading">
          <ThinkingOrb size={20} theme="light" state={sending ? 'working' : 'breathing'} />
          <h2>Closeout Agent</h2>
        </div>
        {headerAction && <div className="chat-header-actions">{headerAction}</div>}
      </header>
      <div ref={scrollRef} className="chat-log" role="log" aria-live="polite" aria-label="Conversation with Closeout Agent">
        {scope && (
          <div className="flex shrink-0 items-center justify-between gap-2">
            <span className="chat-scope-label">This case</span>
            <button type="button" className="lnk" onClick={toggleScope}>{showAll ? 'Show this case' : 'Show all'}</button>
          </div>
        )}
        {messages.length === 0 && !(showRequest && (sending || reply || error)) && (
          <div className="chat-empty">
            <ThinkingOrb size={32} theme="light" state="breathing" />
            <p>Ask the Closeout Agent about your Payroll</p>
          </div>
        )}
        {messages.map((message, index) => {
          const divider = dayDivider(message.at, messages[index - 1]?.at)
          return (
            <Fragment key={message.id}>
              {divider && <div className="chat-day-divider"><span>{divider}</span></div>}
              <Message message={message} onAnswer={index === messages.length - 1 && !sending ? (answer) => { void send(answer) } : undefined} />
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
            <Chip key={suggestion} disabled={sending} onClick={() => { void send(suggestion) }}>{suggestion}</Chip>
          ))}
        </div>
      )}
      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(draft) }}>
        <input ref={filePicker} className="chat-file-input" type="file" multiple tabIndex={-1} aria-label="Attach files"
          onChange={(event) => { attach(event.target.files); event.target.value = '' }} />
        <button type="button" className="icon-btn chat-attach" aria-label="Attach files" disabled={sending}
          onClick={() => filePicker.current?.click()}>
          <Plus size={16} aria-hidden="true" />
        </button>
        <textarea
          ref={composer} className="chat-input" aria-label="Message the Closeout Agent" placeholder="Ask the Closeout Agent anything…" rows={1} value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send(draft)
            }
          }}
        />
        {/* P6 can add the phone state here; the composer keeps one trailing action. */}
        <button type={sending ? 'button' : 'submit'} className="icon-btn chat-send" aria-label={sending ? 'Stop reply' : 'Send message'}
          disabled={!sending && !draft.trim()} onClick={sending ? stop : undefined}>
          {sending ? <Square size={14} fill="currentColor" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
        </button>
      </form>
    </section>
  )
}
