// Reference: J&J kit §7, journey-bar.pretty.js — section lines, adapted to real onboarding coverage.
import { Check } from 'lucide-react'
import { sectionProgress } from '@/lib/coverage'
import type { Onboarding } from '@/lib/onboarding'

export function JourneyBar({ state }: { state: Onboarding }) {
  const sections = sectionProgress(state)
  const current = sections.findIndex((section) => section.progress < 1)
  return <header className="setup-sections" aria-label="Onboarding progress">{sections.map((section, index) => <div key={section.id} className={`setup-section${index === current ? ' is-current' : ''}${section.progress === 1 ? ' is-complete' : ''}`}>
    <div className="setup-section-line" role="progressbar" aria-label={section.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(section.progress * 100)}><span style={{ transform: `scaleX(${section.progress})` }} /></div>
    <span>{section.progress === 1 && <Check size={12} aria-hidden />}{section.label}</span>
  </div>)}</header>
}
