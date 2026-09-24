import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { ChatPane } from '@/components/chat/ChatPane'

type Phase = 'closed' | 'entering' | 'open' | 'closing'

export function AgentPanel() {
  const [params, setParams] = useSearchParams()
  const open = params.get('agent') === '1'
  const [phase, setPhase] = useState<Phase>(open ? 'entering' : 'closed')
  const dialog = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useCallback(() => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('agent')
      return next
    })
    document.querySelector<HTMLButtonElement>('[data-agent-toggle]')?.focus()
  }, [setParams])

  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      setPhase((current) => open ? current === 'open' ? 'open' : 'entering' : current === 'closed' ? 'closed' : 'closing')
      if (open) frame = requestAnimationFrame(() => setPhase('open'))
    })
    const timer = open ? undefined : setTimeout(() => setPhase('closed'), 120)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
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
  }, [open, close])

  const stateClass = phase === 'open' ? ' open' : phase === 'closing' ? ' closing' : ''
  const hidden = !open && phase === 'closed'
  return <>
    <div className={`scrim agent-scrim${stateClass}`} hidden={hidden} onClick={close} aria-hidden="true" />
    <div id="agent-panel" ref={dialog} className={`drawer agent-panel${stateClass}`} hidden={hidden} inert={!open}
      role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="drawer-head">
        <h2 id={titleId} className="drawer-title">Agent</h2>
        <button type="button" className="btn icon-btn" aria-label="Close agent" onClick={close}><X aria-hidden="true" /></button>
      </div>
      <ChatPane />
    </div>
  </>
}
