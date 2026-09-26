import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Btn } from '@/components/ui'
import type { PendingAction } from '@/lib/usePendingAction'
import './action-button.css'

const Spinner = () => <span className="spinner" aria-hidden />

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  action: PendingAction
  actionKey?: string
  pendingLabel: string
  successLabel?: string
  children: ReactNode
}

/** All three labels share a grid cell. Their reserved width prevents layout jumps. */
export function ActionButton({ action, actionKey, pendingLabel, successLabel = 'Saved', children, className = '', disabled, ...props }: Props) {
  const status = actionKey === undefined || action.key === actionKey ? action.status : 'idle'
  const pending = status === 'pending', success = status === 'success'
  return <Btn {...props} className={`action-button ${success ? className.replace(/\bprimary\b/g, '') : className}`} disabled={disabled || action.inFlight || action.pending || success}
    data-action-state={status} aria-busy={pending || undefined}>
    <span className="action-button-labels">
      <span className="action-button-label" style={{ visibility: pending || success ? 'hidden' : 'visible' }} aria-hidden={pending || success || undefined}>{children}</span>
      <span className="action-button-label" style={{ visibility: pending ? 'visible' : 'hidden' }} aria-hidden={!pending}>{pending && <Spinner />}{pendingLabel}</span>
      <span className="action-button-label" style={{ visibility: success ? 'visible' : 'hidden' }} aria-hidden={!success}>{successLabel}<span aria-hidden="true">✓</span></span>
    </span>
  </Btn>
}

/** Keep failures beside their control; retry the exact operation, without losing input. */
export function ActionFeedback({ action, className = '' }: { action: PendingAction; className?: string }) {
  if (!action.error) return null
  return <span className={`action-feedback ${className}`} role="alert">{action.error}<Btn onClick={() => void action.retry()}>Retry</Btn></span>
}
