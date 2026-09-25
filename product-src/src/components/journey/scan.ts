// Source: https://app.jackandjill.ai/_next/static/chunks/2yr35x7ff8uc6.js
// Condensed from jj-kit/scan.js: seeded stream → filter → gather → ring → ring-out.
// Animation time shapes the drawing only. Completion always comes from the server.
export interface ScanState { complete: boolean; paused: boolean; matched: number; kept: number; labels: string[]; onFinished?(): void }
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }
const INKS = Array.from({ length: 8 }, (_, i) => `rgba(16,15,15,${(i + 1) / 8})`)

/** Owns one canvas clock; layout is read only on resize, and pauses offscreen. */
export function startScan(canvas: HTMLCanvasElement, chip: HTMLDivElement | null, read: () => ScanState) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return Object.assign(() => {}, { refresh: () => {} })
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let width = 0, height = 0, pitch = 0, radius = 1, frame = 0, last = 0, time = 0, finish = -1, visible = true, notified = false, densityAt = 0
  let dots: { col: number; row: number; seed: number }[] = []
  const buckets: number[][] = INKS.map(() => [])
  const draw = (now: number) => {
    frame = 0
    if (!visible) return
    const state = read(), still = motion.matches || state.paused
    if (!still) time += Math.min(.05, Math.max(0, (now - last) / 1000))
    last = now
    if (state.complete && finish < 0) finish = time
    if (!state.complete) { finish = -1; notified = false }
    const phase = finish < 0 ? 0 : motion.matches ? 4.15 : time - finish
    const kept = Math.min(20, Math.max(0, state.kept)), gather = ease((phase - 1.9) / 1), ring = ease((phase - 2.9) / .8), fade = 1 - clamp((phase - 3.7) / .45)
    ctx.clearRect(0, 0, width, height)
    buckets.forEach(bucket => { bucket.length = 0 })
    const offset = (finish < 0 ? time : finish) * 9
    dots.forEach((dot, index) => {
      let x = ((dot.col - offset) % 150 + 150) % 150 * pitch - 4, y = dot.row * pitch + 4
      const chosen = index < kept, angle = index / Math.max(1, kept) * Math.PI * 2 + (time - finish) * Math.PI / 2
      const blockX = width / 2 + (index % 5 - 2) * pitch, blockY = height / 2 + (Math.floor(index / 5) - 1.5) * pitch
      if (chosen && finish >= 0) {
        x += (blockX - x) * gather; y += (blockY - y) * gather
        x += (width / 2 + Math.cos(angle) * height * .2 - x) * ring
        y += (height / 2 + Math.sin(angle) * height * .2 - y) * ring
      }
      const alpha = finish < 0 ? .16 + dot.seed * .2 : chosen ? (.5 + ring * .5) * fade : (.16 + dot.seed * .2) * (1 - ease((phase - dot.seed * 1.45) / .45))
      if (x < -radius || x > width + radius || alpha < .02) return
      buckets[Math.min(7, Math.floor(alpha * 8))].push(x, y)
    })
    buckets.forEach((bucket, index) => {
      ctx.fillStyle = INKS[index]; ctx.beginPath()
      for (let i = 0; i < bucket.length; i += 2) { ctx.moveTo(bucket[i] + radius, bucket[i + 1]); ctx.arc(bucket[i], bucket[i + 1], radius, 0, Math.PI * 2) }
      ctx.fill()
    })
    if (chip) {
      const show = state.labels.length > 0 && (motion.matches || time > 1.1 && (time - 1.1) % 2.3 < 1.25) && finish < 0
      const label = state.labels[Math.floor(Math.max(0, time - 1.1) / 2.3) % state.labels.length] ?? ''
      if (chip.textContent !== label) chip.textContent = label
      chip.style.opacity = show ? '1' : '0'
      chip.style.transform = `translate(-50%, -100%) translateX(${still ? 0 : -((time - 1.1) % 2.3) * pitch * 9}px) scale(${show ? 1 : 1.18})`
      chip.style.filter = show ? 'blur(0)' : 'blur(4px)'
    }
    if (phase >= 4.15 && !notified) { notified = true; state.onFinished?.() }
    if (!still && !notified) frame = requestAnimationFrame(draw)
  }
  const restart = () => { cancelAnimationFrame(frame); frame = 0; last = performance.now(); if (visible) draw(last) }
  const resize = () => {
    const bounds = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
    width = bounds.width; height = bounds.height; pitch = Math.max(1, Math.min(width / 64, 6.5909)); radius = Math.max(1, pitch * .2)
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    let seed = 12345
    const random = () => { seed |= 0; let n = Math.imul((seed = seed + 0x6d2b79f5 | 0) ^ seed >>> 15, 1 | seed); n = (n + Math.imul(n ^ n >>> 7, 61 | n)) ^ n; return ((n ^ n >>> 14) >>> 0) / 0x100000000 }
    densityAt = read().matched
    const density = .5 * Math.max(.45, Math.min(1, densityAt / 10 || .45))
    dots = []
    for (let col = 0; col < 150; col++) for (let row = 0; row < Math.floor(height / pitch); row++) { const grain = random(); if (grain < density) dots.push({ col, row, seed: grain / density }) }
    // Kept dots start around the middle of the visible field, like J&J's filter selection.
    dots.sort((a, b) => Math.abs(a.col - 32) - Math.abs(b.col - 32))
    restart()
  }
  const size = new ResizeObserver(resize)
  const visibility = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); restart() })
  resize(); size.observe(canvas); visibility.observe(canvas)
  motion.addEventListener('change', restart); window.addEventListener('resize', resize)
  return Object.assign(() => { cancelAnimationFrame(frame); size.disconnect(); visibility.disconnect(); motion.removeEventListener('change', restart); window.removeEventListener('resize', resize) }, { refresh: () => { if (read().matched !== densityAt) resize(); else restart() } })
}
