import { useEffect, useState } from 'react'
import { forgetInstinct, isForgotten, keepInstinct, useMemory } from '@/lib/memory'
import { getOnboarding, useOnboarding } from '@/lib/onboarding'
import { recordMemoryResolution, type RememberReceipt } from './chatMemory'
import { memoryText } from './memoryDisplay'
import './memory.css'

export function RememberLine({ receipt, messageId, at }: { receipt: RememberReceipt; messageId: string; at: number }) {
  const [, update] = useOnboarding()
  const { snapshot, loaded, readAt, error: readError } = useMemory()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = receipt.memory.id
  const current = snapshot.instincts.find(row => row.id === id)
  // Absence is not a Forget: consolidation may have replaced the row, or the read predates it. Only a confirmed Forget is recorded.
  const state = !id || receipt.memory.state === 'forgotten' ? receipt.memory.state
    : current ? current.status
    : isForgotten(id) ? 'forgotten'
    : loaded && !readError && readAt > at ? 'changed' : receipt.memory.state
  const text = current?.text ?? receipt.text
  useEffect(() => {
    if (id && (state === 'active' || state === 'forgotten') && state !== receipt.memory.state) {
      update({ chat: recordMemoryResolution(getOnboarding().chat, messageId, id, state) })
    }
  }, [id, state, receipt.memory.state, messageId, update])

  async function resolve(next: 'active' | 'forgotten') {
    if (!id || busy) return
    setBusy(true); setError(null)
    try {
      const instinct = next === 'active' ? await keepInstinct(id) : await forgetInstinct(id)
      const resolved = instinct.status === 'active' ? 'active' : 'forgotten'
      update({ chat: recordMemoryResolution(getOnboarding().chat, messageId, id, resolved) })
      setConfirming(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this memory. Try again.') }
    finally { setBusy(false) }
  }

  return <div className="memory-note memory-chat-line" role="group" aria-label="Agent memory">
    <span>{state === 'duplicate' ? 'Already known' : state === 'tombstone' ? 'You asked me to forget this' : state === 'forgotten' ? `Forgotten: ${memoryText(receipt.text)}` : state === 'changed' ? `Changed since: ${memoryText(receipt.text)} · see Rules` : `I'll remember: ${memoryText(text)}`}</span>
    {(state === 'pending' || state === 'active') && <div className="memory-actions">
      {state === 'pending' && <button type="button" className="btn memory-button" disabled={busy} onClick={() => { void resolve('active') }}>Keep</button>}
      {state === 'active' && <span>Kept</span>}
      {confirming ? <span className="memory-forget-confirm">Forget this? <button type="button" className="btn memory-button" disabled={busy} onClick={() => { void resolve('forgotten') }}>Forget</button> <button type="button" className="btn memory-button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></span>
        : <button type="button" className="btn memory-button" disabled={busy} onClick={() => setConfirming(true)}>Forget</button>}
    </div>}
    {error && <span role="alert">{error}</span>}
  </div>
}
