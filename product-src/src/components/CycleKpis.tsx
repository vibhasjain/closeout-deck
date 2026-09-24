import { useSearchParams } from 'react-router-dom'
import { StatRow } from '@/components/StatRow'
import type { cycleStats, DeskCycle } from '@/lib/desk'

type Stats = ReturnType<typeof cycleStats>
type Filter = 'all' | 'total' | 'agent-resolved' | 'needs-review'

/** The cycle's summary is also its ledger filter. Counts are engine findings. */
/** `summary`: nothing is selected yet; picking a stat opens the list filtered to it, picking it again returns to the summary. */
export function CycleKpis({ cycle, stats, summary = false, onSummary }: { cycle: DeskCycle; stats: Stats; summary?: boolean; onSummary(): void }) {
  const [params, setParams] = useSearchParams()
  const selected = params.get('filter')
  // The cycle opens on its discrepancies; one fill marks whichever view is selected.
  const filter = selected && ['all', 'total', 'agent-resolved', 'needs-review'].includes(selected) ? selected : 'total'
  const disputeTitle = cycle.statusTag === 'Paid' ? 'Dispute data is not available for this cycle' : 'Payroll has not run yet'
  const pick = (value: Filter) => ({
    pressed: !summary && filter === value,
    onSelect: () => !summary && filter === value ? onSummary() : setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('filter', value)
      next.delete('page')
      return next
    }),
  })

  return <StatRow label="Cycle summary" stats={[
    { label: 'Payments', value: stats.payments.toLocaleString(), ...pick('all') },
    { label: 'Discrepancies', value: stats.total.toLocaleString(), ...pick('total') },
    { label: 'Resolved', value: stats.agentResolved.toLocaleString(), ...pick('agent-resolved') },
    { label: 'Review', value: stats.needsReview.toLocaleString(), tone: 'flagged', ...pick('needs-review') },
    { label: 'Disputes', value: '—', title: disputeTitle, disabled: true },
  ]} />
}
