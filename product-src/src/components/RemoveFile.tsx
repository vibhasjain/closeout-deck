import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { usePendingAction } from '@/lib/usePendingAction'
import { Btn } from '@/components/ui'
import { removeFile } from '@/lib/data'

const FAILED = 'The file could not be removed. Try again.'

/** Remove one of the account's own uploads after an inline confirm. Sample files leave only with the whole sample. */
export function RemoveFile({ file, onRemoved, retain }: { file: { id: string; name: string; sample: boolean }; onRemoved?: () => void; retain?: () => (delay?: number) => void }) {
  const [confirming, setConfirming] = useState(false)
  const action = usePendingAction(() => FAILED)
  if (file.sample) return null

  async function remove() {
    await action.run(async () => {
      const release = retain?.()
      try {
        await removeFile(file.id)
        release?.()
        if (onRemoved) setTimeout(onRemoved, 900)
      } catch (cause) { release?.(0); throw cause }
    })
  }

  if (action.status === 'success') return <ActionButton action={action} pendingLabel="Removing…" successLabel="Removed">Remove</ActionButton>
  if (!confirming) return <Btn className="remove-file" aria-label="Remove file" title="Remove file" onClick={() => setConfirming(true)}><Trash2 size={12} aria-hidden="true" />Remove</Btn>
  return <div className="remove-file-confirm" role="group" aria-label="Remove file"
    onKeyDown={(event) => { if (event.key === 'Escape' && !action.pending) setConfirming(false) }}>
    <span>Remove this file? Its time entries leave every pay run.</span>
    <ActionButton action={action} pendingLabel="Removing…" successLabel="Removed" onClick={() => void remove()}>Remove</ActionButton>
    <Btn disabled={action.pending} onClick={() => { setConfirming(false); action.reset() }}>Cancel</Btn>
    <ActionFeedback action={action} />
  </div>
}
