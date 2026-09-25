import type { Onboarding, ProfileValue } from '@/lib/onboarding'

/** Preview copy stays compact; the editor retains every structured field. */
export function profileSummary(value: ProfileValue | undefined): string {
  const text = typeof value === 'string' ? value : value?.summary || Object.values(value ?? {}).filter(Boolean).join(' · ')
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 150 ? `${line.slice(0, 149).trimEnd()}…` : line
}

export function writingRows(state: Onboarding) {
  const learned = (topic: Onboarding['covered'][number], value?: ProfileValue) => state.covered.includes(topic) && !!profileSummary(value)
  return [
    { title: 'Profile', rows: [
      { title: 'The essentials', complete: !!state.firm?.name },
      { title: 'Pay calendar', complete: state.covered.includes('calendar') },
      { title: 'Worker-reported hours', complete: learned('workerHours', state.profile.workerHours) || state.covered.includes('workerHours') && state.sources.some((source) => source.set === 1) },
      { title: 'Client-approved hours', complete: learned('clientHours', state.profile.clientHours) || state.covered.includes('clientHours') && state.sources.some((source) => source.set === 2) },
      { title: 'Whose hours we pay', complete: learned('whoseHours', state.profile.whoseHours) },
    ] },
    { title: 'Rulebook', rows: [
      { title: 'State rules', complete: !!state.firm?.states.length },
      { title: 'Rates and client rules', complete: learned('rates', state.profile.ratesWhere) },
      { title: 'What I fix on my own', complete: state.authorityConfigured && state.covered.includes('authority') },
      { title: 'Pay complaints', complete: learned('complaints', state.profile.complaints) },
    ] },
  ]
}
