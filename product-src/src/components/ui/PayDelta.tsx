import { money } from '@/bench/engine.js'
import { cn } from '@/lib/utils'
import './PayDelta.css'

interface PayDeltaProps {
  current: number
  resolved: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function PayDelta({ current, resolved, size = 'md', className }: PayDeltaProps) {
  return <span className={cn('pay-amounts', `pay-amounts-${size}`, className)}>
    <span className="pay-amounts-current">
      <span className="pay-amounts-value">{money(current)}</span>
      <span className="pay-amounts-caption">Current</span>
    </span>
    <span className="pay-amounts-resolved">
      <span className="pay-amounts-value">{money(resolved)}</span>
      <span className="pay-amounts-caption">Resolved</span>
    </span>
  </span>
}
