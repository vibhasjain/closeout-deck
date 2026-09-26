import { SkeletonRegion } from '@/components/Skeleton'
import { useEffect, type ReactNode } from 'react'
import { flushOnboarding, hydrateOnboarding, useOnboardingSyncStatus } from '@/lib/onboarding'
import { Btn } from '@/components/ui'
import { OnboardingAccount } from '@/components/setup/OnboardingAccount'
import './onboarding-sync.css'

/** Keep the canonical profile authoritative before offering any editable screen. */
export function OnboardingSyncBoundary({ children }: { children: ReactNode }) {
  const status = useOnboardingSyncStatus()
  useEffect(() => { void hydrateOnboarding().catch(() => {}) }, [])
  const retry = () => { void flushOnboarding().catch(() => {}) }
  // A state that won't load still leaves the account corner: Log out, and Start over for the broken HyperTrack account it exists for.
  if (!status.ready) return <main className="onboarding-sync-load">
    {status.error ? <><OnboardingAccount /><div role="alert"><p>{status.error}</p><Btn onClick={retry}>Retry</Btn></div></> : <SkeletonRegion variant="profile" />}
  </main>
  return <>{children}{status.error && <div className="onboarding-sync-error" role="alert"><p>{status.error}</p><Btn onClick={retry}>Retry</Btn></div>}</>
}
