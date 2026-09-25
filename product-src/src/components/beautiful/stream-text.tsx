// Source: https://www.beautifului.dev/r/stream-text.json (MIT, Beautiful UI).
// Adapted for appended SSE chunks, reduced motion, and the app's scoped stylesheet.
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/lib/useReducedMotion'
import './stream-text.css'

/** The registry's quick character reveal, soft leading edge, and settling caret. */
export function StreamText({ text, charsPerTick = 2, tickMs = 9, blurTail = 6, caret = true, className, onProgress, onDone }: {
  text: string
  charsPerTick?: number
  tickMs?: number
  blurTail?: number
  caret?: boolean
  className?: string
  onProgress?(): void
  onDone?(): void
}) {
  const reducedMotion = useReducedMotion()
  const [reveal, setReveal] = useState({ text: '', count: 0 })
  const position = useRef(reveal)
  const callbacks = useRef({ onProgress, onDone })
  useEffect(() => { callbacks.current = { onProgress, onDone } }, [onProgress, onDone])

  useEffect(() => {
    if (reducedMotion || !text) return
    // The upstream demo resets for each new string. A real stream keeps its visible prefix.
    let i = text.startsWith(position.current.text) ? Math.min(position.current.count, text.length) : 0
    if (i >= text.length) return
    const id = window.setInterval(() => {
      i = Math.min(i + Math.max(1, charsPerTick), text.length)
      position.current = { text, count: i }
      setReveal(position.current)
      callbacks.current.onProgress?.()
      if (i >= text.length) {
        window.clearInterval(id)
        callbacks.current.onDone?.()
      }
    }, Math.max(1, tickMs))
    return () => window.clearInterval(id)
  }, [text, charsPerTick, tickMs, reducedMotion])

  const count = reducedMotion ? text.length : text.startsWith(reveal.text) ? Math.min(reveal.count, text.length) : 0
  const streaming = count < text.length
  const shown = text.slice(0, count)
  const split = streaming && !reducedMotion ? Math.max(0, shown.length - blurTail) : shown.length

  return <span className={className} data-streaming={streaming}>
    {shown.slice(0, split)}
    {split < shown.length && <span className="stream-tail">{shown.slice(split)}</span>}
    {caret && !reducedMotion && <span aria-hidden className={`stream-caret${streaming ? ' is-streaming' : ''}`} />}
  </span>
}
