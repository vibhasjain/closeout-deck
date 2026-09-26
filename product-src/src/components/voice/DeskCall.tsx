import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CallBar } from './CallBar'
import { CallScreen } from './CallScreen'
import type { CallControlsProps } from './callPresentation'

const PHONE_CALL_QUERY = '(max-width: 1023.98px)'
const isPhone = () => window.matchMedia(PHONE_CALL_QUERY).matches
const serverPhone = () => false
function subscribeViewport(change: () => void) {
  const viewport = window.matchMedia(PHONE_CALL_QUERY)
  viewport.addEventListener('change', change)
  return () => viewport.removeEventListener('change', change)
}

/** Presentation changes never create, end, or replace the live session. */
export function DeskCall(props: CallControlsProps) {
  const phone = useSyncExternalStore(subscribeViewport, isPhone, serverPhone)
  const [minimized, setMinimized] = useState(false)
  const fullScreen = phone && !minimized
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => {
    surface.current?.querySelector<HTMLButtonElement>(fullScreen ? '[aria-label="Minimize call"]' : '[aria-label="Expand call"]')?.focus()
  }, [fullScreen])

  return <div ref={surface} className={`desk-call${fullScreen ? ' desk-call--fullscreen' : ''}`}>
    {fullScreen
      ? <CallScreen {...props} purpose="desk" onMinimize={() => setMinimized(true)} />
      : <CallBar {...props} onExpand={phone ? () => setMinimized(false) : undefined} />}
  </div>
}
