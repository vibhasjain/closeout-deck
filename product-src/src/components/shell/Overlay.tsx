import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type Surface = { kind: 'drawer' | 'modal'; node: ReactNode; title?: string; sub?: string }
type Phase = 'open' | 'closing'
interface OverlayActions {
  openDrawer(node: ReactNode, title: string, sub?: string): void
  openModal(node: ReactNode): void
  close(): void
  toast(text: string): void
}
interface OverlayState {
  surface: Surface | null
  phase: Phase
  message: string | null
}

const ActionsContext = createContext<OverlayActions | null>(null)
const StateContext = createContext<OverlayState>({ surface: null, phase: 'open', message: null })

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<Surface | null>(null)
  const [phase, setPhase] = useState<Phase>('open')
  const [message, setMessage] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const trigger = useRef<HTMLElement | null>(null)

  const open = useCallback((next: Surface) => {
    clearTimeout(closeTimer.current)
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('[aria-modal="true"]')) {
      trigger.current = document.activeElement
    }
    setSurface(next)
    // Mount the visible frame in this click; its content owns any pending skeleton.
    setPhase('open')
  }, [])
  const close = useCallback(() => {
    clearTimeout(closeTimer.current)
    setPhase('closing')
    closeTimer.current = setTimeout(() => {
      setSurface(null)
      trigger.current?.focus()
    }, 120)
  }, [])
  const toast = useCallback((text: string) => {
    clearTimeout(toastTimer.current)
    setMessage(text)
    toastTimer.current = setTimeout(() => setMessage(null), 2400)
  }, [])
  const actions = useMemo<OverlayActions>(() => ({
    openDrawer: (node, title, sub) => open({ kind: 'drawer', node, title, sub }),
    openModal: (node) => open({ kind: 'modal', node }),
    close,
    toast,
  }), [open, close, toast])

  useEffect(() => () => {
    clearTimeout(closeTimer.current)
    clearTimeout(toastTimer.current)
  }, [])

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={{ surface, phase, message }}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOverlay(): OverlayActions {
  const actions = useContext(ActionsContext)
  if (!actions) throw new Error('useOverlay requires AppShell')
  return actions
}

export function Overlay() {
  const { surface, phase, message } = useContext(StateContext)
  const { close } = useOverlay()
  const dialog = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const subId = useId()

  useEffect(() => {
    if (!surface) return
    dialog.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
      if (event.key !== 'Tab' || !dialog.current) return
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first) {
        event.preventDefault()
        dialog.current.focus()
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [surface, close])

  const stateClass = phase === 'open' ? ' open' : ' closing'
  return createPortal(
    <>
      {surface && <>
        <div className={`scrim overlay-scrim${stateClass}`} onClick={close} aria-hidden="true" />
        <div ref={dialog} className={`${surface.kind}${stateClass}`} role="dialog" aria-modal="true" tabIndex={-1}
          aria-labelledby={surface.title ? titleId : undefined} aria-label={surface.title ? undefined : 'Dialog'}
          aria-describedby={surface.sub ? subId : undefined}>
          {surface.kind === 'drawer' ? <>
            <div className="drawer-head">
              <div className="htext">
                <h2 id={titleId} className="drawer-title">{surface.title}</h2>
                {surface.sub && <p id={subId} className="drawer-sub">{surface.sub}</p>}
              </div>
              <button type="button" className="icon-btn" aria-label="Close drawer" onClick={close}><X aria-hidden="true" /></button>
            </div>
            <div className="drawer-body scroll">{surface.node}</div>
          </> : surface.node}
        </div>
      </>}
      {message && <div className="toast open" role="status">{message}</div>}
    </>,
    document.body,
  )
}
