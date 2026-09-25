import { OnboardingSyncBoundary } from './OnboardingSyncBoundary'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useOnboarding } from '@/lib/onboarding'
import { AppShell } from '@/components/shell/AppShell'
import { CallRecoveryBoot } from '@/components/CallRecoveryBoot'

function SyncedLayout() {
  const { pathname } = useLocation()
  const [{ forwarded }] = useOnboarding()
  if (!forwarded && !pathname.startsWith('/setup')) return <Navigate to="/setup/agent" replace />
  return <><CallRecoveryBoot /><AppShell><Outlet /></AppShell></>
}

export function OnboardingLayout() {
  return <OnboardingSyncBoundary><SyncedLayout /></OnboardingSyncBoundary>
}
