// Source: https://github.com/gustavo-fior/craft/blob/main/src/components/demos/living-charts.tsx
// Adapted from Craft's useTweened: scalar targets, interruptible rAF, live reduced-motion preference.
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

export function useTweened(target: number, duration = 400): number {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(target)
  const current = useRef(target)
  useEffect(() => {
    if (reduced || duration <= 0) {
      current.current = target
      // Keep the settled value ready if the user re-enables motion later.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(target)
      return
    }
    const from = current.current
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const next = from + (target - from) * (1 - Math.pow(1 - t, 3))
      current.current = next
      setDisplay(next)
      if (t < 1 && from !== target) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, reduced])
  return reduced || duration <= 0 ? target : display
}
