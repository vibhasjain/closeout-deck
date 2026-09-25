// Source: J&J scan.js capture; https://app.jackandjill.ai/_next/static/chunks/2yr35x7ff8uc6.js
import { useEffect, useRef } from 'react'
import { startScan, type ScanState } from './scan'

export function DotMatrix({ complete = false, paused = false, matched = 0, kept = 0, labels = [], onFinished }: Partial<ScanState> = {}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const chip = useRef<HTMLDivElement>(null)
  const refresh = useRef<(() => void) | null>(null)
  const state = useRef<ScanState>({ complete, paused, matched, kept, labels, onFinished })
  useEffect(() => { state.current = { complete, paused, matched, kept, labels, onFinished }; refresh.current?.() }, [complete, paused, matched, kept, labels, onFinished])
  // J&J hands off 8s after completion even when the ring has not finished (e.g. the card is offscreen).
  useEffect(() => {
    if (!complete) return
    const timer = setTimeout(() => state.current.onFinished?.(), 8000)
    return () => clearTimeout(timer)
  }, [complete])
  useEffect(() => {
    if (!canvas.current) return
    const stop = startScan(canvas.current, chip.current, () => state.current)
    refresh.current = stop.refresh
    return () => { refresh.current = null; stop() }
  }, [])
  return <div className="journey-scan-box" aria-hidden="true">
    <canvas ref={canvas} className="journey-scan" />
    <div ref={chip} className="journey-scan-chip" />
  </div>
}
