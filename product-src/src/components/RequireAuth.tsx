import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getAuthenticatedUser } from '@/lib/auth'
import { useOnboarding } from '@/lib/onboarding'
import { Spinner } from '@/components/ui'
import { AppShell } from '@/components/shell/AppShell'

const QA_BYPASS_AUTH = import.meta.env.DEV && import.meta.env.VITE_QA_BYPASS_AUTH === '1'

export function RequireAuth() {
  // QA only: headless screenshot runs have no Cognito session. Gated on import.meta.env.DEV so it is
  // compiled out of any production build, and off unless the flag is passed explicitly at dev time.
  const [status, setStatus] = useState<'loading' | 'in' | 'out'>(QA_BYPASS_AUTH ? 'in' : 'loading')
  const { pathname } = useLocation()
  const [{ forwarded }] = useOnboarding()

  useEffect(() => {
    if (QA_BYPASS_AUTH) return
    let active = true
    getAuthenticatedUser().then(
      () => { if (active) setStatus('in') },
      () => { if (active) setStatus('out') },
    )
    return () => { active = false }
  }, [])

  if (status === 'loading') return <div className="grid min-h-screen place-items-center"><Spinner /></div>
  if (status === 'out') return <Navigate to="/login" replace />

  const inSetup = pathname.startsWith('/setup')
  if (!forwarded && !inSetup) return <Navigate to="/setup/agent" replace />

  return <AppShell><Outlet /></AppShell>
}
