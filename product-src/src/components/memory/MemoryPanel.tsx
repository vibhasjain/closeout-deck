import { useActionRetention } from '@/lib/useActionRetention'
import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { usePendingAction } from '@/lib/usePendingAction'
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

export function MemoryRow({ instinct, retain }: { instinct: Instinct; retain?: () => (delay?: number) => void }) {
  const original = memoryText(instinct.text)
  const [draft, setDraft] = useState({ original, text: original })
  const text = draft.original === original ? draft.text : original
  const setText = (value: string) => setDraft({ original, text: value })
  const [confirming, setConfirming] = useState(false)
  const action = usePendingAction(failure)
  const busy = (action.inFlight ?? action.pending) || action.status === 'success' && action.key === 'forget'
  const canceled = useRef(false)


  function save() {
    if (canceled.current) { canceled.current = false; return }
    const next = text.trim()
    if (!next) { setText(original); return }
    if (next !== original) return action.run(() => editInstinct(instinct.id, { text: next }), 'edit', { optimistic: true })
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
      {(instinct.status === 'pending' || action.key === 'keep') && <ActionButton action={action} actionKey="keep" disabled={busy} pendingLabel="Keeping…" successLabel="Kept" className="memory-button" onClick={() => action.run(() => keepInstinct(instinct.id), 'keep', { optimistic: true })}>Keep</ActionButton>}
      <Btn className="memory-button memory-icon" aria-label={`Forget ${original}`} title="Forget this memory" disabled={busy} onClick={() => setConfirming(true)}><Trash2 size={14} /></Btn>
    </div>
    {confirming && <div className="memory-forget-confirm">
      <span>Forget this? The Closeout Agent won’t learn it again.</span>
      <ActionButton action={action} actionKey="forget" pendingLabel="Forgetting…" successLabel="Forgotten" className="memory-button" onClick={() => action.run(async () => { const release = retain?.(); try { await forgetInstinct(instinct.id); release?.() } catch (cause) { release?.(0); throw cause } }, 'forget', { optimistic: true })}>Forget</ActionButton>
      <Btn className="memory-button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Btn>
    </div>}
    <ActionFeedback action={action} className="memory-note memory-row-note" />
  </li>
}

export function AddMemory() {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<MemoryKind>('context')
  const [text, setText] = useState('')
  const action = usePendingAction(failure)
  const busy = action.inFlight ?? action.pending

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!text.trim() || busy) return
    await action.run(async () => {
      await createInstinct({ kind, text: text.trim(), source: 'user' })
      setText('')
      setOpen(false)
    })
  }

  if (!open) return <div className="memory-add">{action.status === 'success' && <ActionButton action={action} pendingLabel="Adding…" successLabel="Added" className="memory-button">Add</ActionButton>}<Btn className="memory-button" onClick={() => { action.reset(); setOpen(true) }}><Plus size={14} />Add</Btn></div>
  return <form className="memory-add memory-add-form" onSubmit={add}>
    <select aria-label="Memory kind" className="q-input memory-kind" value={kind} disabled={busy} onChange={event => setKind(event.target.value as MemoryKind)}>
      {memoryKinds.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
    </select>
    <input autoFocus className="q-input memory-new-text" aria-label="New memory" placeholder="What should the Closeout Agent know?" maxLength={280} value={text} disabled={busy} onChange={event => setText(event.target.value)} />
    {busy && <SkeletonRegion rows={1} />}
    <div className="memory-actions">
      <ActionButton action={action} pendingLabel="Adding…" successLabel="Added" type="submit" className="memory-button" disabled={busy || !text.trim()}>Add</ActionButton>
      <Btn className="memory-button" disabled={busy} onClick={() => { setOpen(false); action.reset() }}>Cancel</Btn>
    </div>
    <ActionFeedback action={action} className="memory-note memory-row-note" />
  </form>
}

export function MemorySuggestion({ proposal, onMakeRule, retain }: { proposal: MemoryProposal; onMakeRule(ruleId: string): Promise<void>; retain?: () => (delay?: number) => void }) {
  const action = usePendingAction(failure)
  const label = memoryRuleLabel(proposal.ruleId)
  if (!label) return null

  return <li className="memory-suggestion">
    <p>You dismissed {label} {proposal.count} times across {proposal.cycles} pay runs · most often: {memoryText(proposal.topReason) || 'No reason recorded'}</p>
    <div className="memory-actions">
      <ActionButton action={action} actionKey="rule" disabled={action.status === 'success'} pendingLabel="Saving…" successLabel="Saved" className="memory-button" onClick={() => action.run(() => onMakeRule(proposal.ruleId), 'rule', { optimistic: true })}>Make it a rule</ActionButton>
      <ActionButton action={action} actionKey="forget" pendingLabel="Forgetting…" successLabel="Forgotten" className="memory-button" onClick={() => action.run(async () => { const release = retain?.(); try { await dismissProposal(proposal.ruleId); release?.() } catch (cause) { release?.(0); throw cause } }, 'forget', { optimistic: true })}>Forget</ActionButton>
    </div>
    <ActionFeedback action={action} className="memory-note" />
  </li>
}

export function MemoryPanelContent({ snapshot, loading, loaded = false, error, refresh, onMakeRule }: {
  snapshot: MemorySnapshot; loading: boolean; loaded?: boolean; error: string | null; refresh(): Promise<void>; onMakeRule(ruleId: string): Promise<void>
}) {
  const memories = useActionRetention(snapshot.instincts.filter(row => row.status === 'active' || row.status === 'pending'), row => row.id)
  const suggestions = useActionRetention(snapshot.proposals.filter(proposal => memoryRuleLabel(proposal.ruleId)), proposal => proposal.ruleId)
  const instincts = memories.items, proposals = suggestions.items
  return <section className="memory-panel" aria-labelledby="memory-heading" aria-busy={loading}>
    <h2 id="memory-heading">What the Closeout Agent knows</h2>
    {error && <div className="memory-load-error"><p className="memory-note" role="alert">{error}</p><Btn className="memory-button" onClick={() => void refresh()}>Try again</Btn></div>}
    {!instincts.length && (!loading || loaded) && !error && <p className="memory-note memory-empty">The Closeout Agent learns from the call, from your corrections and at each Send to Payroll. You can edit what it knows or make it forget. Forget stays forgotten.</p>}
    {loading && !loaded && !instincts.length && !error && <SkeletonRegion rows={4} />}
    {memoryKinds.map(({ kind, label }) => {
      const rows = instincts.filter(row => row.kind === kind)
      return rows.length ? <section className="memory-group" key={kind} aria-label={label}>
        <h3>{label}</h3>
        <ul>{rows.map(instinct => <MemoryRow key={instinct.id} instinct={instinct} retain={() => memories.retain(instinct)} />)}</ul>
      </section> : null
    })}
    {(!loading || loaded || instincts.length > 0) && <AddMemory />}
    {proposals.length > 0 && <section className="memory-group memory-suggestions" aria-label="Suggested rules">
      <h3>Suggested rules</h3>
      <ul>{proposals.map(proposal => <MemorySuggestion key={proposal.ruleId} proposal={proposal} onMakeRule={onMakeRule} retain={() => suggestions.retain(proposal)} />)}</ul>
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
