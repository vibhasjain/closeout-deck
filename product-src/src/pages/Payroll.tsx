import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Banknote, CircleCheck, Lock } from 'lucide-react'
import { money } from '@/bench/engine.js'
import { DESTS } from '@/bench/vendors'
import { ClusterList } from '@/components/ClusterList'
import { CycleKpis } from '@/components/CycleKpis'
import { Intake } from '@/components/Intake'
import { PayrollSummary } from '@/components/PayrollSummary'
import { ShiftTable } from '@/components/ShiftTable'
import { useSetChatContext, useSetChatSuggestions } from '@/components/chat/ChatPane'
import { useOverlay } from '@/components/shell/Overlay'
import { Chip, Tag } from '@/components/ui'
import { shortDate } from '@/lib/cycles'
import { cycleStats, useDesk } from '@/lib/desk'
import { cycleIntake, defaultStep, stepOf, type Step } from '@/lib/intake'
import { shiftHref } from '@/lib/navigation'
import { getOnboarding, useOnboarding, type Onboarding } from '@/lib/onboarding'
import { payTotals } from '@/lib/payroll'
import './reconcile.css'
import './payroll.css'

type PayrollBatch = Onboarding['batches'][string]
const destinations = DESTS.filter((destination) => destination.group !== 'Billing')
const batchDestination = (batch: PayrollBatch) => destinations.find((destination) => batch.id.startsWith(`${destination.id.toUpperCase()}-`))
// A send belongs to its cycle. Leaving Payroll must not cancel or duplicate it.
const batchTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** Left-panel filters: the cycle waiting on review, and paid ones. The open cycle is left out for now. */
const PERIODS = [{ id: 'upcoming', label: 'Upcoming', statuses: ['needs-review'] }, { id: 'completed', label: 'Completed', statuses: ['reviewed'] }] as const
const inPeriod = (period: (typeof PERIODS)[number], status: string) => (period.statuses as readonly string[]).includes(status)

export function Payroll() {
  const { cycles, current, byId } = useDesk()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const shiftOpen = useLocation().pathname !== '/payroll'
  const [state, update] = useOnboarding()
  const { toast } = useOverlay()
  // Payroll opens on the cycle waiting for review. The open cycle isn't listed, but a direct link still opens it.
  const cycle = byId(params.get('cycle') ?? '') ?? cycles.find((item) => item.status === 'needs-review') ?? current
  const closeDate = shortDate(cycle.deadline)
  const payDate = shortDate(cycle.payDate)
  const period = PERIODS.find((item) => item.id === params.get('period')) ?? PERIODS.find((item) => inPeriod(item, cycle.status)) ?? PERIODS[0]
  const totals = payTotals(cycle)
  const stats = cycleStats(cycle, state.resolutions, state.undone[cycle.id])
  const intake = cycleIntake(cycle, state)
  const step = stepOf(params, defaultStep(cycle, intake))
  const batch = state.batches[cycle.id]
  const destination = (batch ? batchDestination(batch) : undefined)
    ?? destinations.find((item) => item.id === params.get('destination'))
    ?? destinations[0]

  // A direct visit or stale cycle bookmark always resolves to an explicit cycle URL.
  useEffect(() => {
    if (params.get('cycle') === cycle.id) return
    setParams((previous) => { const next = new URLSearchParams(previous); next.set('cycle', cycle.id); return next }, { replace: true })
  }, [cycle.id, params, setParams])

  // Reloading while a mock send is pending resumes that same persisted batch.
  useEffect(() => {
    for (const [cycleId, pendingBatch] of Object.entries(state.batches)) {
      if (pendingBatch.status !== 'sending' || batchTimers.has(cycleId)) continue
      batchTimers.set(cycleId, setTimeout(() => {
        batchTimers.delete(cycleId)
        const stored = getOnboarding()
        const pending = stored.batches[cycleId]
        if (pending?.status !== 'sending' || pending.id !== pendingBatch.id) return
        update({ batches: { ...stored.batches, [cycleId]: { ...pending, status: 'sent' } } })
        toast(`${pending.workers} workers · ${money(pending.gross)} · batch ${pending.id}`)
      }, 1200))
    }
  }, [state.batches, update, toast])

  // Review shows the summary's own rows, limited to what a person acts on.
  const reviewing = params.get('filter') === 'needs-review'
  // A cycle opens on its summary; the full time-entry list is one click away, and any filter or search opens it.
  const listing = params.get('view') === 'list' || params.has('filter') || params.has('q')

  function showList(on: boolean) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (on) next.set('view', 'list')
      else for (const key of ['view', 'filter', 'q', 'page', 'flag', 'review', 'cases']) next.delete(key)
      return next
    })
  }

  function showStep(next: Step) {
    setParams((previous) => { const params = new URLSearchParams(previous); params.set('step', next); return params })
  }

  function selectPeriod(id: string) {
    const chosen = PERIODS.find((p) => p.id === id)!
    // Upcoming opens the cycle waiting on review; Completed opens the newest paid one.
    const first = cycles.find((item) => item.status === 'needs-review' && inPeriod(chosen, item.status)) ?? cycles.find((item) => inPeriod(chosen, item.status))
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('period', id)
      next.delete('step')
      if (first && first.id !== cycle.id) {
        next.set('cycle', first.id)
        for (const key of ['destination', 'filter', 'q', 'flag', 'review', 'cases', 'page']) next.delete(key)
      }
      return next
    })
  }

  function selectCycle(id: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('cycle', id)
      if (id !== cycle.id) for (const key of ['destination', 'filter', 'flag', 'review', 'cases', 'page', 'step']) next.delete(key)
      return next
    })
  }

  useSetChatSuggestions(['What needs my review?', 'Why does gross differ from the spreadsheet?', 'Which payments are on hold?'], !shiftOpen)
  useSetChatContext({ page: '/payroll', step: 'sheet', cycle: { id: cycle.id, label: cycle.label, stats: `${cycle.statusTag} · ${totals.workers.length} workers · ${money(totals.gross)} gross` },
    selection: { vendorId: destination.id, name: destination.name, workers: totals.workers.length, gross: totals.gross, held: totals.held.length },
    connections: state.connections }, !shiftOpen)

  return <div className="reconcile-layout payroll-layout">
    <ClusterList kind="cycles" selected={cycle.id} onSelect={selectCycle}
      header={<div className="chip-row cycle-periods" role="group" aria-label="Show cycles">
        {PERIODS.map((item) => <Chip key={item.id} active={item.id === period.id} aria-pressed={item.id === period.id} onClick={() => selectPeriod(item.id)}>{item.label}</Chip>)}
      </div>}
      items={cycles.filter((item) => inPeriod(period, item.status)).map((item) => {
        const payouts = payTotals(item)
        const count = payouts.workers.length.toLocaleString()
        const total = money(payouts.gross)
        return {
          // The chip carries the cycle's identity the way the flags pane's chip carries a rule
          // id — the readable label, not the raw ISO key, and never repeated underneath.
          id: item.id, label: item.label, count: item.week.length, status: item.statusTag,
          tone: item.statusTag === 'Pending' ? 'amber' as const : undefined,
          sentence: <span role="img" aria-label={`${count} payouts, ${total}`}><Banknote aria-hidden="true" />{count} · {total}</span>,
        }
      })} />
    <section className="detail reconcile-payments" aria-label="Payroll">
      <div className="payroll-head">
        <div className="payroll-head-title">
          <h2>{cycle.label}</h2><Tag tone={cycle.statusTag === 'Pending' ? 'amber' : undefined}>{cycle.statusTag}</Tag>
        </div>
        <nav className="cycle-steps" aria-label="Pay cycle steps">
          <button type="button" className="cycle-step" aria-current={step === 'intake' ? 'step' : undefined} onClick={() => showStep('intake')}>Intake</button>
          <button type="button" className="cycle-step" aria-current={step === 'review' ? 'step' : undefined} onClick={() => showStep('review')}>Review</button>
        </nav>
        <span className="r-note payroll-dates">{cycle.statusTag === 'Paid'
          ? <span className="payroll-date" role="img" title={`Paid ${payDate}`} aria-label={`Paid ${payDate}`}><CircleCheck size={14} aria-hidden="true" />{payDate}</span>
          : <>
            <span className="payroll-date" role="img" title={`Payroll closes ${closeDate}`} aria-label={`Payroll closes ${closeDate}`}><Lock size={14} aria-hidden="true" />{closeDate}</span>
            <span className="payroll-date" role="img" title={`Pay date ${payDate}`} aria-label={`Pay date ${payDate}`}><Banknote size={14} aria-hidden="true" />{payDate}</span>
          </>}</span>
      </div>
      {step === 'intake' ? <Intake cycle={cycle} intake={intake} /> : <>
        <CycleKpis cycle={cycle} stats={stats} summary={!listing} listing={listing} onView={showList} />
        {reviewing ? <PayrollSummary cycle={cycle} review />
          : listing ? <ShiftTable cycle={cycle} filterMode="discrepancies" defaultFilter="total"
              onSelect={(id) => navigate(shiftHref(cycle.id, id, params, '/payroll'))} />
          : <PayrollSummary cycle={cycle} />}
      </>}
    </section>
    <Outlet />
  </div>
}
