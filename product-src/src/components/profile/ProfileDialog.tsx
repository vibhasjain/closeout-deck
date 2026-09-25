import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import './profile.css'

/** Shared fixed header/body/footer, with focus containment and keyboard dismissal. */
export function ProfileDialog({ title, description, onClose, children, className = '', footer, closeDisabled = false }: {
  title: string; description: string; onClose(): void; children: ReactNode; className?: string; footer?: ReactNode; closeDisabled?: boolean
}) {
  const element = useRef<HTMLDivElement>(null)
  const titleId = useId(), descriptionId = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return <div className="profile-modal-backdrop" onClick={(event) => { if (!closeDisabled && event.target === event.currentTarget) onClose() }}>
    <div className={`profile-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} ref={element} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); if (!closeDisabled) onClose() }
      if (event.key !== 'Tab') return
      const elements = Array.from(element.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((node) => node.getClientRects().length)
      const first = elements[0], last = elements.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element.current)) { event.preventDefault(); first.focus() }
    }}>
      <header className="profile-modal-header"><div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div>
        <button type="button" className="profile-icon-button" aria-label="Close" disabled={closeDisabled} onClick={onClose}><X size={17} /></button>
      </header>
      {children}
      <footer className="profile-modal-footer">{footer ?? <button type="button" className="btn primary" onClick={onClose}>Done</button>}</footer>
    </div>
  </div>
}
