import { useId, useState, type FormEvent } from 'react'
import { Btn } from '@/components/ui'
import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { usePendingAction } from '@/lib/usePendingAction'
import { confirmed, startOver, startOverAllowed } from '@/lib/startOver'
import './start-over.css'

const BUSY = 'The Closeout Agent is mid-reply. Try again in a moment.'
const FAILED = 'Start over did not finish. Try again in a moment.'

/**
 * HyperTrack accounts only: wipe this account and run onboarding again. Customers edit their profile and Rulebook instead.
 * Settings shows it as a section behind an outline button. The account menus pass onClose: they open straight into the typed confirm,
 * and Cancel (or a server refusal) hands control back to the menu.
 */
export function StartOver({ onClose }: { onClose?(): void }) {
  const [open, setOpen] = useState(!!onClose)
  const [typed, setTyped] = useState('')
  const action = usePendingAction()
  const working = action.pending || action.status === 'success'
  const id = useId()
  if (!startOverAllowed()) return null

  const cancel = () => { setOpen(false); setTyped(''); action.reset(); onClose?.() }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed(typed) || working) return
    await action.run(async () => {
      const result = await startOver(typed)
      // A 403 flips the shared gate, so this section and every menu item disappear.
      if (result === 'not_internal') { cancel(); return }
      if (result !== 'ok') throw new Error(result === 'busy' ? BUSY : FAILED)
    })
  }

  return (
    <section className="start-over" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`}>Start over</h4>
      <p>Wipes your onboarding, time entries, pay runs, decisions, chat, calls and what the Closeout Agent knows, then starts onboarding from scratch. Only on HyperTrack accounts.</p>
      {open ? (
        <form onSubmit={submit}>
          <label htmlFor={`${id}-confirm`}>Type “start over” to confirm</label>
          <input id={`${id}-confirm`} className="q-input" autoFocus autoComplete="off" spellCheck={false} value={typed}
            disabled={working} onChange={(event) => { action.reset(); setTyped(event.target.value) }} />
          <div className="start-over-actions">
            <ActionButton type="submit" action={action} pendingLabel="Starting over…" successLabel="Started over" disabled={!confirmed(typed) || working}>Wipe and start over</ActionButton>
            <Btn disabled={working} onClick={cancel}>Cancel</Btn>
          </div>
        </form>
      ) : <Btn onClick={() => setOpen(true)}>Start over</Btn>}
      <ActionFeedback action={action} className="start-over-error" />
    </section>
  )
}
