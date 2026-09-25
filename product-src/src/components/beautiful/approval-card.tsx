// Source: https://www.beautifului.dev/r/approval-card.json (Beautiful UI, MIT).
// Ported: the card-pad / card-footer chrome and the odometer step counter (RollingDigits).
// J&J's horizontal carousel owns navigation; demo questions, timers and blue actions are removed.
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { useReducedMotion } from '@/lib/useReducedMotion'
import './approval-card.css'

export function ApprovalCard({ children, footer, className = '', ...props }: ComponentProps<'article'> & { footer: ReactNode }) {
  return <article {...props} className={`beautiful-approval-card ${className}`}>
    <div className="beautiful-approval-card-pad">{children}</div>
    <div className="beautiful-approval-card-footer">{footer}</div>
  </article>
}

const ROLL_MS = 400

/** The source's odometer: each character that changes rolls up (or down, when the number falls). Still under reduced motion. */
export function RollingDigits({ value }: { value: string }) {
  const reduced = useReducedMotion()
  const previous = useRef(value)
  const [roll, setRoll] = useState<{ from: string; to: string; down: boolean; shifted: boolean } | null>(null)
  useEffect(() => {
    if (previous.current === value) return
    const from = previous.current
    previous.current = value
    if (reduced) return
    const [a, b] = [parseInt(from, 10), parseInt(value, 10)]
    // The roll starts from the previous string and settles after ROLL_MS.
    setRoll({ from, to: value, down: Number.isFinite(a) && Number.isFinite(b) && b < a, shifted: false })
    let second = 0
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setRoll(current => current && { ...current, shifted: true })) })
    const done = setTimeout(() => setRoll(null), ROLL_MS)
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); clearTimeout(done) }
  }, [value, reduced])
  if (!roll || roll.to !== value) return <>{value}</>
  return <>{Array.from(value, (next, i) => {
    const old = roll.from[i] ?? ''
    if (old === next) return <span key={`${i}-${next}`}>{next}</span>
    const [top, bottom] = roll.down ? [next, old] : [old, next]
    const [start, rest] = roll.down ? ['-1em', '0'] : ['0', '-1em']
    return <span key={`${i}-${old}-${next}`} className="beautiful-roll">
      <span style={{ transform: `translateY(${roll.shifted ? rest : start})` }}><span>{top}</span><span>{bottom}</span></span>
    </span>
  })}</>
}
