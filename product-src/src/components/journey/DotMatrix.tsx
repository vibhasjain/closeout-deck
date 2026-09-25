import { useEffect, useRef } from 'react'

const COLORS = Array.from({ length: 8 }, (_, bucket) => `rgba(30,30,30,${0.06 + bucket * 0.55 / 7})`)
type Dot = { x: number; y: number; size: number; grain: number }

export function DotMatrix() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0, height = 0, frame = 0, visible = true
    let dots: Dot[] = []
    const buckets: Dot[][] = COLORS.map(() => [])
    const draw = (time: number) => {
      frame = 0
      if (!visible) return
      ctx.clearRect(0, 0, width, height)
      const wave = motion.matches ? 0.48 : (time % 4400) / 4400
      for (const bucket of buckets) bucket.length = 0
      for (const dot of dots) {
        const density = Math.exp(-((dot.x / width - wave) ** 2) * 28)
        buckets[Math.round(density * (0.12 + dot.grain * 0.43) / 0.55 * 7)].push(dot)
      }
      buckets.forEach((bucket, index) => {
        ctx.fillStyle = COLORS[index]
        for (const dot of bucket) ctx.fillRect(dot.x, dot.y, dot.size, dot.size)
      })
      if (!motion.matches) frame = requestAnimationFrame(draw)
    }
    const restart = () => { cancelAnimationFrame(frame); frame = 0; if (visible) draw(0) }
    const resize = () => {
      const bounds = element.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      width = bounds.width; height = bounds.height
      element.width = Math.round(width * dpr); element.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dots = []
      for (let y = 4; y + 3 <= height; y += 8) for (let x = 4; x + 3 <= width; x += 8) {
        const grain = ((x * 13 + y * 31) % 89) / 89
        dots.push({ x, y, size: grain > 0.6 ? 3 : 2, grain })
      }
      restart()
    }
    const size = new ResizeObserver(resize)
    const visibility = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting)
      restart()
    })
    resize(); size.observe(element); visibility.observe(element)
    motion.addEventListener('change', restart)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame); size.disconnect(); visibility.disconnect()
      motion.removeEventListener('change', restart); window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={canvas} className="journey-scan" aria-hidden="true" />
}
