const KEY = 'job:viewer-session:v1'

export function viewerSession(): { sessionToken: string; exp: number; email?: string; name?: string } | null {
  try {
    const session = JSON.parse(localStorage.getItem(KEY) || 'null')
    return session && session.sessionToken && session.exp * 1000 > Date.now() ? session : null
  } catch { return null }
}

export async function currentUserEmail(): Promise<string | null> {
  return viewerSession()?.email ?? null
}

export function signOut() {
  localStorage.removeItem(KEY)
  window.location.reload()
}
