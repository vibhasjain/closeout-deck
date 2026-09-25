import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Banknote, CircleCheck, Lock } from 'lucide-react'
import { money } from '@/bench/engine.js'
import { DESTS } from '@/bench/vendors'
import { CycleKpis } from '@/components/CycleKpis'
import { Intake } from '@/components/Intake'
import { PayrollSummary } from '@/components/PayrollSummary'
import { ShiftTable } from '@/components/ShiftTable'
import { useSetChatContext, useSetChatSuggestions } from '@/components/chat/ChatPane'
import { useOverlay } from '@/components/shell/Overlay'
import { PageTitle } from '@/components/shell/PageTitle'
import { invalidate } from '@/lib/data'
import { Btn, Tag } from '@/components/ui'
import { shortDate } from '@/lib/cycles'
import { cycleStats, useDesk } from '@/lib/desk'
import { cycleIntake, stepOf, type Step } from '@/lib/intake'
import { isTableView, payrollView, shiftHref } from '@/lib/navigation'
import { getOnboarding, useOnboarding, type Onboarding } from '@/lib/onboarding'
import { payTotals } from '@/lib/payroll'
import './reconcile.css'
import './payroll.css'

type PayrollBatch = Onboarding['batches'][string]
const destinations = DESTS.filter((destination) => destination.group !== 'Billing')
const batchDestination = (batch: PayrollBatch) => destinations.find((destination) => batch.id.startsWith(`${destination.id.toUpperCase()}-`))
// A send belongs to its cycle. Leaving Payroll must not cancel or duplicate it.
const batchTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function Payroll() {
  const { cycles, current, byId, loading, error } = useDesk()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const shiftOpen = useLocation().pathname !== '/payroll'
  const [state, update] = useOnboarding()
  const { toast } = useOverlay()
  // Payroll opens on the cycle waiting for review; a direct link can open any cycle.
  const cycle = byId(params.get('cycle') ?? '') ?? cycles.find((item) => item.status === 'needs-review') ?? current
  const closeDate = shortDate(cycle.deadline)
  const payDate = shortDate(cycle.payDate)
  const totals = payTotals(cycle)
  const stats = cycleStats(cycle, state.resolutions, state.undone[cycle.id])
  const intake = cycleIntake(cycle, state)
  // A cycle opens on Collect while anything is pending, on Review once everything's in; a view in the URL opens Review.
  const step = stepOf(params, intake.open > 0 ? 'intake' : 'review')
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

  const view = payrollView(params)

  function showStep(next: Step) {
    setParams((previous) => { const params = new URLSearchParams(previous); params.set('step', next); return params })
  }

  useSetChatSuggestions(['What needs my review?', 'Why does gross differ from the spreadsheet?', 'Which payments are on hold?'], !shiftOpen)
  useSetChatContext({ page: '/payroll', step: 'sheet', cycle: { id: cycle.id, label: cycle.label, stats: `${cycle.statusTag} · ${totals.workers.length} workers · ${money(totals.gross)} gross` },
    selection: { vendorId: destination.id, name: destination.name, workers: totals.workers.length, gross: totals.gross, held: totals.held.length },
    connections: state.connections }, !shiftOpen)

  return <div className="reconcile-layout payroll-layout">
    <section className="detail reconcile-payments" aria-label="Payroll">
      <PageTitle title="Payroll" description="Collect time entries, resolve discrepancies, and prepare each pay run." />
      <div className="payroll-head">
        <div className="payroll-head-title">
          <h2>{cycle.label}</h2>{(cycle.sample || cycle.week.some(shift => shift.sample)) && <Tag>{cycle.sample ? 'Sample' : 'Includes Sample'}</Tag>}<Tag tone={cycle.statusTag === 'Pending' ? 'amber' : undefined}>{cycle.statusTag}</Tag>
        </div>
        <nav className="cycle-steps" aria-label="Pay cycle steps">
          <button type="button" className="cycle-step" aria-current={step === 'intake' ? 'step' : undefined} onClick={() => showStep('intake')}>Collect</button>
          <button type="button" className="cycle-step" aria-current={step === 'review' ? 'step' : undefined} onClick={() => showStep('review')}>Review</button>
        </nav>
        <span className="r-note payroll-dates">{cycle.statusTag === 'Paid'
          ? <span className="payroll-date" role="img" title={`Paid ${payDate}`} aria-label={`Paid ${payDate}`}><CircleCheck size={14} aria-hidden="true" />{payDate}</span>
          : <>
            <span className="payroll-date" role="img" title={`Payroll closes ${closeDate}`} aria-label={`Payroll closes ${closeDate}`}><Lock size={14} aria-hidden="true" />{closeDate}</span>
            <span className="payroll-date" role="img" title={`Pay date ${payDate}`} aria-label={`Pay date ${payDate}`}><Banknote size={14} aria-hidden="true" />{payDate}</span>
          </>}</span>
      </div>
      {error && <div role="alert"><p>{error}</p><Btn onClick={() => void invalidate()}>Retry</Btn></div>}
      {loading && cycle.server && !cycle.week.length && <p role="status" className="r-note">Loading time entries…</p>}
      {step === 'intake' ? <Intake cycle={cycle} intake={intake} /> : <>
        <CycleKpis cycle={cycle} stats={stats} />
        {isTableView(view)
          ? <ShiftTable key={view} cycle={cycle} filterMode="discrepancies" defaultFilter={view} onSelect={(id) => navigate(shiftHref(cycle.id, id, params, '/payroll'))} />
          : <PayrollSummary cycle={cycle} review={view === 'needs-review'} />}
      </>}
    </section>
    <Outlet />
  </div>
}
