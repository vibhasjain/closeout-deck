import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { ChatPane } from '@/components/chat/ChatPane'
import { ThinkingOrb } from 'thinking-orbs'

type Phase = 'closed' | 'entering' | 'open' | 'closing'

export function AgentPanel({ docked = false, suppressed = false }: { docked?: boolean; suppressed?: boolean }) {
  const [params, setParams] = useSearchParams()
  const open = params.get('agent') === '1'
  const [phase, setPhase] = useState<Phase>(open ? 'entering' : 'closed')
  const dialog = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const restoreFocus = useRef(0)
  const close = useCallback(() => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('agent')
      return next
    })
    cancelAnimationFrame(restoreFocus.current)
    // The floating trigger becomes visible after the URL update has rendered.
    restoreFocus.current = requestAnimationFrame(() => {
      if (dialog.current?.getAttribute('role') !== 'dialog') return
      const visible = (element: HTMLElement) => element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible'
      const toggles = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-agent-toggle]'))
      const target = trigger.current && visible(trigger.current) ? trigger.current : toggles.find(visible)
      target?.focus()
    })
  }, [setParams])

  useEffect(() => () => cancelAnimationFrame(restoreFocus.current), [])

  useEffect(() => {
    if (docked || suppressed) return
    let frame = requestAnimationFrame(() => {
      setPhase((current) => open ? current === 'open' ? 'open' : 'entering' : current === 'closed' ? 'closed' : 'closing')
      if (open) frame = requestAnimationFrame(() => setPhase('open'))
    })
    const timer = open ? undefined : setTimeout(() => setPhase('closed'), 120)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [open, docked, suppressed])

  useEffect(() => {
    if (!open || docked || suppressed || phase !== 'open') return
    if (document.activeElement instanceof HTMLElement && document.activeElement.matches('[data-agent-toggle]')) {
      trigger.current = document.activeElement
    }
    dialog.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      // A source drawer or other modal above the agent handles its own keys.
      if (document.querySelector('.drawer:not(.agent-panel), .modal.open')) return
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
  }, [open, close, docked, suppressed, phase])

  const stateClass = phase === 'open' ? ' open' : phase === 'closing' ? ' closing' : ''
  const hidden = suppressed || (!docked && !open && phase === 'closed')
  return <>
    {!docked && !suppressed && <div className={`scrim agent-scrim${stateClass}`} hidden={hidden} onClick={close} aria-hidden="true" />}
    <div id="agent-panel" ref={dialog} className={`agent-panel${docked ? ' agent-docked' : ` drawer${stateClass}`}`} hidden={hidden} inert={docked ? undefined : !open || suppressed}
      role={docked ? 'complementary' : 'dialog'} aria-modal={docked ? undefined : true} aria-label="Closeout Agent" tabIndex={docked ? undefined : -1}>
      <ChatPane headerAction={!docked ? <button type="button" className="btn icon-btn" aria-label="Close agent" onClick={close}><X aria-hidden="true" /></button> : undefined} />
    </div>
    {!suppressed && <button type="button" className="agent-fab" data-agent-toggle aria-label="Open Closeout Agent" aria-expanded={open} aria-controls="agent-panel" onClick={(event) => {
      trigger.current = event.currentTarget
      setParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('agent', '1')
        return next
      })
    }}><ThinkingOrb size={32} theme="light" state="breathing" /></button>}
  </>
}
