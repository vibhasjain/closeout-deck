import { useState } from 'react'
import { LogOut, MessageSquare, Settings } from 'lucide-react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Btn } from '@/components/ui'
import { signOut } from '@/lib/viewerSession'
import { useOnboarding } from '@/lib/onboarding'
import { useCurrentEmail } from '@/lib/useCurrentEmail'
import { useOverlay } from './Overlay'

const tabs = [
  { to: '/payroll', label: 'Payroll' },
  { to: '/rules', label: 'Rules' },
]

export function TopNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const setup = pathname.startsWith('/setup')
  const [{ forwarded }] = useOnboarding()
  const setupLocked = setup && !forwarded
  const agentOpen = params.get('agent') === '1'
  const email = useCurrentEmail()
  const { toast } = useOverlay()
  const [signingOut, setSigningOut] = useState(false)

  const logOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
      toast('Could not sign out. Try again.')
    }
  }

  return (
    <header className="topbar">
      <div className="brand"><img src={import.meta.env.BASE_URL + 'logo-small.svg'} alt="HyperTrack" width="22" height="22" /></div>
      <nav className="nav-tabs" aria-label="Main navigation">
        {tabs.map(({ to, label }) => <NavLink key={to} to={`${to}${agentOpen ? '?agent=1' : ''}`} aria-disabled={setupLocked || undefined} tabIndex={setupLocked ? -1 : undefined}>{label}</NavLink>)}
      </nav>
      <div className="spacer" />
      <button type="button" className="btn icon-box" aria-label="Settings" aria-current={pathname === '/settings' ? 'page' : undefined} disabled={setupLocked}
        onClick={() => navigate(`/settings${agentOpen ? '?agent=1' : ''}`)}><Settings size={16} aria-hidden="true" /></button>
      <Btn className="icon-box" aria-label="Agent" title="Agent" data-agent-toggle disabled={setupLocked} aria-expanded={agentOpen} aria-controls="agent-panel" onClick={() => setParams((previous) => {
        const next = new URLSearchParams(previous)
        if (agentOpen) next.delete('agent')
        else next.set('agent', '1')
        return next
      })}><MessageSquare size={16} aria-hidden="true" /></Btn>
      <Btn className="icon-box" aria-label="Log Out" title={email ? `Log out ${email}` : 'Log out'} disabled={signingOut} onClick={() => void logOut()}><LogOut size={16} aria-hidden="true" /></Btn>
    </header>
  )
}
