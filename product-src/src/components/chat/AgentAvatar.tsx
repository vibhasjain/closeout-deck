// Orb source: https://libraries.dev/orbs.html (thinking-orbs, MIT).
import { ThinkingOrb, type OrbSize } from 'thinking-orbs'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { agentOrb, type AgentActivity } from '@/lib/agentMotion'

export function AgentAvatar({ size = 20, state = 'idle' }: { size?: OrbSize; state?: AgentActivity }) {
  const reducedMotion = useReducedMotion()
  return <ThinkingOrb size={size} theme="light" {...agentOrb(state, reducedMotion)} data-agent-activity={state} aria-hidden />
}
