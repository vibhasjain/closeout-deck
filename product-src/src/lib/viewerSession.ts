import type {} from '@/lib/googleIdentity'
// One sign-in across /product, /answers and /job: the shared script owns both localStorage keys.
import '../../../shared/session.js'
import type { MintResult, SharedSession } from '../../../shared/session.js'

export type ViewerSession = SharedSession

const shared = () => globalThis.CloseoutSession

/** The Closeout agent's own session (closeout:session:v1). */
export function viewerSession(): ViewerSession | null {
  return shared().get('closeout')
}

/** Signed in on any of /product, /answers or /job. */
export function anySession(): ViewerSession | null {
  return shared().any()
}

/** Exchange a Google credential with both backends; returns the Closeout agent's result. */
export async function signInWithGoogle(credential: string): Promise<MintResult> {
  return (await shared().exchange(credential)).closeout
}

/** Only the /answers or /job session exists: mint ours with a silent Google One Tap. */
export function ensureViewerSession(): Promise<ViewerSession | null> {
  return shared().ensure('closeout', window.__GOOGLE_CLIENT_ID)
}

export async function currentUserEmail(): Promise<string | null> {
  return viewerSession()?.email ?? null
}

/** The user signed out: clear every page's session and stop Google auto sign-in. */
export function signOut() {
  try { shared().signOut() } finally { window.location.reload() }
}

/** The Closeout agent rejected our token (401): drop only ours; the reload re-mints it if another page is signed in. */
export function expireSession() {
  try { localStorage.removeItem(shared().KEYS.closeout) } catch { /* Storage may be disabled. */ }
  window.location.reload()
}
