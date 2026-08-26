import * as React from "react"

type SequenceOptions = {
  loop?: boolean
  restartDelay?: number
}

export function useSequence(
  steps: number[],
  opts: SequenceOptions = {}
): {
  phase: number
  ref: React.RefObject<HTMLDivElement | null>
  reduced: boolean
} {
  const { loop = true, restartDelay = 1200 } = opts
  const ref = React.useRef<HTMLDivElement>(null)
  const [intersecting, setIntersecting] = React.useState(false)
  const [reduced, setReduced] = React.useState(false)
  const [phase, setPhase] = React.useState(0)
  const stepsKey = steps.join(",")
  const stepCount = steps.length
  const remainingRef = React.useRef(steps[0] ?? 0)

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  React.useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => setIntersecting(entry.isIntersecting),
      { threshold: 0.25 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const durations = stepsKey ? stepsKey.split(",").map(Number) : []
    const atEnd = phase >= durations.length - 1
    remainingRef.current = atEnd
      ? (durations[phase] ?? 0) + restartDelay
      : (durations[phase] ?? 0)
  }, [phase, restartDelay, stepsKey])

  React.useEffect(() => {
    const durations = stepsKey ? stepsKey.split(",").map(Number) : []
    if (reduced || !intersecting || durations.length === 0) return
    if (!loop && phase >= durations.length - 1) return

    const startedAt = performance.now()
    let fired = false
    const timeout = window.setTimeout(() => {
      fired = true
      setPhase((current) =>
        current >= durations.length - 1 ? (loop ? 0 : current) : current + 1
      )
    }, remainingRef.current)

    return () => {
      window.clearTimeout(timeout)
      if (!fired) {
        remainingRef.current = Math.max(
          0,
          remainingRef.current - (performance.now() - startedAt)
        )
      }
    }
  }, [intersecting, loop, phase, reduced, stepsKey])

  return {
    phase: reduced ? Math.max(stepCount - 1, 0) : phase,
    ref,
    reduced,
  }
}

export function useCountUp(
  target: number,
  durationMs: number,
  active: boolean
): number {
  const [value, setValue] = React.useState(active ? 0 : target)
  const valueRef = React.useRef(value)

  React.useEffect(() => {
    valueRef.current = value
  }, [value])

  React.useEffect(() => {
    if (!active) return

    const from = valueRef.current
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min((now - started) / Math.max(durationMs, 1), 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(from + (target - from) * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, durationMs, target])

  return active ? value : target
}

export function useTypewriter(
  text: string,
  cps: number,
  active: boolean
): string {
  const [length, setLength] = React.useState(0)

  React.useEffect(() => {
    if (!active) return

    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const nextLength = Math.min(
        text.length,
        Math.floor(((now - started) / 1000) * cps)
      )
      setLength(nextLength)
      if (nextLength < text.length) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, cps, text])

  return active ? text.slice(0, length) : ""
}
