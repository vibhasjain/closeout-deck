import { ONBOARD_TOPICS } from '@/lib/onboarding'
import type { Onboarding, OnboardTopic } from '@/lib/onboarding'

/** Only accepted cover_topic actions advance the conversation's goals. */
export function goalProgress(covered: readonly string[]) {
  const known = new Set<OnboardTopic>(covered.filter((topic): topic is OnboardTopic => ONBOARD_TOPICS.some((item) => item === topic)))
  return { done: known.size, total: ONBOARD_TOPICS.length, progress: known.size / ONBOARD_TOPICS.length }
}

export function onboardingComplete(state: Pick<Onboarding, 'forwarded'>) { return state.forwarded }

export function sectionProgress(state: Pick<Onboarding, 'covered' | 'setupStep' | 'forwarded'>) {
  const basics = state.setupStep === 'welcome' ? 0 : state.setupStep === 'basics' ? 1 / 3 : state.setupStep === 'trust' ? 2 / 3 : 1
  const conversationFinished = ['writing', 'ready', 'never-contact'].includes(state.setupStep)
  const conversation = basics < 1 ? 0 : conversationFinished ? 1 : Math.min(goalProgress(state.covered).progress, 0.99)
  return [
    { id: 'basics' as const, label: 'The basics', progress: basics },
    { id: 'conversation' as const, label: 'Talk to the Closeout Agent', progress: conversation },
    { id: 'kickoff' as const, label: 'Kick off your first closeout', progress: basics === 1 && conversation === 1 && state.setupStep === 'ready' && onboardingComplete(state) ? 1 : 0 },
  ]
}
