import type { FindingCounts } from '@/lib/findingCounts'
import { useTweened } from '@/lib/useTweened'

export function FindingCountSummary({ counts, className = '' }: { counts: FindingCounts; className?: string }) {
  const toDecide = Math.round(useTweened(counts.toDecide))
  const waiting = Math.round(useTweened(counts.waiting))
  return <span className={`tabular-nums ${className}`}>{`${toDecide.toLocaleString()} to decide · ${waiting.toLocaleString()} waiting on evidence`}</span>
}
