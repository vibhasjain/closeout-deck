import { hasWarmResponseCache } from '@/lib/responseCache'
import { SkeletonRegion } from '@/components/Skeleton'
import { useEffect, type ReactNode } from 'react'
import { flushOnboarding, hydrateOnboarding, useOnboardingSyncStatus } from '@/lib/onboarding'
import { Btn } from '@/components/ui'
import { OnboardingAccount } from '@/components/setup/OnboardingAccount'
import { PageTitle } from '@/components/shell/PageTitle'
import './onboarding-sync.css'

/** Keep the canonical profile authoritative before offering any editable screen. */
export function OnboardingSyncBoundary({ children }: { children: ReactNode }) {
  const status = useOnboardingSyncStatus()
  useEffect(() => { void hydrateOnboarding().catch(() => {}) }, [])
  const retry = () => { void flushOnboarding().catch(() => {}) }
  // A state that won't load still leaves the account corner: Log out, and Start over for the broken HyperTrack account it exists for.
  if (!status.ready) return <section className="onboarding-sync-load">
    <PageTitle title="Payroll" description="Collect time entries, resolve discrepancies, and prepare each pay run." />
    {status.error ? <><OnboardingAccount /><div role="alert"><p>{status.error}</p><Btn onClick={retry}>Retry</Btn></div></> : hasWarmResponseCache() ? null : <><SkeletonRegion variant="next-step" /><SkeletonRegion variant="kpis" /><SkeletonRegion variant="review" /></>}
  </section>
  return <>{children}{status.error && <div className="onboarding-sync-error" role="alert"><p>{status.error}</p><Btn onClick={retry}>Retry</Btn></div>}</>
}
