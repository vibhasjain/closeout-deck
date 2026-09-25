import { useEffect, useRef, useState } from 'react'
import { startDictation, type DictationState } from '@/lib/dictate'

/** Dictation edits the draft; only an explicit Enter sends the completed text. */
export function useDictation(draft: string, onDraft: (value: string) => void) {
  const [state, setState] = useState<DictationState | 'idle'>('idle')
  const [error, setError] = useState('')
  const handle = useRef<ReturnType<typeof startDictation> | null>(null)
  const prefix = useRef('')
  const originalDraft = useRef('')
  const running = useRef(false)
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; handle.current?.dispose() }
  }, [])

  function start() {
    if (running.current) return
    handle.current?.dispose()
    const current = ++generation.current
    originalDraft.current = draft
    prefix.current = draft.trimEnd() ? `${draft.trimEnd()} ` : ''
    running.current = true; setState('connecting'); setError('')
    handle.current = startDictation({
      onTranscript(text, final) {
        if (!mounted.current || generation.current !== current) return
        onDraft(text.trim() ? prefix.current + text.trimStart() : originalDraft.current)
        if (final) running.current = false
      },
      onState(next) {
        if (!mounted.current || generation.current !== current) return
        setState(next)
        running.current = next === 'connecting' || next === 'listening' || next === 'finishing'
      },
      onError(message) { if (mounted.current && generation.current === current) { setError(message); setState('error'); running.current = false } },
    })
  }
  async function stop() {
    if (!handle.current || !running.current) return draft
    const current = generation.current
    const text = await handle.current.stop()
    const complete = text.trim() ? prefix.current + text.trimStart() : originalDraft.current
    if (mounted.current && generation.current === current) { onDraft(complete); setState('ended'); running.current = false }
    return complete
  }
  function dismiss() {
    generation.current++
    handle.current?.dispose(); handle.current = null
    running.current = false; setState('idle'); setError('')
  }
  const active = state === 'connecting' || state === 'listening' || state === 'finishing'
  const finishing = state === 'finishing'
  const status = state === 'connecting' ? 'Connecting…' : state === 'listening' ? 'Listening…' : finishing ? 'Finishing…' : ''
  return { active, finishing, state, status, error, start, stop, dismiss }
}
