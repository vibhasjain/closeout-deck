import { useSearchParams } from 'react-router-dom'
import { StatRow } from '@/components/StatRow'
import { payrollView, type PayrollView } from '@/lib/navigation'
import type { cycleStats, DeskCycle } from '@/lib/desk'

type Stats = ReturnType<typeof cycleStats>

/** The stats row is the view switch: Payments and Resolved are tables, Discrepancies and Review are the grouped summary. */
export function CycleKpis({ stats }: { cycle: DeskCycle; stats: Stats }) {
  const [params, setParams] = useSearchParams()
  const view = payrollView(params)
  const pick = (value: PayrollView) => ({
    pressed: view === value,
    onSelect: () => setParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const key of ['view', 'q', 'page', 'flag', 'review', 'cases']) next.delete(key)
      next.set('filter', value)
      return next
    }),
  })

  return <StatRow label="Cycle summary" stats={[
    { label: 'Payments', value: stats.payments.toLocaleString(), ...pick('all') },
    { label: 'Discrepancies', value: stats.total.toLocaleString(), ...pick('total') },
    { label: 'Resolved', value: stats.agentResolved.toLocaleString(), ...pick('agent-resolved') },
    { label: 'Review', value: stats.needsReview.toLocaleString(), tone: 'flagged', ...pick('needs-review') },
    // No dispute data yet: an empty, inert tile (the space keeps the row height).
    { label: 'Disputes', value: '\u00a0' },
  ]} />
}
