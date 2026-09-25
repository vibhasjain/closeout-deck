// Orb source: https://libraries.dev/orbs.html (thinking-orbs, MIT).
// Idle timing: supplied J&J kit / motion.md §3; use orb modes instead of its face asset.
import { useEffect, useState } from 'react'
import { ThinkingOrb, type OrbSize, type OrbState } from 'thinking-orbs'
import { useReducedMotion } from '@/lib/useReducedMotion'

const IDLE_MODES: OrbState[] = ['breathing', 'shaping', 'weaving']

export function AgentAvatar({ size = 20, working = false }: { size?: OrbSize; working?: boolean }) {
  const reducedMotion = useReducedMotion()
  const [idle, setIdle] = useState<OrbState>('breathing')
  useEffect(() => {
    if (working || reducedMotion) return
    let timer: ReturnType<typeof setTimeout>
    let previous: OrbState = 'breathing'
    function move() {
      const choices = IDLE_MODES.filter(mode => mode !== previous)
      previous = choices[Math.floor(Math.random() * choices.length)]
      setIdle(previous)
      timer = setTimeout(move, 800 + Math.random() * 1700)
    }
    timer = setTimeout(move, 1200)
    return () => clearTimeout(timer)
  }, [working, reducedMotion])

  return <ThinkingOrb size={size} theme="light" state={reducedMotion ? 'breathing' : working ? 'working' : idle} paused={reducedMotion} aria-hidden />
}
