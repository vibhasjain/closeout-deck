import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { purgeLegacyStorage } from './api'
import { installNoZoom } from './lib/noZoom'

purgeLegacyStorage()
installNoZoom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
