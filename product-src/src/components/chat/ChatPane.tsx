/* eslint-disable react-refresh/only-export-components -- The scoped chat module exports its provider and page hooks together. */
import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { NavigateFunction } from 'react-router-dom'
import { Loader2, Plus, Send, Square } from 'lucide-react'
import { ThinkingOrb } from 'thinking-orbs'
import { Chip } from '@/components/ui'
import { Message } from '@/components/chat/Message'
import { dayDivider } from '@/components/chat/dayDivider'
import { parseActions, stream } from '@/lib/chat'
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
  const [error, setError] = useState<string | null>(null)
  const [requestScope, setRequestScope] = useState<string | undefined>()
  const latest = useRef(state)
  const request = useRef(0)
  const busy = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const activeRequest = useRef<{ controller: AbortController; text: string; scope?: string } | null>(null)
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
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: message, at: Date.now(), scope }
    busy.current = true
    const pending = { controller: new AbortController(), text: '', scope }
    activeRequest.current = pending
    update((current) => ({ chat: [...current.chat, user] }))
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
      for await (const event of stream(message, context, 'chat', pending.controller.signal)) {
        if (request.current !== requestId) return
        if (event.text) {
          textSoFar += event.text
          pending.text = textSoFar
          setReply(textSoFar)
        }
        if (event.error) throw new Error(event.error)
        if (event.done) {
          const parsed = parseActions(event.final ?? textSoFar)
          if (!parsed.actions.every(isAction)) throw new Error('The agent returned an invalid change. Please ask it to try again.')
          const agent: ChatMessage = { id: crypto.randomUUID(), role: 'agent', ...parsed, at: Date.now(), scope }
          update((current) => ({
            chat: [...current.chat, agent], chatSessionId: event.sessionId ?? current.chatSessionId,
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
        activeRequest.current = null
        busy.current = false
        setSending(false)
        setThinking(false)
      }
    }
  }, [context, navigate, params, scope, update])

  function stop() {
    const pending = activeRequest.current
    request.current += 1
    pending?.controller.abort()
    // A stopped reply stays in the conversation, but never applies unfinished actions.
    const text = parseActions(pending?.text ?? '').text.replace(/```action[\s\S]*$/, '').trim()
    if (text) update((current) => ({ chat: [...current.chat, {
      id: crypto.randomUUID(), role: 'agent', text, at: Date.now(), scope: pending?.scope,
    }] }))
    activeRequest.current = null
    busy.current = false
    setReply('')
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
              <Message message={message} />
            </Fragment>
          )
        })}
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
