import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Banknote, ClipboardList, Ellipsis, ListChecks, LogOut, Menu, PanelLeft, Settings, UserRound, X } from 'lucide-react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { recentCycles } from '@/lib/cycles'
import { intakeHref } from '@/lib/intake'
import { signOut, viewerSession } from '@/lib/viewerSession'
import { useOnboarding } from '@/lib/onboarding'
import { useCurrentEmail } from '@/lib/useCurrentEmail'
import { GettingStarted } from './GettingStarted'
import { PayRuns } from './PayRuns'
import { useOverlay } from './Overlay'

const tabs = [
  { to: '/payroll', label: 'Payroll', icon: Banknote },
  { to: '/rules', label: 'Rules', icon: ListChecks },
  { to: '/profile', label: 'Payroll profile', icon: UserRound },
]
const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'

export function TopNav({ wide = true }: { wide?: boolean } = {}) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const setup = pathname.startsWith('/setup')
  const [state, update] = useOnboarding()
  const setupLocked = setup && !state.forwarded
  const agentOpen = params.get('agent') === '1'
  const currentEmail = useCurrentEmail()
  const session = viewerSession()
  const email = session?.email ?? currentEmail
  const name = session?.name || email?.split('@')[0] || 'Payroll operator'
  const { toast } = useOverlay()
  const [signingOut, setSigningOut] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [previousWide, setPreviousWide] = useState(wide)
  const [accountOpen, setAccountOpen] = useState(false)
  const header = useRef<HTMLElement>(null)
  const drawer = useRef<HTMLDivElement>(null)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const account = useRef<HTMLDivElement>(null)
  const accountTrigger = useRef<HTMLButtonElement>(null)
  const accountMenuId = useId()
  const sidebarId = useId()
  const closeDrawer = useCallback(() => { setDrawerOpen(false); setAccountOpen(false) }, [])

  // A mobile drawer is transient. Reset it with the width prop so returning from
  // desktop cannot reopen an old dialog or leave the agent launcher inert.
  if (previousWide !== wide) {
    setPreviousWide(wide)
    if (wide) {
      setDrawerOpen(false)
      setAccountOpen(false)
    }
  }

  useEffect(() => {
    if (wide || !drawerOpen) return
    const surface = drawer.current
    const trigger = menuTrigger.current
    // The closed agent already owns its inert state; leave it alone so resizing can dock it.
    const siblings = Array.from(header.current?.parentElement?.children ?? []).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== header.current && !element.classList.contains('agent-panel'))
    const previous = siblings.map((element) => ({ element, inert: element.inert }))
    previous.forEach(({ element }) => { element.inert = true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    surface?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); return }
      if (event.key !== 'Tab' || !surface) return
      const focusable = Array.from(surface.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.getClientRects().length > 0)
      const first = focusable[0], last = focusable.at(-1)
      if (!first) { event.preventDefault(); surface.focus() }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === surface)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === surface)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      previous.forEach(({ element, inert }) => { element.inert = inert })
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
      if (trigger?.getClientRects().length) trigger.focus()
    }
  }, [wide, drawerOpen, closeDrawer])

  useEffect(() => {
    if (!accountOpen) return
    account.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointer = (event: PointerEvent) => { if (!account.current?.contains(event.target as Node)) setAccountOpen(false) }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setAccountOpen(false)
      accountTrigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey, true) }
  }, [accountOpen])

  const logOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
      toast('Could not sign out. Try again.')
    }
  }
  const navigateTo = (to: string) => { closeDrawer(); navigate(to) }
  const pendingHref = intakeHref(recentCycles(state, 2)[1].id)
  const intakeActive = pathname === '/payroll' && params.get('step') === 'intake'

  return <header ref={header} className={`topbar sidebar${drawerOpen && !wide ? ' sidebar-open' : ''}`} data-sidebar={state.sidebar}>
    <div className="mobile-topbar" inert={!wide && drawerOpen}>
      <button ref={menuTrigger} type="button" className="btn icon-box" aria-label="Open sidebar" aria-controls={sidebarId} aria-expanded={drawerOpen && !wide} onClick={() => {
        setDrawerOpen(true)
        if (agentOpen) setParams((previous) => { const next = new URLSearchParams(previous); next.delete('agent'); return next })
      }}><Menu size={18} aria-hidden="true" /></button>
      <div className="brand"><img className="brand-logo" src={import.meta.env.BASE_URL + 'logo-small.svg'} alt="HyperTrack" width="28" height="28" /></div>
    </div>
    {!wide && drawerOpen && <div className="sidebar-scrim" aria-hidden="true" onClick={closeDrawer} />}
    <div id={sidebarId} ref={drawer} className="sidebar-surface" role={!wide && drawerOpen ? 'dialog' : undefined} aria-modal={!wide && drawerOpen ? true : undefined} aria-label={!wide && drawerOpen ? 'Navigation' : undefined} tabIndex={!wide && drawerOpen ? -1 : undefined} inert={!wide && !drawerOpen}>
      <div className="sidebar-brand-row">
        <div className="brand"><img className="brand-logo" src={import.meta.env.BASE_URL + 'logo-small.svg'} alt="HyperTrack" width="28" height="28" /></div>
        <button type="button" className="btn icon-box sidebar-collapse" aria-label={state.sidebar === 'rail' ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => update({ sidebar: state.sidebar === 'full' ? 'rail' : 'full' })}><PanelLeft size={16} aria-hidden="true" /><img className="sidebar-expand-mark" src={import.meta.env.BASE_URL + 'logo-small.svg'} alt="HyperTrack" width="26" height="26" /></button>
        <button type="button" className="btn icon-box sidebar-close" aria-label="Close sidebar" onClick={closeDrawer}><X size={18} aria-hidden="true" /></button>
      </div>
      <nav className="nav-tabs" aria-label="Main navigation">
        {tabs.map(({ to, label, icon: Icon }, index) => {
          const active = pathname.startsWith(to) && (to !== '/payroll' || !intakeActive)
          return <span className="sidebar-nav-group" key={to}>
            <NavLink to={`${to}${agentOpen ? '?agent=1' : ''}`} className={() => `sidebar-nav-item${active ? ' active' : ''}`} aria-label={label} title={label} aria-current={active ? 'page' : false} aria-disabled={setupLocked || undefined} tabIndex={setupLocked ? -1 : undefined} onClick={(event) => { if (setupLocked) event.preventDefault(); else closeDrawer() }}><Icon size={16} aria-hidden="true" /><span className="sidebar-label">{label}</span></NavLink>
            {index === 0 && <NavLink to={`${pendingHref}${agentOpen ? '&agent=1' : ''}`} className={() => `sidebar-nav-item${intakeActive ? ' active' : ''}`} aria-label="Timesheets" title="Timesheets" aria-current={intakeActive ? 'page' : false} aria-disabled={setupLocked || undefined} tabIndex={setupLocked ? -1 : undefined} onClick={(event) => { if (setupLocked) event.preventDefault(); else closeDrawer() }}><ClipboardList size={16} aria-hidden="true" /><span className="sidebar-label">Timesheets</span></NavLink>}
          </span>
        })}
        <button type="button" className={`sidebar-nav-item${pathname === '/settings' ? ' active' : ''}`} aria-label="Settings" title="Settings" aria-current={pathname === '/settings' ? 'page' : undefined} disabled={setupLocked} onClick={() => navigateTo(`/settings${agentOpen ? '?agent=1' : ''}`)}><Settings size={16} aria-hidden="true" /><span className="sidebar-label">Settings</span></button>
      </nav>
      <PayRuns onNavigate={closeDrawer} />
      <GettingStarted onNavigate={closeDrawer} />
      <div ref={account} className="sidebar-account">
        {wide ? <button ref={accountTrigger} type="button" className="sidebar-account-trigger" aria-label="Account menu" title={`${name}${email ? ` · ${email}` : ''}`} aria-haspopup="menu" aria-expanded={accountOpen} aria-controls={accountMenuId} onClick={() => setAccountOpen((open) => !open)}>
          <span className="account-avatar" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span>
          <span className="sidebar-label account-details"><span className="account-name">{name}</span><span className="account-email">{email || 'Signed in'}</span></span>
          <Ellipsis className="sidebar-label" size={16} aria-hidden="true" />
        </button> : <div className="sidebar-account-identity"><span className="account-avatar" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span><span className="account-details"><span className="account-name">{name}</span><span className="account-email">{email || 'Signed in'}</span></span></div>}
        {!wide && <button type="button" className="sidebar-logout" disabled={signingOut} onClick={() => void logOut()}><LogOut size={16} aria-hidden="true" />Log out</button>}
        {wide && accountOpen && <div id={accountMenuId} className="sidebar-account-menu" role="menu" aria-label="Account" onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
          const current = items.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          items[next]?.focus()
        }}>
          <button type="button" role="menuitem" onClick={() => navigateTo('/setup/agent')}><ListChecks size={15} aria-hidden="true" />Onboarding</button>
          <button type="button" role="menuitem" aria-label="Log out" disabled={signingOut} onClick={() => void logOut()}><LogOut size={15} aria-hidden="true" />Log out</button>
        </div>}
      </div>
    </div>
  </header>
}
