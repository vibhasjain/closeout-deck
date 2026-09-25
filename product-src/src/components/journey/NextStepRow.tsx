import { ArrowRight } from 'lucide-react'
import { Btn } from '@/components/ui'
import { postToChat } from '@/lib/chatBus'
import type { NextStep } from '@/lib/journey'
import { getOnboarding } from '@/lib/onboarding'
import './next-step.css'

export function NextStepRow({ nextStep, cycle, onReview }: {
  nextStep: NextStep
  cycle: { id: string; label: string }
  onReview?: () => void
}) {
  const { missingSets, gaps, openGroups } = nextStep.counts
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
  return <div className="journey-next-step" aria-label="Next step" data-next-step={nextStep.kind}>
    <div className="journey-next-copy">
      <strong>{nextStep.label}</strong>
      <span className="journey-next-detail">{nextStep.detail}</span>
      <span className="journey-next-counts">{missingSets.toLocaleString()} missing sets · {gaps.toLocaleString()} gaps · {openGroups.toLocaleString()} open groups</span>
    </div>
    <Btn className="journey-next-button" onClick={open}>{label}<ArrowRight size={13} aria-hidden="true" /></Btn>
  </div>
}
