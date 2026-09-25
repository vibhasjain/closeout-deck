import { useEffect, useRef, useState } from 'react'
import { loadGoogleIdentity } from '@/lib/googleIdentity'
import { signInWithGoogle } from '@/lib/viewerSession'
import './SignIn.css'

export default function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const button = useRef<HTMLDivElement>(null)
  const pending = useRef(false)
  const [error, setError] = useState<'invite_only' | 'unavailable' | null>(null)

  useEffect(() => {
    let active = true
    void loadGoogleIdentity().then((google) => {
      if (!active || !button.current) return
      const clientId = window.__GOOGLE_CLIENT_ID
      if (!clientId) throw new Error('Google client ID is unavailable')
      google.initialize({
        client_id: clientId,
        auto_select: true,
        callback: async ({ credential }) => {
          if (!active || pending.current) return
          pending.current = true
          setError(null)
          try {
            // Signs in on /answers and /job too; ours is the one this page needs.
            const { session, status } = await signInWithGoogle(credential)
            if (!active) return
            if (status === 403) { setError('invite_only'); return }
            if (!session) throw new Error('Sign-in failed')
            onSignedIn()
          } catch {
            if (active) setError('unavailable')
          } finally {
            pending.current = false
          }
        },
      })
      google.renderButton(button.current, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'rectangular' })
    }).catch(() => { if (active) setError('unavailable') })
    return () => { active = false }
  }, [onSignedIn])

  return <main className="sign-in">
    <div className="sign-in-content">
      <img className="sign-in-logo" src="/logo-small.svg" alt="HyperTrack" />
      <h1>Welcome to Closeout</h1>
      <div className="sign-in-google" ref={button} />
      {error && <div className="sign-in-error" role="alert">
        <p>{error === 'invite_only' ? 'Closeout is invite-only right now.' : 'Could not sign in. Please try again.'}</p>
        {error === 'invite_only' && <a className="sign-in-demo" href="https://hypertrack.com/contact">Book a demo</a>}
      </div>}
    </div>
  </main>
}
