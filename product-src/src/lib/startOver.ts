import { authedFetch } from '@/lib/api'
import { callOwner, liveCallKey } from '@/lib/callRecovery'
import { clearLocalAccount, flushOnboarding } from '@/lib/onboarding'

export const START_OVER = 'start over'
// Mirrors the server's INTERNAL_DOMAINS default. The server stays the authority: its 403 hides the section.
const INTERNAL_DOMAINS = ['hypertrack.io']
export const isInternal = (email: string | null | undefined) => !!email && INTERNAL_DOMAINS.includes(email.slice(email.lastIndexOf('@') + 1).toLowerCase())
/** The typed confirm: "start over", in any case, outer spaces ignored. */
export const confirmed = (typed: string) => typed.trim().toLowerCase() === START_OVER

/**
 * Wipe this account on the server, then everything this browser keeps for it, and reload into onboarding step one.
 * The sign-in stays. 'ok' means the page is navigating away.
 */
export async function startOver(typed: string): Promise<'ok' | 'busy' | 'not_internal' | 'failed'> {
  if (!confirmed(typed)) return 'failed'
  // A queued profile save lands before the wipe, never after it.
  await flushOnboarding().catch(() => {})
  const response = await authedFetch('/account/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: START_OVER }) }).catch(() => null)
  if (response?.status === 409) return 'busy'
  if (response?.status === 403) return 'not_internal'
  if (!response?.ok) return 'failed'
  clearLocalAccount()
  const owner = callOwner()
  if (owner) try { localStorage.removeItem(liveCallKey(owner)) } catch { /* Storage may be disabled. */ }
  window.location.assign('/product/')
  return 'ok'
}
