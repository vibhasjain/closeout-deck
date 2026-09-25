import { useRef, useState } from 'react'
import { Phone } from 'lucide-react'
import type { CallCard as CallCardValue, CallTranscriptTurn } from '@/lib/chat'
import { authedFetch } from '@/lib/api'
import './call-card.css'

function duration(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function savedTranscript(value: unknown, callId: string): CallTranscriptTurn[] {
  if (!value || typeof value !== 'object' || !('call' in value)) throw new Error('The call transcript could not be read.')
  const call = value.call
  if (!call || typeof call !== 'object' || !('id' in call) || call.id !== callId || !('transcript' in call)
    || !Array.isArray(call.transcript) || call.transcript.length > 200
    || !call.transcript.every((turn: unknown) => !!turn && typeof turn === 'object'
      && 'role' in turn && (turn.role === 'user' || turn.role === 'agent')
      && 'text' in turn && typeof turn.text === 'string' && turn.text.length <= 400
      && 'startMs' in turn && typeof turn.startMs === 'number' && Number.isFinite(turn.startMs) && turn.startMs >= 0)) {
    throw new Error('The call transcript could not be read.')
  }
  return call.transcript as CallTranscriptTurn[]
}

export function CallCard({ card, transcript, saveError, onRetrySave }: { card: CallCardValue; transcript?: CallTranscriptTurn[]; saveError?: string; onRetrySave?: () => void }) {
  const [fetched, setFetched] = useState<CallTranscriptTurn[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(false)
  const loaded = useRef(false)
  const turns = transcript?.length ? transcript : fetched

  async function load() {
    if (transcript?.length || loaded.current || request.current) return
    request.current = true; setLoading(true); setError('')
    try {
      const response = await authedFetch(`/calls/${card.callId}`)
      if (response.status === 404) throw new Error('This call’s transcript isn’t available.')
      if (!response.ok) throw new Error('The call transcript could not be loaded. Try again.')
      const saved = savedTranscript(await response.json(), card.callId)
      loaded.current = true; setFetched(saved)
    } catch (failure) {
      setError(failure instanceof Error && failure.message !== 'Failed to fetch' ? failure.message : 'The call transcript could not be loaded. Check your connection and try again.')
    } finally { request.current = false; setLoading(false) }
  }

  return <section className="chat-call-card" data-call-id={card.callId} aria-label="Call with the Closeout Agent">
    <p className="chat-call-title"><Phone size={16} aria-hidden="true" /><span>You had a call with the Closeout Agent · {duration(card.seconds)}</span></p>
    {saveError && <div className="chat-call-save-error" role="status"><p>{saveError}</p>{onRetrySave && <button type="button" className="chat-call-retry" onClick={onRetrySave}>Retry saving</button>}</div>}
    <details className="chat-call-transcript" onToggle={event => { if (event.currentTarget.open) void load() }}>
      <summary>Transcript</summary>
      {turns?.length ? <ol aria-label="Call transcript">{turns.map((turn, index) => <li key={`${turn.startMs}-${index}`}>
        <div className="chat-call-speaker"><span>{turn.role === 'user' ? 'You' : 'Closeout Agent'}</span><time>{duration(turn.startMs / 1000)}</time></div>
        <p>{turn.text}</p>
      </li>)}</ol> : loading ? <p className="chat-call-unavailable" role="status">Loading transcript…</p>
        : error ? <div className="chat-call-unavailable" role="status"><span>{error}</span> <button type="button" className="chat-call-retry" onClick={() => void load()}>Retry</button></div>
          : <p className="chat-call-unavailable">{fetched ? 'This call’s transcript isn’t available.' : 'Open to load the call transcript.'}</p>}
    </details>
  </section>
}
