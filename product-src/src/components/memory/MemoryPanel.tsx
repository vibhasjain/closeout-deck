import { SkeletonRegion } from '@/components/Skeleton'
import { useRef, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Btn, Tag } from '@/components/ui'
import { getOnboarding, useOnboarding } from '@/lib/onboarding'
import { createInstinct, dismissProposal, editInstinct, forgetInstinct, keepInstinct, MemoryError, useMemory, type Instinct, type MemoryKind, type MemoryProposal, type MemorySnapshot } from '@/lib/memory'
import { learnedAgo, memoryDate, memoryKinds, memoryRuleLabel, memorySources, memoryText } from './memoryDisplay'
import { makeSuggestedRule } from './memoryActions'
import './memory.css'

function failure(error: unknown) {
  if (error instanceof MemoryError && error.reason === 'duplicate') return 'Already known'
  if (error instanceof MemoryError && error.reason === 'tombstone') return 'You asked me to forget this'
  return error instanceof Error ? error.message : 'Memory could not be saved. Try again.'
}

export function MemoryRow({ instinct }: { instinct: Instinct }) {
  const original = memoryText(instinct.text)
  const [text, setText] = useState(original)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const canceled = useRef(false)

  async function run(action: () => Promise<unknown>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)
    try { await action() } catch (error) { setError(failure(error)) }
    finally { pending.current = false; setBusy(false) }
  }

  function save() {
    if (canceled.current) { canceled.current = false; return }
    const next = text.trim()
    if (!next) { setText(original); return }
    if (next !== original) return run(() => editInstinct(instinct.id, { text: next }))
  }

  return <li className="memory-row">
    <textarea className="memory-text" rows={1} aria-label={`Edit ${memorySources[instinct.source]} memory`} placeholder="What should the Closeout Agent know?" maxLength={280}
      value={text} disabled={busy} onChange={event => setText(event.target.value)} onBlur={save}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
        if (event.key === 'Escape') { canceled.current = true; setText(original); event.currentTarget.blur() }
      }} />
    <div className="memory-row-meta">
      <Tag className="memory-source" tone={instinct.source === 'user' ? undefined : instinct.source === 'decisions' ? 'amber' : 'blue'}>{memorySources[instinct.source]}</Tag>
      <time dateTime={instinct.at}>{memoryDate(instinct.at)}</time>
      {instinct.until && <span>Until {memoryDate(`${instinct.until}T12:00:00`)}</span>}
    </div>
    <div className="memory-actions">
      {instinct.status === 'pending' && <Btn className="memory-button" disabled={busy} onClick={() => run(() => keepInstinct(instinct.id))}>Keep</Btn>}
      <Btn className="memory-button memory-icon" aria-label={`Forget ${original}`} title="Forget this memory" disabled={busy} onClick={() => setConfirming(true)}><Trash2 size={14} /></Btn>
    </div>
    {confirming && <div className="memory-forget-confirm">
      <span>Forget this? The Closeout Agent won’t learn it again.</span>
      <Btn className="memory-button" disabled={busy} onClick={() => run(() => forgetInstinct(instinct.id))}>Forget</Btn>
      <Btn className="memory-button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Btn>
    </div>}
    {error && <p className="memory-note memory-row-note" role="alert">{error}</p>}
  </li>
}

export function AddMemory() {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<MemoryKind>('context')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!text.trim() || pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      await createInstinct({ kind, text: text.trim(), source: 'user' })
      setText('')
      setOpen(false)
    } catch (error) { setError(failure(error)) }
    finally { pending.current = false; setBusy(false) }
  }

  if (!open) return <div className="memory-add"><Btn className="memory-button" onClick={() => setOpen(true)}><Plus size={14} />Add</Btn></div>
  return <form className="memory-add memory-add-form" onSubmit={add}>
    <select aria-label="Memory kind" className="q-input memory-kind" value={kind} disabled={busy} onChange={event => setKind(event.target.value as MemoryKind)}>
      {memoryKinds.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
    </select>
    <input autoFocus className="q-input memory-new-text" aria-label="New memory" placeholder="What should the Closeout Agent know?" maxLength={280} value={text} disabled={busy} onChange={event => setText(event.target.value)} />
    <div className="memory-actions">
      <Btn type="submit" className="memory-button" disabled={busy || !text.trim()}>Add</Btn>
      <Btn className="memory-button" disabled={busy} onClick={() => { setOpen(false); setError(null) }}>Cancel</Btn>
    </div>
    {error && <p className="memory-note memory-row-note" role="alert">{error}</p>}
  </form>
}

export function MemorySuggestion({ proposal, onMakeRule }: { proposal: MemoryProposal; onMakeRule(ruleId: string): Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const label = memoryRuleLabel(proposal.ruleId)
  if (!label) return null

  async function act(action: () => Promise<unknown>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)
    try { await action() } catch (error) { setError(failure(error)) }
    finally { pending.current = false; setBusy(false) }
  }

  return <li className="memory-suggestion">
    <p>You dismissed {label} {proposal.count} times across {proposal.cycles} pay runs · most often: {memoryText(proposal.topReason) || 'No reason recorded'}</p>
    <div className="memory-actions">
      <Btn className="memory-button" disabled={busy} onClick={() => act(() => onMakeRule(proposal.ruleId))}>Make it a rule</Btn>
      <Btn className="memory-button" disabled={busy} onClick={() => act(() => dismissProposal(proposal.ruleId))}>Forget</Btn>
    </div>
    {error && <p className="memory-note" role="alert">{error}</p>}
  </li>
}

export function MemoryPanelContent({ snapshot, loading, error, refresh, onMakeRule }: {
  snapshot: MemorySnapshot; loading: boolean; error: string | null; refresh(): Promise<void>; onMakeRule(ruleId: string): Promise<void>
}) {
  const instincts = snapshot.instincts.filter(row => row.status === 'active' || row.status === 'pending')
  const proposals = snapshot.proposals.filter(proposal => memoryRuleLabel(proposal.ruleId))
  return <section className="memory-panel" aria-labelledby="memory-heading" aria-busy={loading}>
    <h2 id="memory-heading">What the Closeout Agent knows</h2>
    {error && <div className="memory-load-error"><p className="memory-note" role="alert">{error}</p><Btn className="memory-button" onClick={() => void refresh()}>Try again</Btn></div>}
    {!instincts.length && !loading && !error && <p className="memory-note memory-empty">The Closeout Agent learns from the call, from your corrections and at each Send to Payroll. You can edit what it knows or make it forget. Forget stays forgotten.</p>}
    {loading && !instincts.length && !error && <SkeletonRegion rows={4} />}
    {loading && instincts.length > 0 && <SkeletonRegion rows={1} />}
    {memoryKinds.map(({ kind, label }) => {
      const rows = instincts.filter(row => row.kind === kind)
      return rows.length ? <section className="memory-group" key={kind} aria-label={label}>
        <h3>{label}</h3>
        <ul>{rows.map(instinct => <MemoryRow key={`${instinct.id}:${instinct.at}`} instinct={instinct} />)}</ul>
      </section> : null
    })}
    {(!loading || instincts.length > 0) && <AddMemory />}
    {proposals.length > 0 && <section className="memory-group memory-suggestions" aria-label="Suggested rules">
      <h3>Suggested rules</h3>
      <ul>{proposals.map(proposal => <MemorySuggestion key={proposal.ruleId} proposal={proposal} onMakeRule={onMakeRule} />)}</ul>
    </section>}
    {snapshot.lastRun && <p className="memory-note memory-last-learned">Last learned <time dateTime={snapshot.lastRun.finishedAt}>{learnedAgo(snapshot.lastRun.finishedAt)}</time> · {snapshot.lastRun.applied} new</p>}
  </section>
}

export function MemoryPanel() {
  const memory = useMemory()
  const [, update] = useOnboarding()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  return <MemoryPanelContent {...memory} onMakeRule={ruleId => makeSuggestedRule(ruleId, patch => update(typeof patch === 'function' ? patch(getOnboarding()) : patch), navigate, params)} />
}
