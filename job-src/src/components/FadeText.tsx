import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Truncation without ellipses: text gets its full room, and ONLY when it actually
 * overflows does the tail fade — a narrow mask over the last letter or two, never
 * the whole block. lines=1 keeps it on one line; lines=2 clamps to two.
 *
 * Reading the rest never costs a click: hovering an overflowing line auto-scrolls it
 * within its own bounds (and glides back on leave); on touch it pans natively. The
 * fade mask follows the scroll position — trailing edge faded, both edges mid-way. */
export function FadeText({
  text,
  lines = 1,
  className,
}: {
  text: string
  lines?: 1 | 2
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number | null>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [pos, setPos] = useState<'start' | 'mid' | 'end'>('start')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () =>
      setOverflowing(
        lines === 1 ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1,
      )
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, lines])

  const stop = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }
  useEffect(() => stop, [])

  // Glide scrollLeft toward a target at reading speed (return trips go faster).
  const glide = (target: number) => {
    stop()
    let last = performance.now()
    const step = (now: number) => {
      const el = ref.current
      if (!el) return
      const dt = now - last
      last = now
      const cur = el.scrollLeft
      const next = cur < target ? Math.min(cur + 0.09 * dt, target) : Math.max(cur - 0.3 * dt, target)
      el.scrollLeft = next
      rafRef.current = Math.abs(next - target) > 0.5 ? requestAnimationFrame(step) : null
    }
    rafRef.current = requestAnimationFrame(step)
  }

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setPos(el.scrollLeft <= 1 ? 'start' : el.scrollLeft >= max - 1 ? 'end' : 'mid')
  }

  const single = lines === 1
  const mask = !overflowing
    ? undefined
    : pos === 'start'
      ? 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)'
      : pos === 'end'
        ? 'linear-gradient(to right, transparent 0, black 16px)'
        : 'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)'

  return (
    <span
      ref={ref}
      onMouseEnter={single && overflowing ? () => glide((ref.current?.scrollWidth ?? 0) - (ref.current?.clientWidth ?? 0)) : undefined}
      onMouseLeave={single ? () => glide(0) : undefined}
      onScroll={single ? onScroll : undefined}
      className={cn('block', single ? 'no-scrollbar overflow-x-auto whitespace-nowrap' : 'clamp-2-noellipsis', className)}
      style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
    >
      {text}
    </span>
  )
}
