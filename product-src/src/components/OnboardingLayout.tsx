import { OnboardingSyncBoundary } from './OnboardingSyncBoundary'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useOnboarding, useOnboardingSyncStatus } from '@/lib/onboarding'
import { AppShell } from '@/components/shell/AppShell'
import { CallRecoveryBoot } from '@/components/CallRecoveryBoot'

function SyncedLayout() {
  const { pathname } = useLocation()
  const [{ forwarded }] = useOnboarding()
  const { ready } = useOnboardingSyncStatus()
  if (ready && !forwarded && !pathname.startsWith('/setup')) return <Navigate to="/setup/agent" replace />
  return <>{ready && <CallRecoveryBoot />}<AppShell><OnboardingSyncBoundary><Outlet /></OnboardingSyncBoundary></AppShell></>
}

export function OnboardingLayout() {
  return <SyncedLayout />
}
