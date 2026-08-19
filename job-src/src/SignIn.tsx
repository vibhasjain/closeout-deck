import { useEffect, useRef, useState } from 'react'
import { createViewerSession, HttpError, resetAppStorage, type ViewerSession } from '@/api'

interface GoogleCredentialResponse {
  credential: string
}

interface GoogleIdApi {
  initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void
  renderButton(element: HTMLElement, options: { theme: 'outline'; size: 'large'; text: 'signin_with' }): void
}

declare global {
  interface Window {
    __GOOGLE_CLIENT_ID?: string
    google?: { accounts: { id: GoogleIdApi } }
  }
}

function tokenDomain(token: string): string {
  try {
    const segment = token.split('.')[1]
    if (!segment) return ''
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const payload = JSON.parse(atob(padded)) as { hd?: unknown; email?: unknown }
    if (typeof payload.hd === 'string') return payload.hd.toLowerCase()
    if (typeof payload.email === 'string') return payload.email.split('@')[1]?.toLowerCase() ?? ''
  } catch {
    /* Invalid JWT; the server remains authoritative. */
  }
  return ''
}

function loadAgentKeyboard(): void {
  if (document.querySelector('script[data-job-agent-keyboard]')) return
  const script = document.createElement('script')
  script.src = 'https://agent-keyboard.fly.dev/widget.js'
  script.dataset.site = 'closeout-jobs'
  script.dataset.jobAgentKeyboard = 'true'
  script.defer = true
  document.body.appendChild(script)
}

export function SignIn({
  notice,
  onSignedIn,
}: {
  notice?: string
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
        callback: async (response) => {
          if (tokenDomain(response.credential) !== 'hypertrack.io') {
            setError('hypertrack.io accounts only.')
            return
          }
          setError('')
          try {
            const session = await createViewerSession(response.credential)
            if (session.email === 'vibes@hypertrack.io') loadAgentKeyboard()
            onSignedIn(session)
          } catch (sessionError) {
            resetAppStorage()
            setError(
              sessionError instanceof HttpError && sessionError.status === 401
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
  }, [clientId, onSignedIn])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className="text-[12px] text-muted-foreground">Internal — hypertrack.io accounts</p>
        {notice && <p className="text-[12.5px] text-nosource">{notice}</p>}
        {clientId ? (
          <div ref={buttonRef} />
        ) : (
          <p className="text-[12px] text-nosource">Google sign-in is not configured</p>
        )}
        {error && <p className="text-[12.5px] text-nosource">{error}</p>}
      </div>
    </div>
  )
}
