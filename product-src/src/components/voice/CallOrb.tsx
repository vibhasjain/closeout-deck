import { useEffect, useRef } from 'react'
import { MODE_DRAWS, resolvePreset } from 'thinking-orbs'
import type { CallSnapshot } from '@/lib/live'

/** Paint at the displayed size and device density; the library's 64px avatar is not enlarged. */
export function CallOrb({ state, level, levelSource, compact = false }: { state: CallSnapshot['orb']; level: number; levelSource?: CallSnapshot['levelSource']; compact?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const paintLevel = (value: number) => {
      if (wrapper.current) wrapper.current.style.transform = `scale(${1 + Math.max(0, Math.min(1, value)) * 0.1})`
    }
    paintLevel(levelSource?.get() ?? level)
    return levelSource?.subscribe(paintLevel)
  }, [level, levelSource])

  useEffect(() => {
    const node = canvas.current
    const ctx = node?.getContext('2d')
    if (!node || !ctx) return
    const preset = resolvePreset(state, compact ? 32 : 64)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let size = compact ? 32 : 240
    let ratio = 1
    const draw = () => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, size, size)
      MODE_DRAWS[preset.mode](ctx, size, motion.matches ? 0.6 : performance.now() / 1000 * preset.speed, false, preset.opts)
    }
    const loop = () => {
      draw()
      frame = window.requestAnimationFrame(loop)
    }
    const resume = () => {
      window.cancelAnimationFrame(frame)
      draw()
      if (!motion.matches && document.visibilityState !== 'hidden') frame = window.requestAnimationFrame(loop)
    }
    const resize = () => {
      // Offset dimensions exclude the small, audio-driven wrapper transform.
      size = node.offsetWidth || (compact ? 32 : 240)
      ratio = Math.min(window.devicePixelRatio || 1, 3)
      node.width = Math.round(size * ratio)
      node.height = Math.round(size * ratio)
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(node)
    resize()
    resume()
    motion.addEventListener('change', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      motion.removeEventListener('change', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [state, compact])

  return <div ref={wrapper} className={`call-orb${compact ? ' call-orb--compact' : ''}`} data-orb-state={state}>
    <canvas ref={canvas} aria-hidden="true" />
  </div>
}
