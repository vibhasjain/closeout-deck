import { useState, type FormEvent } from 'react'
import { Btn } from '@/components/ui'
import { confirmed, isInternal, startOver } from '@/lib/startOver'
import { viewerSession } from '@/lib/viewerSession'

const BUSY = 'The Closeout Agent is mid-reply. Try again in a moment.'
const FAILED = 'Start over did not finish. Try again in a moment.'

/** HyperTrack accounts only: wipe this account and run onboarding again. Customers edit their Payroll profile and Rulebook instead. */
export function StartOver() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  if (refused || !isInternal(viewerSession()?.email)) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed(typed) || working) return
    setWorking(true)
    setError(null)
    const result = await startOver(typed)
    if (result === 'ok') return
    setWorking(false)
    if (result === 'not_internal') setRefused(true)
    else setError(result === 'busy' ? BUSY : FAILED)
  }
  const cancel = () => { setOpen(false); setTyped(''); setError(null) }

  return (
    <section className="settings-start-over" aria-labelledby="settings-start-over">
      <h4 id="settings-start-over">Start over</h4>
      <p>Wipes your onboarding, time entries, pay runs, decisions, chat, calls and what the Closeout Agent knows, then starts onboarding from scratch. Only on HyperTrack accounts.</p>
      {open ? (
        <form onSubmit={submit}>
          <label htmlFor="settings-start-over-confirm">Type “start over” to confirm</label>
          <input id="settings-start-over-confirm" className="q-input" autoFocus autoComplete="off" spellCheck={false} value={typed}
            disabled={working} onChange={(event) => setTyped(event.target.value)} />
          <div className="settings-start-over-actions">
            <Btn type="submit" disabled={!confirmed(typed) || working}>{working ? 'Starting over…' : 'Wipe and start over'}</Btn>
            <Btn disabled={working} onClick={cancel}>Cancel</Btn>
          </div>
        </form>
      ) : <Btn onClick={() => setOpen(true)}>Start over</Btn>}
      {error && <p className="settings-start-over-error" role="alert">{error}</p>}
    </section>
  )
}
