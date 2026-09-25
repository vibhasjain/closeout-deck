// Types for /shared/session.js (the Vite apps import it for its side effect).
export interface SharedSession {
  sessionToken: string
  exp: number
  email: string
  name?: string
  picture?: string
}
export type SessionBackend = 'jobs' | 'closeout'
export interface MintResult { session: SharedSession | null; status: number }

declare global {
  var CloseoutSession: {
    KEYS: Record<SessionBackend, string>
    get(which: SessionBackend): SharedSession | null
    any(): SharedSession | null
    exchange(credential: string): Promise<Record<SessionBackend, MintResult>>
    ensure(which: SessionBackend, clientId: string | undefined): Promise<SharedSession | null>
    signOut(): void
  }
}
