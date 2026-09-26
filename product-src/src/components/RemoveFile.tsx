import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { SkeletonRegion } from '@/components/Skeleton'
import { Btn } from '@/components/ui'
import { removeFile } from '@/lib/data'

const FAILED = 'The file could not be removed. Try again.'

/** Remove one of the account's own uploads after an inline confirm. Sample files leave only with the whole sample. */
export function RemoveFile({ file, onRemoved }: { file: { id: string; name: string; sample: boolean }; onRemoved?: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  if (file.sample) return null

  async function remove() {
    setWorking(true); setError('')
    // removeFile refreshes the desk before it resolves, so the row is already gone from the account's files.
    try { await removeFile(file.id); onRemoved?.() }
    catch { setError(FAILED) }
    finally { setWorking(false) }
  }

  if (working) return <SkeletonRegion variant="action" className="remove-file-busy" />
  if (!confirming) return <Btn className="remove-file" aria-label={`Remove ${file.name}`} title={`Remove ${file.name}`} onClick={() => setConfirming(true)}><Trash2 size={12} aria-hidden="true" />Remove</Btn>
  return <div className="remove-file-confirm" role="group" aria-label={`Remove ${file.name}`}
    onKeyDown={(event) => { if (event.key === 'Escape') setConfirming(false) }}>
    <span>{`Remove ${file.name}? Its time entries leave every pay run.`}</span>
    <Btn onClick={() => void remove()}>Remove</Btn>
    <Btn onClick={() => { setConfirming(false); setError('') }}>Cancel</Btn>
    {error && <p role="alert" className="r-note">{error}</p>}
  </div>
}
