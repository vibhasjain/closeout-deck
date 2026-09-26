import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { hasWarmResponseCache, peekCached, restoreResponseCache, startBootCache } from '@/lib/api'
import { hydrateOnboarding } from '@/lib/onboarding'
import SignIn from '@/pages/SignIn'
import { anySession, ensureViewerSession, viewerSession } from '@/lib/viewerSession'
import '@/index.css'
import '@/components/shell/shell.css'

const root = createRoot(document.getElementById('root')!)

function renderApp() {
  hasWarmResponseCache()
  startBootCache()
  performance.mark('closeout-app-mount')
  root.render(<StrictMode><App /></StrictMode>)
  void restoreResponseCache().then(() => {
    if (peekCached('/state')) void hydrateOnboarding().catch(() => {})
  })
}

function renderSignIn() {
  root.render(<StrictMode><SignIn onSignedIn={renderApp} /></StrictMode>)
}

// Signed in on /answers or /job but not here yet: mint our session silently, else show the sign-in.
if (import.meta.env.DEV || viewerSession()) renderApp()
else if (anySession()) void ensureViewerSession().then((session) => (session ? renderApp() : renderSignIn()))
else renderSignIn()
