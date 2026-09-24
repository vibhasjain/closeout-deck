import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureAmplify } from '@/lib/auth'
import App from '@/App'
import '@/index.css'
import '@/components/shell/shell.css'

const API = 'https://agent-keyboard.fly.dev/sites/closeout-jobs'
const KEY = 'job:viewer-session:v1'
const root = document.getElementById('root')!
const authWindow = window as Window & {
  __GOOGLE_CLIENT_ID?: string
  google?: { accounts: { id: {
    initialize(options: { client_id?: string; auto_select: boolean; callback: (response: { credential: string }) => Promise<void> }): void
    renderButton(element: HTMLElement, options: { theme: string; size: string; text: string }): void
    prompt(): void
  } } }
}

function session() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null')
    return s && s.sessionToken && s.exp * 1000 > Date.now() ? s : null
  } catch { return null }
}

function renderApp() {
  configureAmplify()
  createRoot(root).render(<StrictMode><App /></StrictMode>)
}

function signIn() {
  root.innerHTML = `<div id="gate" class="viewer-gate">
    <div class="viewer-gate-card">
      <img src="/logo-small.svg" alt="HyperTrack">
      <h1>Closeout</h1>
      <p>Sign in with your hypertrack.io Google account.</p>
      <div id="btn" class="viewer-gate-button"></div>
      <p id="gateErr" role="alert"></p>
    </div>
  </div>`
  const error = document.getElementById('gateErr')!
  const go = () => {
    const google = authWindow.google!
    google.accounts.id.initialize({
      client_id: authWindow.__GOOGLE_CLIENT_ID, auto_select: true,
      callback: async ({ credential }) => {
        error.textContent = ''
        try {
          const res = await fetch(`${API}/session`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: credential }),
          })
          if (!res.ok) { error.textContent = 'hypertrack.io accounts only.'; return }
          const s = await res.json()
          try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
          renderApp()
        } catch { error.textContent = 'Could not sign in. Please try again.' }
      },
    })
    google.accounts.id.renderButton(document.getElementById('btn')!, { theme: 'outline', size: 'large', text: 'signin_with' })
    google.accounts.id.prompt()
  }
  if (authWindow.google) return go()
  const sc = document.createElement('script')
  sc.src = 'https://accounts.google.com/gsi/client'
  sc.onload = go
  sc.onerror = () => { error.textContent = 'Could not load sign-in. Please refresh to try again.' }
  document.head.appendChild(sc)
}

if (import.meta.env.DEV || session()) renderApp()
else signIn()
