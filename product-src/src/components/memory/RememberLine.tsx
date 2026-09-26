import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { usePendingAction } from '@/lib/usePendingAction'
import { useEffect, useState } from 'react'
import { createInstinct, forgetInstinct, isForgotten, keepInstinct, useMemory } from '@/lib/memory'
import { getOnboarding, useOnboarding } from '@/lib/onboarding'
import { recordMemoryResolution, type RememberReceipt } from './chatMemory'
import { memoryText } from './memoryDisplay'
import './memory.css'

export function RememberLine({ receipt, messageId, at }: { receipt: RememberReceipt; messageId: string; at: number }) {
  const [, update] = useOnboarding()
  const { snapshot, loaded, readAt, error: readError } = useMemory()
  const action = usePendingAction()
  const busy = action.inFlight ?? action.pending
  const [confirming, setConfirming] = useState(false)
  const id = receipt.memory.id
  const current = snapshot.instincts.find(row => row.id === id)
  // Absence is not a Forget: consolidation may have replaced the row, or the read predates it. Only a confirmed Forget is recorded.
  const state = !id || receipt.memory.state === 'forgotten' ? receipt.memory.state
    : current ? current.status
    : isForgotten(id) ? 'forgotten'
    : loaded && !readError && readAt > at ? 'changed' : receipt.memory.state
  const text = current?.text ?? receipt.text
  useEffect(() => {
    if (!action.inFlight && id && (state === 'active' || state === 'forgotten') && state !== receipt.memory.state) {
      update({ chat: recordMemoryResolution(getOnboarding().chat, messageId, id, state) })
    }
  }, [id, state, receipt.memory.state, messageId, update, action.inFlight])

  async function resolve(next: 'active' | 'forgotten' | 'again') {
    if (busy || (!id && next !== 'again')) return
    await action.run(async () => {
      // Remember it again: the owner's own add lifts the tombstone the agent's remember could not.
      const instinct = next === 'again' ? await createInstinct({ kind: receipt.kind, text: receipt.text, ...(receipt.until ? { until: receipt.until } : {}), source: 'user' })
        : next === 'active' ? await keepInstinct(id!) : await forgetInstinct(id!)
      const resolved = instinct.status === 'active' ? 'active' : 'forgotten'
      update({ chat: recordMemoryResolution(getOnboarding().chat, messageId, id ?? instinct.id, resolved, id ? undefined : receipt.text) })
      if (next !== 'forgotten') setConfirming(false)
    }, next, { optimistic: next !== 'again' })
  }

  const keeping = action.key === 'active' && (action.pending || action.status === 'success')
  const forgetting = action.key === 'forgotten' && (action.pending || action.status === 'success')
  return <div className="memory-note memory-chat-line" role="group" aria-label="Agent memory">
    <span>{state === 'duplicate' ? 'Already known' : state === 'tombstone' ? 'You asked me to forget this' : state === 'forgotten' ? `Forgotten: ${memoryText(receipt.text)}` : state === 'changed' ? `Changed since: ${memoryText(receipt.text)} · see Rules` : `I'll remember: ${memoryText(text)}`}</span>
    {state === 'tombstone' && <div className="memory-actions"><ActionButton action={action} actionKey="again" pendingLabel="Remembering…" successLabel="Remembered" className="memory-button" onClick={() => { void resolve('again') }}>Remember it again</ActionButton></div>}
    {(state === 'pending' || state === 'active' || forgetting) && <div className="memory-actions">
      {(state === 'pending' || keeping) && <ActionButton action={action} actionKey="active" pendingLabel="Keeping…" successLabel="Kept" className="memory-button" onClick={() => { void resolve('active') }}>Keep</ActionButton>}
      {state === 'active' && !keeping && <span>Kept</span>}
      {confirming ? <span className="memory-forget-confirm">{forgetting && action.status === 'success' ? 'Memory forgotten.' : 'Forget this?'} <ActionButton action={action} actionKey="forgotten" pendingLabel="Forgetting…" successLabel="Forgotten" className="memory-button" onClick={() => { void resolve('forgotten') }}>Forget</ActionButton> <button type="button" className="btn memory-button" disabled={busy} onClick={() => { setConfirming(false); action.reset() }}>{forgetting && action.status === 'success' ? 'Done' : 'Cancel'}</button></span>
        : <button type="button" className="btn memory-button" disabled={busy} onClick={() => setConfirming(true)}>Forget</button>}
    </div>}
    <ActionFeedback action={action} />
  </div>
}
