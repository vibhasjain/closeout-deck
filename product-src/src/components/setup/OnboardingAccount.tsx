import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { LogOut, RotateCcw } from 'lucide-react'
import { StartOver } from '@/components/StartOver'
import { startOverAllowed, startOverInFlight } from '@/lib/startOver'
import { signOut, viewerSession } from '@/lib/viewerSession'
import './onboarding-account.css'

/**
 * Onboarding is full screen, so this quiet corner is its only account control: who is signed in, Log out and, for HyperTrack
 * accounts, Start over. It never carries the pane's black next step. Pass inert while a modal covers the page.
 * ponytail: a native popover gives outside-click and Escape dismissal; no menu keyboard model to maintain.
 */
export function OnboardingAccount({ inert = false }: { inert?: boolean } = {}) {
  const [startingOver, setStartingOver] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const startOverItem = useRef<HTMLButtonElement>(null)
  const id = useId()
  const session = viewerSession()
  const email = session?.email
  const name = session?.name || email?.split('@')[0] || 'Payroll operator'
  // Cancel hands focus back to Start over, or to the avatar once a 403 has hidden it.
  const closeStartOver = () => { flushSync(() => setStartingOver(false)); (startOverItem.current ?? trigger.current)?.focus() }
  return <div className="setup-account" inert={inert} aria-hidden={inert || undefined}>
    <button ref={trigger} type="button" className="setup-account-trigger" popoverTarget={id} aria-label="Account menu" title={`${name}${email ? ` · ${email}` : ''}`}>
      <span className="account-avatar" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span>
    </button>
    <div id={id} popover="auto" role="group" aria-label="Account" className="setup-account-panel" onToggle={(event) => {
      if (event.newState !== 'closed') return
      // Light dismiss can't be cancelled, so a reset on its way to the server reopens the menu to show its 409 or failure.
      if (startOverInFlight()) event.currentTarget.showPopover()
      else setStartingOver(false)
    }}>
      <div className="setup-account-identity"><span className="account-name">{name}</span><span className="account-email">{email || 'Signed in'}</span></div>
      {startingOver ? <StartOver onClose={closeStartOver} /> : <>
        {startOverAllowed() && <button ref={startOverItem} type="button" className="setup-account-item" onClick={() => setStartingOver(true)}><RotateCcw size={15} aria-hidden="true" />Start over</button>}
        <button type="button" className="setup-account-item" onClick={() => signOut()}><LogOut size={15} aria-hidden="true" />Log out</button>
      </>}
    </div>
  </div>
}
