import { useEffect, useRef } from 'react'
import type { CallSnapshot } from '@/lib/live'

const HEIGHTS = [0.42, 0.76, 1, 0.64, 0.36]

/** Audio ticks paint these five bars without rerendering the call or chat. */
export function CallLevelBars({ snapshot }: { snapshot: CallSnapshot }) {
  const bars = useRef<HTMLSpanElement>(null)
  const { levelSource, level, muted } = snapshot
  useEffect(() => {
    const paint = (value: number) => {
      const bounded = Math.max(0, Math.min(1, value))
      bars.current?.querySelectorAll('i').forEach((bar, index) => {
        bar.style.transform = `scaleY(${muted ? 0.16 : 0.2 + bounded * HEIGHTS[index] * 0.8})`
      })
    }
    paint(levelSource?.get() ?? level)
    return levelSource?.subscribe(paint)
  }, [levelSource, level, muted])
  return <span ref={bars} className="call-level-bars" aria-hidden>{HEIGHTS.map((_, index) => <i key={index} style={{ transform: 'scaleY(0.2)' }} />)}</span>
}
