import { money } from '@/bench/engine.js'
import { cn } from '@/lib/utils'
import './PayDelta.css'

interface PayDeltaProps {
  current: number
  resolved: number
  size?: 'sm' | 'md' | 'lg'
  orientation?: 'vertical' | 'horizontal'
  align?: 'start' | 'end'
  timeEntries?: number
  className?: string
}

export function PayDelta({ current, resolved, size = 'md', orientation = 'horizontal', align = 'end', timeEntries, className }: PayDeltaProps) {
  const delta = resolved - current
  const change = `${delta < -0.005 ? '−' : delta > 0.005 ? '+' : ''}${money(Math.abs(delta))}`
  return <span className={cn('pay-amounts', `pay-amounts-${size}`, `pay-amounts-${orientation}`, `pay-amounts-${align}`, className)}>
    {timeEntries !== undefined && <span className="pay-amounts-entries">
      <span className="pay-amounts-value">{timeEntries.toLocaleString()}</span>
      <span className="pay-amounts-caption">Time entries</span>
    </span>}
    <span className="pay-amounts-current">
      <span className="pay-amounts-value">{money(current)}</span>
      <span className="pay-amounts-caption">Current</span>
    </span>
    <span className="pay-amounts-resolved">
      <span className="pay-amounts-value">{money(resolved)}</span>
      <span className="pay-amounts-caption">Resolved{align === 'start' && <span className="pay-amounts-change">{change}</span>}</span>
    </span>
  </span>
}
