import type {} from '@/lib/googleIdentity'

const KEY = 'closeout:session:v1'

export interface ViewerSession {
  sessionToken: string
  exp: number
  email: string
  name?: string
  picture?: string
}

function isSession(value: unknown): value is ViewerSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<ViewerSession>
  return typeof session.sessionToken === 'string' && session.sessionToken.length > 0
    && typeof session.exp === 'number' && Number.isFinite(session.exp) && session.exp * 1000 > Date.now()
    && typeof session.email === 'string' && session.email.length > 0
    && (session.name === undefined || typeof session.name === 'string')
    && (session.picture === undefined || typeof session.picture === 'string')
}

export function viewerSession(): ViewerSession | null {
  try {
    const session = JSON.parse(localStorage.getItem(KEY) || 'null')
    return isSession(session) ? session : null
  } catch { return null }
}

export function saveViewerSession(value: unknown): void {
  if (!isSession(value)) throw new Error('Invalid session')
  const { sessionToken, exp, email, name, picture } = value
  localStorage.setItem(KEY, JSON.stringify({ sessionToken, exp, email, name, picture }))
}

export async function currentUserEmail(): Promise<string | null> {
  return viewerSession()?.email ?? null
}

export function signOut() {
  try { localStorage.removeItem(KEY) } catch { /* Storage may be disabled. */ }
  try { window.google?.accounts.id.disableAutoSelect() } finally { window.location.reload() }
}
