/* eslint-disable react-refresh/only-export-components -- The scoped chat module exports its provider and page hooks together. */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { NavigateFunction } from 'react-router-dom'
import { Loader2, Send } from 'lucide-react'
import { Chip } from '@/components/ui'
import { Message } from '@/components/chat/Message'
import { parseActions, stream, systemPrompt } from '@/lib/chat'
import type { Action, ChatContext } from '@/lib/chat'
import { agentHref } from '@/lib/navigation'
import { cycleNamed, saveCycle, slugId } from '@/lib/cohorts'
import { FREQUENCIES, WEEKDAYS, useOnboarding } from '@/lib/onboarding'
import type { ChatMessage, CustomDeskRule, Onboarding } from '@/lib/onboarding'

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

type ChatUpdate = (patch: Partial<Onboarding> | ((state: Onboarding) => Partial<Onboarding>)) => void

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// parseActions follows the wire format; check model-provided values before writing the store.
export function isAction(value: unknown): value is Action {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'set_calendar':
      return isRecord(value.patch) && Object.entries(value.patch).every(([key, field]) => {
        switch (key) {
          case 'frequency': return FREQUENCIES.some((item) => item === field)
          case 'periodEndDay':
          case 'payDay': return WEEKDAYS.some((item) => item === field)
          case 'payDatesOfMonth': return Array.isArray(field) && field.every((item) => typeof item === 'number' && Number.isFinite(item))
          case 'cutoffDays':
          case 'deadlineDays': return typeof field === 'number' && Number.isFinite(field)
          default: return false
        }
      })
    case 'add_cohort': {
      const cohort = value.cohort
      return isRecord(cohort) && typeof cohort.name === 'string' && cohort.name.trim() !== '' && typeof cohort.frequency === 'string'
        && (cohort.payDay === undefined || typeof cohort.payDay === 'string')
        && (cohort.periodEndDay === undefined || WEEKDAYS.some((item) => item === cohort.periodEndDay))
    }
    case 'add_rule':
      return typeof value.sentence === 'string' && (value.bucket === undefined || typeof value.bucket === 'string')
        && (value.kind === undefined || value.kind === 'det' || value.kind === 'llm' || value.kind === 'both')
    case 'go': return typeof value.to === 'string'
    case 'decide':
      return typeof value.cycleId === 'string' && typeof value.shiftId === 'string'
        && (value.decision === 'applied' || value.decision === 'dismissed')
        && (value.reason === undefined || typeof value.reason === 'string')
        && (value.decision !== 'dismissed' || (typeof value.reason === 'string' && value.reason.trim().length > 0))
    case 'note': return typeof value.text === 'string'
    default: return false
  }
}

export function applyAction(action: Action, update: ChatUpdate, navigate: NavigateFunction, params: URLSearchParams, cycleId?: string) {
  switch (action.type) {
    case 'set_calendar':
      update(action.patch)
      break
    case 'add_cohort':
      // A name already on file updates that cycle instead of adding a duplicate.
      update((state) => ({ cohorts: saveCycle(state.cohorts, {
        name: action.cohort.name,
        frequency: FREQUENCIES.find((value) => value === action.cohort.frequency) ?? state.frequency,
        periodEndDay: WEEKDAYS.find((value) => value === action.cohort.periodEndDay) ?? state.periodEndDay,
        payDay: WEEKDAYS.find((value) => value === action.cohort.payDay) ?? state.payDay,
        payDatesOfMonth: [...state.payDatesOfMonth],
      }, cycleNamed(state.cohorts, action.cohort.name)?.id) }))
      break
    case 'add_rule': {
      const rule: CustomDeskRule = {
        id: slugId('rule', crypto.randomUUID()), bucket: 'Custom', kind: action.kind ?? 'both',
        sentence: action.sentence, source: { doc: 'You told the agent' }, draft: false, at: Date.now(),
      }
      update((state) => ({ customRules: [...state.customRules, rule] }))
      break
    }
    case 'go':
      navigate(agentHref(action.to, params, cycleId))
      break
    case 'decide':
      update((state) => ({
        decisionTimes: { ...state.decisionTimes, [`${action.cycleId}:${action.shiftId}`]: new Date().toISOString() },
        resolutions: {
          ...state.resolutions,
          [action.cycleId]: { ...state.resolutions[action.cycleId], [action.shiftId]: action.decision },
        },
        ...(action.reason === undefined ? {} : {
          reasons: { ...state.reasons, [`${action.cycleId}:${action.shiftId}`]: action.reason.trim() },
        }),
      }))
      break
    case 'note':
      break
  }
}

function selectionScope(selection?: object): string | undefined {
  if (!selection) return undefined
  if ('scope' in selection && typeof selection.scope === 'string') return selection.scope
  if ('key' in selection && typeof selection.key === 'string') return selection.key
  if ('shiftId' in selection && typeof selection.shiftId === 'string') return `shift:${selection.shiftId}`
  return undefined
}

export function ChatPane({ scope: explicitScope }: { scope?: string } = {}) {
  const [state, write] = useOnboarding()
  const context = useChatContext()
  const suggestions = useChatSuggestions()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [requestScope, setRequestScope] = useState<string | undefined>()
  const latest = useRef(state)
  const request = useRef(0)
  const busy = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const scope = explicitScope ?? selectionScope(context.selection)
  // Keep "Show all" in the URL, but only for the case where it was chosen.
  const showAll = !scope || (params.get('chat') === 'all' && params.get('chatScope') === scope)
  const messages = showAll ? state.chat : state.chat.filter((message) => message.scope === scope)
  const showRequest = showAll || requestScope === scope

  useEffect(() => { latest.current = state }, [state])
  useEffect(() => () => { request.current += 1 }, [])
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
  }, [state.chat, reply, sending, thinking, error, scope, showAll])
  useLayoutEffect(() => {
    const el = composer.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [draft])

  // Advance the snapshot on every write so several actions in one reply accumulate.
  const update = useCallback<ChatUpdate>((patch) => {
    const next = typeof patch === 'function' ? patch(latest.current) : patch
    latest.current = { ...latest.current, ...next }
    write(next)
  }, [write])

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || busy.current) return
    const requestId = ++request.current
    const sessionId = latest.current.chatSessionId
    const history: { role: 'user' | 'assistant'; text: string }[] = latest.current.chat.slice(-20)
      .filter((m) => m.text.trim()).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }))
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: message, at: Date.now(), scope }
    busy.current = true
    update((current) => ({ chat: [...current.chat, user].slice(-200) }))
    setDraft('')
    setError(null)
    setReply('')
    setThinking(false)
    setRequestScope(scope)
    setSending(true)
    const timer = window.setTimeout(() => {
      if (request.current === requestId) setThinking(true)
    }, 300)
    let textSoFar = ''
    let completed = false
    try {
      for await (const event of stream(message, systemPrompt(context), sessionId, history)) {
        if (request.current !== requestId) return
        if (event.text) {
          textSoFar += event.text
          setReply(textSoFar)
        }
        if (event.error) throw new Error(event.error)
        if (event.done) {
          const parsed = parseActions(textSoFar)
          if (!parsed.actions.every(isAction)) throw new Error('The agent returned an invalid change. Please ask it to try again.')
          const agent: ChatMessage = { id: crypto.randomUUID(), role: 'agent', ...parsed, at: Date.now(), scope }
          update((current) => ({
            chat: [...current.chat, agent].slice(-200), chatSessionId: event.sessionId ?? current.chatSessionId,
          }))
          for (const action of parsed.actions) applyAction(action, update, navigate, params, context.cycle?.id)
          completed = true
          setReply('')
          break
        }
      }
      if (!completed && request.current === requestId) throw new Error('The reply ended before it finished. Please try again.')
    } catch (cause) {
      if (request.current === requestId) setError(cause instanceof Error ? cause.message : 'Could not reach the agent. Please try again.')
    } finally {
      window.clearTimeout(timer)
      if (request.current === requestId) {
        busy.current = false
        setSending(false)
        setThinking(false)
        composer.current?.focus()
      }
    }
  }, [context, navigate, params, scope, update])

  function clear() {
    request.current += 1
    busy.current = false
    update({ chat: [], chatSessionId: null })
    setReply('')
    setError(null)
    setSending(false)
    setThinking(false)
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
    <aside className="queue chat" aria-label="Agent">
      <div ref={scrollRef} className="chat-log" role="log" aria-live="polite" aria-label="Conversation with Agent">
        {state.chat.length > 0 && <button type="button" className="chat-clear" aria-label="Clear chat" onClick={clear}>Clear</button>}
        {scope && (
          <div className="flex shrink-0 items-center justify-between gap-2">
            <span className="lbl">This case</span>
            <button type="button" className="lnk" onClick={toggleScope}>{showAll ? 'Show This Case' : 'Show All'}</button>
          </div>
        )}
        {messages.length === 0 && !(showRequest && (sending || reply || error)) && (
          <div className="chat-empty">Ask the agent about your Payroll</div>
        )}
        {messages.map((message) => <Message key={message.id} message={message} />)}
        {showRequest && reply && <Message message={{ id: 'streaming', role: 'agent', text: reply, at: 0, scope: requestScope }} />}
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
        <textarea
          ref={composer} className="chat-input" aria-label="Message the agent" placeholder="Tell the agent…" rows={1} value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send(draft)
            }
          }}
        />
        <button type="submit" className="icon-btn chat-send" aria-label="Send message" disabled={sending || !draft.trim()}>
          <Send size={16} aria-hidden="true" />
        </button>
      </form>
    </aside>
  )
}
