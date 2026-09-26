import { ArrowRight } from 'lucide-react'
import { Btn } from '@/components/ui'
import { postToChat } from '@/lib/chatBus'
import type { NextStep } from '@/lib/journey'
import { getOnboarding } from '@/lib/onboarding'
import type { FindingCounts } from '@/lib/findingCounts'
import { useTweened } from '@/lib/useTweened'
import { FindingCountSummary } from './FindingCountSummary'
import './next-step.css'

function CollectionCounts({ missingSets, gaps }: { missingSets: number; gaps: number }) {
  const sets = Math.round(useTweened(missingSets)), missing = Math.round(useTweened(gaps))
  return <span className="journey-next-counts tabular-nums">{[sets ? `${sets.toLocaleString()} missing ${sets === 1 ? 'set' : 'sets'}` : '', missing ? `${missing.toLocaleString()} gaps` : ''].filter(Boolean).join(' · ')}</span>
}

export function NextStepRow({ nextStep, cycle, onReview, primary = false, findingCounts }: {
  nextStep: NextStep
  cycle: { id: string; label: string }
  onReview?: () => void
  /** The pane's one black button, when it is the next step's action. */
  primary?: boolean
  findingCounts?: FindingCounts
}) {
  const { openGroups, missingSets, gaps } = nextStep.counts
  const label = nextStep.kind === 'done' ? 'Disputes' : nextStep.label
  function open() {
    if (nextStep.kind === 'review') onReview?.()
    const state = getOnboarding()
    postToChat({
      text: `${label} for ${cycle.label}`,
      contextChip: `${label} · ${cycle.label}`,
      context: { page: '/payroll', calendar: { frequency: state.frequency, periodEndDay: state.periodEndDay, payDay: state.payDay, payDatesOfMonth: state.payDatesOfMonth, cutoffDays: state.cutoffDays, deadlineDays: state.deadlineDays }, cycle: { id: cycle.id, label: cycle.label, stats: nextStep.detail }, selection: { nextStep } },
    })
  }
  return <div className="journey-next-step" role="region" aria-label="Next step" data-next-step={nextStep.kind}>
    <div className="journey-next-copy">
      <strong>{nextStep.label}</strong>
      {nextStep.kind !== 'review' && <span className="journey-next-detail">{nextStep.detail}</span>}
      {nextStep.kind === 'review' || nextStep.kind === 'send' || nextStep.kind === 'done' || findingCounts && findingCounts.total > 0
        ? <FindingCountSummary className="journey-next-counts" counts={{ toDecide: openGroups, waiting: findingCounts?.waiting ?? 0, total: openGroups + (findingCounts?.waiting ?? 0) }} />
        : (missingSets > 0 || gaps > 0) && <CollectionCounts missingSets={missingSets} gaps={gaps} />}
    </div>
    <Btn className={`journey-next-button${primary ? ' primary' : ''}`} onClick={open}>{label}<ArrowRight size={13} aria-hidden="true" /></Btn>
  </div>
}
