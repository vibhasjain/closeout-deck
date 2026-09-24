import { useSearchParams } from 'react-router-dom'
import { LayoutDashboard, List } from 'lucide-react'
import { StatRow } from '@/components/StatRow'
import { money } from '@/bench/engine.js'
import type { cycleStats, DeskCycle } from '@/lib/desk'

type Stats = ReturnType<typeof cycleStats>
type Filter = 'all' | 'total' | 'agent-resolved' | 'needs-review'

/** The cycle's summary is also its ledger filter. Counts are engine findings. */
/** `summary`: nothing is selected yet; picking a stat opens the list filtered to it. */
export function CycleKpis({ cycle, stats, summary = false, listing, onView }: { cycle: DeskCycle; stats: Stats; summary?: boolean; listing: boolean; onView(listing: boolean): void }) {
  const [params, setParams] = useSearchParams()
  const selected = params.get('filter')
  // The cycle opens on its discrepancies; one fill marks whichever view is selected.
  const filter = selected && ['all', 'total', 'agent-resolved', 'needs-review'].includes(selected) ? selected : 'total'
  const disputeTitle = cycle.statusTag === 'Paid' ? 'Dispute data is not available for this cycle' : 'Payroll has not run yet'
  const pick = (value: Filter) => ({
    pressed: !summary && filter === value,
    onSelect: () => setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('filter', value)
      next.delete('page')
      return next
    }),
  })

  return <StatRow label="Cycle summary" stats={[
    { label: 'Payments', value: stats.payments.toLocaleString(), ...pick('all') },
    { label: 'Gross', value: money(stats.gross) },
    { label: 'Discrepancies', value: stats.total.toLocaleString(), ...pick('total'), accessory: <div className="stat-view-switch" role="group" aria-label="Time entry view">
      <button type="button" aria-label="Show summary" title="Show summary" aria-pressed={!listing} onClick={() => onView(false)}><LayoutDashboard size={14} aria-hidden="true" /></button>
      <button type="button" aria-label="Show all time entries" title="Show all time entries" aria-pressed={listing} onClick={() => onView(true)}><List size={14} aria-hidden="true" /></button>
    </div> },
    { label: 'Resolved', value: stats.agentResolved.toLocaleString(), ...pick('agent-resolved') },
    { label: 'Review', value: stats.needsReview.toLocaleString(), tone: 'flagged', ...pick('needs-review') },
    { label: 'Disputes', value: '—', title: disputeTitle, disabled: true },
  ]} />
}
