import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { MessageSquare, Settings, User } from 'lucide-react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Btn } from '@/components/ui'
import { signOut } from '@/lib/auth'
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
  const nav = useRef<HTMLElement>(null)
  const indicator = useRef<HTMLDivElement>(null)
  const account = useRef<HTMLDivElement>(null)
  const accountButton = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const [menu, setMenu] = useState<'closed' | 'entering' | 'open' | 'closing'>('closed')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [signingOut, setSigningOut] = useState(false)

  useLayoutEffect(() => {
    const measure = () => {
      const row = nav.current
      const layer = indicator.current
      if (!row || !layer) return
      const active = row.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
      layer.style.clipPath = active && !setup
        ? `inset(2px ${row.clientWidth - active.offsetLeft - active.offsetWidth}px 2px ${active.offsetLeft}px round 9999px)`
        : 'inset(2px 100% 2px 0 round 9999px)'
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (nav.current) observer.observe(nav.current)
    window.addEventListener('resize', measure)
    let disposed = false
    void document.fonts.ready.then(() => { if (!disposed) measure() })
    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [pathname, setup])

  const closeMenu = useCallback(() => {
    clearTimeout(timer.current)
    setMenu('closing')
    timer.current = setTimeout(() => setMenu('closed'), 120)
  }, [])

  useEffect(() => {
    if (menu !== 'entering') return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        setMenu('open')
        account.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [menu])

  useEffect(() => {
    if (menu === 'closed') return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !account.current?.contains(event.target)) closeMenu()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
        accountButton.current?.focus()
      } else if (event.key === 'Tab') closeMenu()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [menu, closeMenu])
  useEffect(() => () => clearTimeout(timer.current), [])

  const logOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      setSigningOut(false)
      toast('Could not sign out. Try again.')
    }
  }

  return (
    <header className="topbar">
      <div className="brand"><img src="/logo-small.svg" alt="HyperTrack" width="22" height="22" /></div>
      <nav className="nav-tabs" ref={nav} aria-label="Main navigation">
        {tabs.map(({ to, label }) => <NavLink key={to} to={`${to}${agentOpen ? '?agent=1' : ''}`} aria-disabled={setupLocked || undefined} tabIndex={setupLocked ? -1 : undefined}>{label}</NavLink>)}
        <div className="nav-tabs" ref={indicator} aria-hidden="true">
          {tabs.map(({ to, label }) => <span key={to}>{label}</span>)}
        </div>
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
      <div className="relative min-w-0 shrink-0" ref={account}>
        <button ref={accountButton} disabled={setupLocked} type="button" className="btn icon-box" aria-label="Account" title={email ?? undefined} aria-haspopup="menu" aria-expanded={menu !== 'closed' && menu !== 'closing'} aria-controls={menu !== 'closed' ? menuId : undefined}
          onClick={() => {
            if (menu === 'open' || menu === 'entering') closeMenu()
            else { clearTimeout(timer.current); setMenu('entering') }
          }}>
          <User size={16} aria-hidden="true" />
        </button>
        {menu !== 'closed' && <div id={menuId} role="menu" aria-label="Account" className={`modal${menu === 'open' ? ' open' : menu === 'closing' ? ' closing' : ''}`}>
          {email && <p className="account-email">{email}</p>}
          <Btn role="menuitem" disabled={signingOut} onClick={() => void logOut()}>Sign out</Btn>
        </div>}
      </div>
    </header>
  )
}
