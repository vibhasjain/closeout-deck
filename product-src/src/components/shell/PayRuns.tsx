import { SkeletonRegion } from '@/components/Skeleton'
import { useEffect, useId, useState } from 'react'
import { Banknote, CalendarDays } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { money } from '@/bench/engine.js'
import { ClusterList } from '@/components/ClusterList'
import { useDesk } from '@/lib/desk'
import { invalidate, pendingAdjustments } from '@/lib/data'
import { payTotals } from '@/lib/payroll'

/** The shared cycle rows live in navigation so they remain available on every page. */
export function PayRuns({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { cycles, current, byId, loaded, error, cycleErrors } = useDesk()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const id = useId()
  const cycle = byId(params.get('cycle') ?? '') ?? cycles.find((item) => item.status === 'needs-review') ?? current

  useEffect(() => {
    if (!open) return
    const section = document.getElementById(id)
    section?.querySelector<HTMLElement>('.cluster-row.active, .cluster-row')?.focus()
    const onPointer = (event: PointerEvent) => { if (!section?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      section?.querySelector<HTMLElement>('.pay-runs-toggle')?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey, true) }
  }, [open, id])

  function selectCycle(id: string) {
    const next = new URLSearchParams(params)
    next.set('cycle', id)
    if (id !== cycle.id) for (const key of ['destination', 'filter', 'flag', 'review', 'cases', 'page', 'step']) next.delete(key)
    navigate(`/payroll?${next}`)
    setOpen(false)
    onNavigate?.()
  }

  return <section id={id} className={`sidebar-pay-runs${open ? ' pay-runs-open' : ''}`} aria-label="Pay runs">
    <button type="button" className="sidebar-nav-item pay-runs-toggle" aria-label="Pay runs" title="Pay runs" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => setOpen((current) => !current)}><CalendarDays size={16} aria-hidden="true" /></button>
    <div id={`${id}-list`} className="pay-runs-content">
    <h2 className="sidebar-section-title">Pay runs</h2>
    {error ? <div className="pay-runs-load-state" role="alert"><p>Pay runs could not be loaded.</p><button type="button" className="btn" onClick={() => void invalidate()}>Retry</button></div> : loaded === false ? <SkeletonRegion variant="rail" /> : <ClusterList kind="cycles" selected={cycle.id} onSelect={selectCycle}
      items={cycles.map((item) => {
        const payouts = payTotals(item)
        const count = payouts.workerCount.toLocaleString()
        const total = money(payouts.gross)
        return {
          id: item.id, label: item.label, count: item.week.length, status: item.sample ? `${item.statusTag} · Sample` : item.week.some(shift => shift.sample) ? `${item.statusTag} · Includes Sample` : item.statusTag,
          tone: item.statusTag === 'Pending' ? 'amber' as const : undefined,
          // With time entries the payout total already includes adjustments; before them, say what is pending (N8).
          sentence: cycleErrors?.[item.id] ? 'Time entries could not be loaded' : item.server && !item.week.length && (pendingAdjustments(item.adjustments) ?? (item.nextStep?.kind === 'get_timesheets' ? 'No time entries yet' : null))
            || <span role="img" aria-label={`${count} payouts, ${total}`}><Banknote aria-hidden="true" />{count} · {total}</span>,
        }
      })} />}
    </div>
  </section>
}
