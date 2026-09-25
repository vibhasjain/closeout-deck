import { Mic, MicOff, PhoneOff } from 'lucide-react'
import { CallOrb } from './CallOrb'
import { CallError } from './CallError'
import { callStatus, callTime, type CallControlsProps } from './callPresentation'
import './voice.css'

export function CallBar({ snapshot, onMute, onEnd, onRetry, onRetryTurn, onKeepTyping }: CallControlsProps) {
  return <section className="call-bar" aria-label="Call with your Closeout Agent" data-call-status={snapshot.status}>
    <div className="call-bar-main">
      <CallOrb state={snapshot.orb} level={snapshot.level} levelSource={snapshot.levelSource} compact />
      <div className="call-bar-text"><span>{snapshot.status === 'active' ? 'Closeout Agent' : callStatus(snapshot)}</span><time aria-label={`Call duration ${callTime(snapshot.seconds)}`}>{callTime(snapshot.seconds)}</time></div>
      <button type="button" className="call-control" disabled={snapshot.status !== 'active'} aria-label={snapshot.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={snapshot.muted} onClick={onMute}>{snapshot.muted ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}</button>
      <button type="button" className="call-control call-end" disabled={snapshot.status === 'ending' || snapshot.status === 'ended' || snapshot.status === 'error'} aria-label="End call" onClick={onEnd}><PhoneOff size={18} aria-hidden /></button>
    </div>
    {snapshot.status === 'error' ? <CallError error={snapshot.error || 'The call could not connect. Try again.'} errorKind={snapshot.errorKind} onRetry={onRetry} onKeepTyping={onKeepTyping} /> : <>
      {snapshot.note && <p className="call-note" role="status">{snapshot.note} {onRetryTurn && <button type="button" onClick={onRetryTurn}>Retry</button>}</p>}
      <div className="call-help"><button type="button" onClick={onKeepTyping}>Keep typing</button></div>
    </>}
  </section>
}
