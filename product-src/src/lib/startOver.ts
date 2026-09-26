import { authedFetch, clearResponseCache } from '@/lib/api'
import { callOwner, liveCallKey } from '@/lib/callRecovery'
import { clearLocalAccount, flushOnboarding } from '@/lib/onboarding'
import { viewerSession } from '@/lib/viewerSession'

export const START_OVER = 'start over'
// Mirrors the server's INTERNAL_DOMAINS default. The server stays the authority: its 403 hides the section.
const INTERNAL_DOMAINS = ['hypertrack.io']
export const isInternal = (email: string | null | undefined) => !!email && INTERNAL_DOMAINS.includes(email.slice(email.lastIndexOf('@') + 1).toLowerCase())
// One 403 hides Start over everywhere (Settings and both account menus) until the next page load.
let refused = false
// A reset on its way to the server: the account menus hold still so its 409 or failure stays on screen.
let inFlight = false
export const startOverInFlight = () => inFlight
/** Whether the signed-in account gets Start over at all: every placement gates on this one check. */
export const startOverAllowed = () => !refused && isInternal(viewerSession()?.email)
/** The typed confirm: "start over", in any case, outer spaces ignored. */
export const confirmed = (typed: string) => typed.trim().toLowerCase() === START_OVER

/**
 * Wipe this account on the server, then everything this browser keeps for it, and reload into onboarding step one.
 * The sign-in stays. 'ok' means the page is navigating away.
 */
export async function startOver(typed: string): Promise<'ok' | 'busy' | 'not_internal' | 'failed'> {
  if (!confirmed(typed)) return 'failed'
  inFlight = true
  // A queued profile save lands before the wipe, never after it.
  await flushOnboarding().catch(() => {})
  const response = await authedFetch('/account/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: START_OVER }) }).catch(() => null)
  // A wipe that worked keeps holding: the page is about to navigate away.
  inFlight = !!response?.ok
  if (response?.status === 409) return 'busy'
  if (response?.status === 403) { refused = true; return 'not_internal' }
  if (!response?.ok) return 'failed'
  await clearResponseCache(viewerSession()?.email ?? 'development')
  clearLocalAccount()
  const owner = callOwner()
  if (owner) try { localStorage.removeItem(liveCallKey(owner)) } catch { /* Storage may be disabled. */ }
  window.location.assign('/product/')
  return 'ok'
}
