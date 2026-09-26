import { useEffect, useRef } from 'react'
import { Btn } from '@/components/ui'
import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { usePendingAction } from '@/lib/usePendingAction'
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
  const { snapshot, loaded, error: readError } = useMemory()
  const [state] = useOnboarding()
  const action = usePendingAction()
  const saving = action.pending
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current) }, [])
  const label = memoryRuleLabel(ruleId)
  const text = label ? `Approves ${label} by hand` : null
  const known = snapshot.instincts.some(instinct => instinct.kind === 'autonomy' && instinct.ruleId === ruleId && instinct.text === text)
  useEffect(() => { if (known) decline(ruleId) }, [known, ruleId])

  async function notNow() {
    if (saving || !text) return
    await action.run(async () => {
      try {
        await createInstinct({ kind: 'autonomy', text, source: 'user', status: 'active', ruleId })
      } catch (cause) {
        if (!(cause instanceof MemoryError && cause.reason)) throw cause
      }
      decline(ruleId)
      await flushOnboarding()
      // The persisted preference may remove the offer before its control paints Saved.
      // Keep this surface mounted for the same success beat as other memory actions.
      dismissTimer.current = setTimeout(() => { action.reset(); onDismiss() }, 900)
    })
  }

  // Wait for the first read, but a failed read must not take the offer (and its Yes) away.
  if (!label || (!loaded && !readError) || (!saving && action.status !== 'success' && !action.error && (known || state.declinedAutoApproveRules?.includes(ruleId)))) return null
  return <div className="decision-learn memory-offer">
    <span>Approved {count.toLocaleString()} · {label}. Approve these automatically from now on?</span>
    <Btn className="memory-button" disabled={saving || action.status === 'success'} onClick={onAccept}>Yes</Btn>
    <ActionButton className="memory-button" action={action} pendingLabel="Saving…" successLabel="Saved" onClick={() => void notNow()}>Not now</ActionButton>
    <ActionFeedback action={action} />
  </div>
}
