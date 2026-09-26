import type { OrbState } from 'thinking-orbs'
import type { CallSnapshot } from './live'

export type AgentActivity = 'idle' | 'thinking' | 'listening' | 'processing'

/** One visual vocabulary for the onboarding tile, conversation and voice call. */
export const AGENT_ORB_MODES = {
  idle: 'breathing',
  thinking: 'composing',
  listening: 'listening',
  processing: 'working',
} as const satisfies Record<AgentActivity, OrbState>

export function agentOrb(activity: AgentActivity, reducedMotion = false) {
  return { state: AGENT_ORB_MODES[reducedMotion ? 'idle' : activity], paused: reducedMotion || activity === 'idle' }
}

export function callActivity(state: CallSnapshot['orb']): AgentActivity {
  if (state === 'listening') return 'listening'
  if (state === 'composing') return 'thinking'
  return 'processing'
}
