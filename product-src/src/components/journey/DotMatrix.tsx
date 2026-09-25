import { useEffect, useRef } from 'react'

/** Fixed backing dimensions: the animation never reads or writes layout. */
export function DotMatrix() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    const draw = (time: number) => {
      ctx.clearRect(0, 0, 640, 176)
      const wave = motion.matches ? 0.48 : (time % 4400) / 4400
      for (let y = 4; y < 176; y += 8) for (let x = 4; x < 640; x += 8) {
        const grain = ((x * 13 + y * 31) % 89) / 89
        const density = Math.exp(-((x / 640 - wave) ** 2) * 28)
        ctx.fillStyle = `rgba(30,30,30,${0.06 + density * (0.12 + grain * 0.43)})`
        ctx.fillRect(x, y, grain > 0.6 ? 3 : 2, grain > 0.6 ? 3 : 2)
      }
      if (!motion.matches) frame = requestAnimationFrame(draw)
    }
    const restart = () => { cancelAnimationFrame(frame); draw(0) }
    restart()
    motion.addEventListener('change', restart)
    return () => { cancelAnimationFrame(frame); motion.removeEventListener('change', restart) }
  }, [])
  return <canvas ref={canvas} width={640} height={176} className="journey-scan" aria-hidden="true" />
}
