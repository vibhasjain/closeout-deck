import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Banknote, CircleCheck, Lock } from 'lucide-react'
import { money } from '@/bench/engine.js'
import { DESTS } from '@/bench/vendors'
import { CycleKpis } from '@/components/CycleKpis'
import { Intake } from '@/components/Intake'
import { PayrollSummary } from '@/components/PayrollSummary'
import { NextStepRow } from '@/components/journey/NextStepRow'
import { ShiftTable } from '@/components/ShiftTable'
import { useSetChatContext, useSetChatSuggestions } from '@/components/chat/ChatPane'
import { PageTitle } from '@/components/shell/PageTitle'
import { invalidate, pendingAdjustments } from '@/lib/data'
import { Btn, Tag } from '@/components/ui'
import { shortDate } from '@/lib/cycles'
import { cycleStats, useDesk } from '@/lib/desk'
import { cycleIntake, stepOf, type Step } from '@/lib/intake'
import { isTableView, payrollView, shiftHref } from '@/lib/navigation'
import { useJourneyThreads } from '@/lib/journey'
import { findingCounts } from '@/lib/findingCounts'
import { resolutionGroups } from '@/lib/resolution'
import { useOnboarding } from '@/lib/onboarding'
import { payTotals } from '@/lib/payroll'
import './reconcile.css'
import './payroll.css'

const destinations = DESTS.filter((destination) => destination.group !== 'Billing')

export function Payroll() {
  const { cycles, current, byId, loading, error } = useDesk()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const shiftOpen = useLocation().pathname !== '/payroll'
  const [state] = useOnboarding()
  // Payroll opens on the cycle waiting for review; a direct link can open any cycle.
  const cycle = byId(params.get('cycle') ?? '') ?? cycles.find((item) => item.status === 'needs-review') ?? current
  const closeDate = shortDate(cycle.deadline)
  const payDate = shortDate(cycle.payDate)
  const totals = payTotals(cycle)
  const stats = cycleStats(cycle, state.resolutions, state.undone[cycle.id])
  const intake = cycleIntake(cycle, state)
  // Server steps preserve unresolved gaps even after outreach; a saved view in the URL still wins.
  const collecting = cycle.nextStep ? cycle.nextStep.kind === 'get_timesheets' || cycle.nextStep.kind === 'chase_missing' : intake.open > 0
  const step = stepOf(params, collecting ? 'intake' : 'review')
  const { threads } = useJourneyThreads(cycle.server && cycle.week.length ? cycle.id : '')
  const destination = destinations.find((item) => item.name === cycle.batch?.destination)
    ?? destinations.find((item) => item.id === params.get('destination'))
    ?? destinations[0]

  // A direct visit or stale cycle bookmark always resolves to an explicit cycle URL.
  useEffect(() => {
    if (params.get('cycle') === cycle.id) return
    setParams((previous) => { const next = new URLSearchParams(previous); next.set('cycle', cycle.id); return next }, { replace: true })
  }, [cycle.id, params, setParams])

  const view = payrollView(params)

  function showStep(next: Step) {
    setParams((previous) => { const params = new URLSearchParams(previous); params.set('step', next); return params })
  }

  useSetChatSuggestions(['What needs my review?', 'Why does gross differ from the spreadsheet?', 'Which payments are on hold?'], !shiftOpen)
  useSetChatContext({ page: '/payroll', step: 'sheet', cycle: { id: cycle.id, label: cycle.label, stats: `${cycle.statusTag} · ${totals.workerCount} workers · ${money(totals.gross)} gross` },
    selection: { vendorId: destination.id, name: destination.name, workers: totals.workerCount, gross: totals.gross, held: cycle.batch?.held ?? totals.held.length },
    connections: state.connections }, !shiftOpen)

  return <div className="reconcile-layout payroll-layout">
    <section className="detail reconcile-payments" aria-label="Payroll">
      <PageTitle title="Payroll" description="Collect time entries, resolve discrepancies, and prepare each pay run." />
      {/* One black button per pane: the next step's, unless the visible Review list carries its own Approve. */}
      {cycle.nextStep && <NextStepRow nextStep={cycle.nextStep} cycle={cycle} findingCounts={findingCounts(resolutionGroups(cycle, state.resolutions, state.undone[cycle.id], threads, state.neverContact ?? []))} primary={cycle.nextStep.kind !== 'done' && !(cycle.nextStep.kind === 'review' && step === 'review')} onReview={() => {
        setParams((previous) => { const next = new URLSearchParams(previous); next.set('step', 'review'); next.set('filter', 'needs-review'); return next })
        requestAnimationFrame(() => document.getElementById('payroll-review-list')?.focus())
      }} />}
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
      {!cycle.batch && pendingAdjustments(cycle.adjustments) && <p role="status" className="r-note payroll-adjustments">{pendingAdjustments(cycle.adjustments)} · lands on this Payroll export</p>}
      {step === 'intake' ? <Intake cycle={cycle} intake={intake} threads={threads} /> : <>
        <CycleKpis cycle={cycle} stats={stats} />
        {isTableView(view)
          ? <ShiftTable key={view} cycle={cycle} filterMode="discrepancies" defaultFilter={view} onSelect={(id) => navigate(shiftHref(cycle.id, id, params, '/payroll'))} />
          : <PayrollSummary cycle={cycle} review={view === 'needs-review'} />}
      </>}
    </section>
    <Outlet />
  </div>
}
