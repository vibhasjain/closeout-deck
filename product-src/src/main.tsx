import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import SignIn from '@/pages/SignIn'
import { viewerSession } from '@/lib/viewerSession'
import '@/index.css'
import '@/components/shell/shell.css'

const root = createRoot(document.getElementById('root')!)

function renderApp() {
  root.render(<StrictMode><App /></StrictMode>)
}

if (import.meta.env.DEV || viewerSession()) renderApp()
else root.render(<StrictMode><SignIn onSignedIn={renderApp} /></StrictMode>)
