import { useEffect, type ReactNode } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import { flushOnboarding, hydrateOnboarding, useOnboardingSyncStatus } from '@/lib/onboarding'
import { Btn } from '@/components/ui'
import './onboarding-sync.css'

/** Keep the canonical profile authoritative before offering any editable screen. */
export function OnboardingSyncBoundary({ children }: { children: ReactNode }) {
  const status = useOnboardingSyncStatus()
  useEffect(() => { void hydrateOnboarding().catch(() => {}) }, [])
  const retry = () => { void flushOnboarding().catch(() => {}) }
  if (!status.ready) return <main className="onboarding-sync-load">
    <ThinkingOrb size={32} theme="light" state={status.error ? 'breathing' : 'working'} />
    {status.error ? <div role="alert"><p>{status.error}</p><Btn onClick={retry}>Retry</Btn></div> : <p role="status">Reading your Payroll profile…</p>}
  </main>
  return <>{children}{status.error && <div className="onboarding-sync-error" role="alert"><p>{status.error}</p><Btn onClick={retry}>Retry</Btn></div>}</>
}
