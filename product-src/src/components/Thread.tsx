import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import type { RunShift } from '@/bench/engine.js'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, Tag } from '@/components/ui'
import { titleCase } from '@/lib/utils'
import type { DeskCycle } from '@/lib/desk'
import { useData } from '@/lib/data'
import { blockedCounterparty, threadErrorText } from '@/lib/contactPolicy'
import { recordMessage, useJourneyThreads, type JourneyThread } from '@/lib/journey'
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
  const label = entry.dir === 'internal' ? 'Closeout Agent' : entry.dir === 'in' ? name : 'You'
  return <article className={`thread-bubble ${entry.dir}`}>
    <div className="thread-label">{label} · <Time at={entry.at} /></div>
    {entry.subject && <p className="thread-subject">{entry.subject}</p>}
    <p className="thread-text">{entry.text}</p>
    {entry.dir === 'out' && <Tag>Not Sent · Demo</Tag>}
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

export function Thread({ cycle, rs, thread }: { cycle?: DeskCycle; rs?: RunShift; thread?: JourneyThread }) {
  if (thread) return <JourneyThreadView thread={thread} />
  if (cycle?.server) return <ServerPaymentThread cycle={cycle} rs={rs} />
  return cycle && rs ? <PaymentThread key={`${cycle.id}:${rs.shift.id}`} cycle={cycle} rs={rs} />
    : <div className="thread-empty" aria-label="No conversation"><MessageSquare size={20} aria-hidden="true" /></div>
}

function ServerPaymentThread({ cycle, rs }: { cycle: DeskCycle; rs?: RunShift }) {
  const { threads, loading, error } = useJourneyThreads(cycle.id)
  const [selected, setSelected] = useState<string>()
  const relevant = threads.filter((thread) => !rs || thread.shiftId === rs.shift.id
    || thread.counterparty.kind === 'worker' && thread.counterparty.name === rs.shift.worker
    || thread.counterparty.kind === 'site' && (thread.counterparty.name === rs.shift.fac.name
      || thread.counterparty.name === cycle.sites?.find((site) => site.name === rs.shift.fac.name)?.supervisor?.name))
  const thread = relevant.find((item) => item.id === selected) ?? relevant[0]
  if (!thread) return <div className="thread-empty" aria-label="No conversation">
    <MessageSquare size={20} aria-hidden="true" />
    <p className="r-note" role={error ? 'alert' : 'status'}>{error ?? (loading ? 'Loading conversation…' : 'No conversation yet')}</p>
  </div>
  return <>
    {relevant.length > 1 && <div className="thread-party-switch journey-thread-picker" role="group" aria-label="Conversation recipient">
      {relevant.map((item) => <button type="button" key={item.id} aria-pressed={thread.id === item.id} onClick={() => setSelected(item.id)}>{item.counterparty.name}</button>)}
    </div>}
    <JourneyThreadView key={thread.id} thread={thread} />
  </>
}

/** The same persisted conversation is used in the work pane and the dispute form. */
export function JourneyThreadView({ thread: initial, primary = false }: { thread: JourneyThread; primary?: boolean }) {
  const { threads, error: loadError } = useJourneyThreads(initial.cycleId)
  const thread = threads.find((item) => item.id === initial.id) ?? initial
  const [state] = useOnboarding()
  const data = useData(false)
  const blocked = blockedCounterparty(thread, state.neverContact ?? [], data.payloads.find(cycle => cycle.cycle.id === thread.cycleId))
  const [text, setText] = useState('')
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const log = useRef<HTMLDivElement>(null)
  async function save() {
    if (!text.trim() || saving || (dir === 'out' && blocked)) return
    setSaving(true)
    setError(null)
    try {
      await recordMessage(thread.id, { dir, text: text.trim() })
      setText('')
      requestAnimationFrame(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight })
    } catch (cause) { setError(threadErrorText(cause, thread.counterparty.name)) }
    finally { setSaving(false) }
  }
  return <section className="thread journey-thread" aria-label={`Conversation with ${thread.counterparty.name}`}>
    <header className="thread-head"><div className="thread-heading"><span className="thread-name">{thread.counterparty.name}</span><Tag>{titleCase(thread.status)}</Tag></div></header>
    <div ref={log} className="thread-log scroll" role="log" aria-live="polite">
      {thread.messages.map((message) => <article key={message.id} className={`thread-bubble ${message.dir === 'note' ? 'internal' : message.dir}`}>
        <div className="thread-label">{message.dir === 'in' ? thread.counterparty.name : message.dir === 'note' ? 'Closeout Agent' : 'You'} · <Time at={message.at} /></div>
        <p className="thread-text">{message.text}</p>
        {message.dir === 'out' && <Tag>Not Sent · Demo</Tag>}
      </article>)}
      {!thread.messages.length && <p className="r-note">No messages yet</p>}
    </div>
    {blocked && <p className="journey-thread-error" role="status">{thread.counterparty.name} is on your never-contact list. You can still record a reply.</p>}
    {(error || loadError) && <p className="journey-thread-error" role="alert">{error ?? threadErrorText(new Error(loadError!), thread.counterparty.name)}</p>}
    <form className="journey-thread-composer" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <div className="thread-party-switch" role="group" aria-label="Message direction">
        <button type="button" aria-pressed={dir === 'in'} onClick={() => setDir('in')}>Record reply</button>
        <button type="button" aria-pressed={dir === 'out'} onClick={() => setDir('out')}>Outgoing message</button>
      </div>
      <textarea className="chat-input" rows={2} aria-label={dir === 'in' ? 'Reply text' : 'Outgoing message text'} placeholder={dir === 'in' ? `Record ${thread.counterparty.name}'s reply…` : blocked ? 'Outgoing messages are disabled' : `Message ${thread.counterparty.name}…`} value={text} disabled={saving || (dir === 'out' && blocked)} onChange={(event) => setText(event.target.value)} />
      <Btn type="submit" className={primary && !blocked ? 'primary' : undefined} disabled={saving || !text.trim() || (dir === 'out' && blocked)}>{saving ? 'Recording…' : dir === 'in' ? 'Record reply' : 'Save message · Demo'}</Btn>
    </form>
  </section>
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
      toast(`Message recorded for ${thread.counterparty.name} · Not Sent · Demo`)
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
