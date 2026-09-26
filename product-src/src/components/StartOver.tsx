import { useId, useState, type FormEvent } from 'react'
import { Btn } from '@/components/ui'
import { confirmed, startOver, startOverAllowed } from '@/lib/startOver'
import './start-over.css'

const BUSY = 'The Closeout Agent is mid-reply. Try again in a moment.'
const FAILED = 'Start over did not finish. Try again in a moment.'

/**
 * HyperTrack accounts only: wipe this account and run onboarding again. Customers edit their Payroll profile and Rulebook instead.
 * Settings shows it as a section behind an outline button. The account menus pass onClose: they open straight into the typed confirm,
 * and Cancel (or a server refusal) hands control back to the menu.
 */
export function StartOver({ onClose }: { onClose?(): void }) {
  const [open, setOpen] = useState(!!onClose)
  const [typed, setTyped] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  if (!startOverAllowed()) return null

  const cancel = () => { setOpen(false); setTyped(''); setError(null); onClose?.() }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed(typed) || working) return
    setWorking(true)
    setError(null)
    const result = await startOver(typed)
    if (result === 'ok') return
    setWorking(false)
    // A 403 flips the shared gate, so this section and every menu item disappear.
    if (result === 'not_internal') cancel()
    else setError(result === 'busy' ? BUSY : FAILED)
  }

  return (
    <section className="start-over" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`}>Start over</h4>
      <p>Wipes your onboarding, time entries, pay runs, decisions, chat, calls and what the Closeout Agent knows, then starts onboarding from scratch. Only on HyperTrack accounts.</p>
      {open ? (
        <form onSubmit={submit}>
          <label htmlFor={`${id}-confirm`}>Type “start over” to confirm</label>
          <input id={`${id}-confirm`} className="q-input" autoFocus autoComplete="off" spellCheck={false} value={typed}
            disabled={working} onChange={(event) => setTyped(event.target.value)} />
          <div className="start-over-actions">
            <Btn type="submit" disabled={!confirmed(typed) || working}>{working ? 'Starting over…' : 'Wipe and start over'}</Btn>
            <Btn disabled={working} onClick={cancel}>Cancel</Btn>
          </div>
        </form>
      ) : <Btn onClick={() => setOpen(true)}>Start over</Btn>}
      {error && <p className="start-over-error" role="alert">{error}</p>}
    </section>
  )
}
