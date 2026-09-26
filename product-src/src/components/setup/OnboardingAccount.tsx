import { useId, useState } from 'react'
import { LogOut, RotateCcw } from 'lucide-react'
import { StartOver } from '@/components/StartOver'
import { startOverAllowed } from '@/lib/startOver'
import { signOut, viewerSession } from '@/lib/viewerSession'

/**
 * Onboarding is full screen, so this quiet corner is its only account control: who is signed in, Log out and, for HyperTrack
 * accounts, Start over. It never carries the pane's black next step.
 * ponytail: a native popover gives outside-click and Escape dismissal; no menu keyboard model to maintain.
 */
export function OnboardingAccount() {
  const [startingOver, setStartingOver] = useState(false)
  const id = useId()
  const session = viewerSession()
  const email = session?.email
  const name = session?.name || email?.split('@')[0] || 'Payroll operator'
  return <div className="setup-account">
    <button type="button" className="setup-account-trigger" popoverTarget={id} aria-label="Account menu" title={`${name}${email ? ` · ${email}` : ''}`}>
      <span className="account-avatar" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span>
    </button>
    <div id={id} popover="auto" role="group" aria-label="Account" className="setup-account-panel" onToggle={(event) => { if (event.newState === 'closed') setStartingOver(false) }}>
      <div className="setup-account-identity"><span className="account-name">{name}</span><span className="account-email">{email || 'Signed in'}</span></div>
      {startingOver ? <StartOver onClose={() => setStartingOver(false)} /> : <>
        {startOverAllowed() && <button type="button" className="setup-account-item" onClick={() => setStartingOver(true)}><RotateCcw size={15} aria-hidden="true" />Start over</button>}
        <button type="button" className="setup-account-item" onClick={() => signOut()}><LogOut size={15} aria-hidden="true" />Log out</button>
      </>}
    </div>
  </div>
}
