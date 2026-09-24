import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureAmplify } from '@/lib/auth'
import App from '@/App'
import '@/index.css'
import '@/components/shell/shell.css'

configureAmplify()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
