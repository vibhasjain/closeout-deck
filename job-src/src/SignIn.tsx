import { useEffect, useRef, useState } from 'react'
import { createViewerSession, HttpError, resetAppStorage, type ViewerSession } from '@/api'
import './SignIn.css'

interface GoogleCredentialResponse {
  credential: string
}

interface GoogleIdApi {
  initialize(options: {
    client_id: string
    auto_select: boolean
    callback: (response: GoogleCredentialResponse) => void
  }): void
  renderButton(element: HTMLElement, options: { theme: 'outline'; size: 'large'; text: 'signin_with' }): void
  prompt(): void
}

declare global {
  interface Window {
    __GOOGLE_CLIENT_ID?: string
    google?: { accounts: { id: GoogleIdApi } }
  }
}

export function SignIn({
  notice,
  autoSignIn,
  onSignedIn,
}: {
  notice?: string
  autoSignIn: boolean
  onSignedIn: (session: ViewerSession) => void
}) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const clientId = window.__GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    const render = () => {
      if (cancelled || !buttonRef.current || !window.google) return
      buttonRef.current.replaceChildren()
      window.google.accounts.id.initialize({
        client_id: clientId,
        // Re-sign in silently when a session runs out instead of parking the
        // owner on a sign-in screen — but not after a deliberate sign-out.
        auto_select: autoSignIn,
        // Exchanges with both backends, so this also signs in /answers and /product.
        callback: async (response) => {
          setError('')
          try {
            const session = await createViewerSession(response.credential)
            onSignedIn(session)
          } catch (sessionError) {
            resetAppStorage()
            setError(
              sessionError instanceof HttpError && (sessionError.status === 401 || sessionError.status === 403)
                ? 'hypertrack.io accounts only.'
                : 'Could not sign in. Try again.',
            )
          }
        },
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
      })
      if (autoSignIn) window.google.accounts.id.prompt()
    }

    if (window.google) {
      render()
      return () => {
        cancelled = true
      }
    }

    let script = document.querySelector<HTMLScriptElement>('script[data-job-google-signin]')
    if (!script) {
      script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.jobGoogleSignin = 'true'
      document.head.appendChild(script)
    }
    script.addEventListener('load', render)
    return () => {
      cancelled = true
      script?.removeEventListener('load', render)
    }
  }, [autoSignIn, clientId, onSignedIn])

  // Same card as the /answers sign-in (markup and SignIn.css mirror answers/index.html); only the name differs.
  return (
    <div className="gate">
      <div className="card">
        <img src="/logo-small.svg" alt="HyperTrack" className="card-logo" />
        <h1 className="card-title">Chats</h1>
        <p className="card-sub">Sign in with your hypertrack.io Google account.</p>
        <div ref={buttonRef} className="card-btn" />
        <p className="err">{error || notice || (clientId ? '' : 'Google sign-in is not configured.')}</p>
      </div>
    </div>
  )
}
