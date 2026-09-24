import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import type { RunShift } from '@/bench/engine.js'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, Tag } from '@/components/ui'
import { titleCase } from '@/lib/utils'
import type { DeskCycle } from '@/lib/desk'
import { getOnboarding, useOnboarding } from '@/lib/onboarding'
import { defaultThreadParty, readThreadInput, recordThreadAction, recordThreadInput, threadFor, type Draft, type ThreadAction, type ThreadEntry, type ThreadParty } from '@/lib/threads'
import './thread.css'
import './thread-draft.css'

function Time({ at }: { at: string }) {
  const date = new Date(at)
  if (!Number.isFinite(date.getTime())) return <span className="mono">Time not recorded</span>
  return <time className="mono" dateTime={at} title={date.toLocaleString('en-US', { hour12: true })}>{date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</time>
}

function MessageBubble({ entry, name }: { entry: ThreadEntry; name: string }) {
  const label = entry.dir === 'internal' ? 'Payroll Agent' : entry.dir === 'in' ? name : 'You'
  return <article className={`thread-bubble ${entry.dir}`}>
    <div className="thread-label">{label} · <Time at={entry.at} /></div>
    {entry.subject && <p className="thread-subject">{entry.subject}</p>}
    <p className="thread-text">{entry.text}</p>
  </article>
}

function DraftCard({ draft, onAction }: { draft: Draft; onAction(action: ThreadAction): void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(draft.text)
  const editor = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const input = editor.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [text, editing])

  function save() {
    if (!text.trim()) return
    onAction({ type: 'edit', text: text.trim(), at: new Date().toISOString() })
    setEditing(false)
  }

  return <section className="thread-draft" aria-label="Pending outbound draft">
    <div className="thread-draft-body">
      <div className="thread-draft-subject"><p className="thread-subject">{draft.subject}</p><Tag tone="blue">Pending</Tag></div>
      {editing ? <textarea ref={editor} className="thread-editor" aria-label="Edit draft message" value={text} rows={3} autoFocus
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(false); setText(draft.text) }
        }} />
        : <p className="thread-text">{draft.text}</p>}
    </div>
    <div className="thread-draft-actions">
      <div className="thread-draft-primary-actions">
      {editing ? <>
        <Btn className="primary" disabled={!text.trim()} onClick={save}>Save</Btn>
        <Btn onClick={() => { setEditing(false); setText(draft.text) }}>Cancel</Btn>
      </> : <>
        <Btn className="primary" onClick={() => onAction({ type: 'send', text: draft.text, draft: true, at: new Date().toISOString() })}>Send</Btn>
        <Btn onClick={() => { setText(draft.text); setEditing(true) }}>Edit</Btn>
      </>}
      </div>
      {!editing && <Btn className="thread-draft-skip" onClick={() => onAction({ type: 'dismiss', at: new Date().toISOString() })}>Skip</Btn>}
    </div>
  </section>
}

export function Thread({ cycle, rs }: { cycle: DeskCycle; rs?: RunShift }) {
  return rs ? <PaymentThread key={`${cycle.id}:${rs.shift.id}`} cycle={cycle} rs={rs} />
    : <div className="thread-empty" aria-label="No conversation"><MessageSquare size={20} aria-hidden="true" /></div>
}

function PaymentThread({ cycle, rs }: { cycle: DeskCycle; rs: RunShift }) {
  const [params, setParams] = useSearchParams()
  const [state] = useOnboarding()
  const payment = state.resolutions[cycle.id]?.[rs.shift.id] ? { ...rs, flagged: false, held: false, rows: [] } : rs
  const defaultParty = defaultThreadParty(cycle, payment)
  const legacyParty = defaultThreadParty({ ...cycle, rememberedRuleIds: [] }, rs)
  const requested = params.get('with')
  const party = requested === 'worker' || requested === 'facility' ? requested : defaultParty

  useEffect(() => {
    if (requested === party) return
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('with', party)
      return next
    }, { replace: true })
  }, [requested, party, setParams])

  function selectParty(nextParty: ThreadParty) {
    if (nextParty === party) return
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('with', nextParty)
      return next
    })
  }

  const switcher = <div className="thread-party-switch" role="group" aria-label="Conversation recipient">
    {(['worker', 'facility'] as const).map((option) => <button type="button" key={option}
      aria-pressed={party === option} onClick={() => selectParty(option)}>
      {option === 'worker' ? 'Worker' : 'Facility'}
    </button>)}
  </div>
  return <PartyThread key={party} cycle={cycle} rs={payment} party={party} legacyParty={legacyParty} switcher={switcher} />
}

function PartyThread({ cycle, rs, party, legacyParty, switcher }: { cycle: DeskCycle; rs: RunShift; party: ThreadParty; legacyParty: ThreadParty; switcher: ReactNode }) {
  const [state, update] = useOnboarding()
  const { toast } = useOverlay()
  const composer = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const legacyKey = `${cycle.id}:${rs.shift.id}`
  const key = `${legacyKey}:${party}`
  // Earlier conversations belonged to the routed recipient. Never copy them to both parties.
  const saved = state.mediation[key] ?? (party === legacyParty ? state.mediation[legacyKey] : undefined)
  const message = readThreadInput(saved)
  const thread = threadFor(cycle, rs, saved, party)

  useLayoutEffect(() => {
    const input = composer.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [message])

  function setMessage(text: string) {
    const mediation = getOnboarding().mediation
    const latest = mediation[key] ?? (party === legacyParty ? mediation[legacyKey] : undefined)
    update({ mediation: { ...mediation, [key]: recordThreadInput(latest, text) } })
  }

  function act(action: ThreadAction) {
    // Other panes share this store; read at the action boundary so their latest changes are retained.
    const mediation = getOnboarding().mediation
    const latest = mediation[key] ?? (party === legacyParty ? mediation[legacyKey] : undefined)
    update({ mediation: { ...mediation, [key]: recordThreadAction(latest, action) } })
    if (action.type === 'send') {
      toast(`Message sent to ${thread.counterparty.name}`)
      requestAnimationFrame(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight })
    }
  }

  function send() {
    if (!message.trim()) return
    act({ type: 'send', text: message.trim(), at: new Date().toISOString() })
    setMessage('')
    composer.current?.focus()
  }

  return <>
    <header className="aux-head thread-titlebar">
      <span className="thread-title">{thread.counterparty.name} · {thread.channel}</span>
      {thread.askedAt && <Tag tone="amber">{titleCase(`Waiting on ${party}`)}</Tag>}
      {switcher}
    </header>
    <div className="thread">
    <div ref={log} className="thread-log scroll" role="log" aria-live="polite" aria-label={`Conversation with ${thread.counterparty.name}`}>
      {thread.entries.map((entry) => <MessageBubble key={entry.id} entry={entry} name={thread.counterparty.name} />)}
      {thread.draft && <DraftCard key={thread.draft.id} draft={thread.draft} onAction={act} />}
      {!thread.entries.length && !thread.draft && <div className="thread-empty" aria-label="No messages"><MessageSquare size={20} aria-hidden="true" /></div>}
    </div>
    <form className="chat-composer thread-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
      <textarea ref={composer} className="chat-input" rows={1} aria-label={`Message ${thread.counterparty.name}`} placeholder={`Message ${thread.counterparty.name}…`}
        value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
        }} />
      <button type="submit" className="icon-btn chat-send" aria-label="Send message" disabled={!message.trim()}><Send size={16} aria-hidden="true" /></button>
    </form>
    </div>
  </>
}
