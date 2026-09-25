import { useEffect, useState } from 'react'
import { Btn } from '@/components/ui'
import { createInstinct, MemoryError, useMemory } from '@/lib/memory'
import { flushOnboarding, getOnboarding, updateOnboarding, useOnboarding } from '@/lib/onboarding'
import { memoryRuleLabel } from './memoryDisplay'
import './memory.css'

// Offer state is separate from memory, so Forget does not revive the offer on another device.
function decline(ruleId: string) {
  const ids = getOnboarding().declinedAutoApproveRules ?? []
  if (!ids.includes(ruleId)) updateOnboarding({ declinedAutoApproveRules: [...ids, ruleId] })
}

export function AutoApproveOffer({ ruleId, count, onAccept, onDismiss }: { ruleId: string; count: number; onAccept: () => void; onDismiss: () => void }) {
  const { snapshot, loaded } = useMemory()
  const [state] = useOnboarding()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = memoryRuleLabel(ruleId)
  const text = label ? `Approves ${label} by hand` : null
  const known = snapshot.instincts.some(instinct => instinct.kind === 'autonomy' && instinct.ruleId === ruleId && instinct.text === text)
  useEffect(() => { if (known) decline(ruleId) }, [known, ruleId])

  async function notNow() {
    if (saving || !text) return
    setSaving(true); setError(null)
    try {
      await createInstinct({ kind: 'autonomy', text, source: 'user', status: 'active', ruleId })
      decline(ruleId); await flushOnboarding(); onDismiss()
    } catch (cause) {
      if (cause instanceof MemoryError && cause.reason) {
        decline(ruleId)
        try { await flushOnboarding(); onDismiss() }
        catch (error) { setError(error instanceof Error ? error.message : 'The preference could not be saved. Try again.') }
      }
      else setError(cause instanceof Error ? cause.message : 'The preference could not be saved. Try again.')
    } finally { setSaving(false) }
  }

  if (!label || !loaded || (!error && (known || state.declinedAutoApproveRules?.includes(ruleId)))) return null
  return <div className="decision-learn memory-offer">
    <span>Approved {count.toLocaleString()} · {label}. Approve these automatically from now on?</span>
    <Btn className="memory-button" disabled={saving} onClick={onAccept}>Yes</Btn>
    <Btn className="memory-button" disabled={saving} onClick={() => void notNow()}>Not now</Btn>
    {error && <span role="alert">{error}</span>}
  </div>
}
