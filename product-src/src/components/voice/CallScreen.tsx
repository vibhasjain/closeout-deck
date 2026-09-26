import { useState } from 'react'
import { Captions, ChevronDown, Mic, MicOff, PhoneOff } from 'lucide-react'
import { VoiceBeam } from 'voice-glow'
import type { Onboarding } from '@/lib/onboarding'
import { CallOrb } from './CallOrb'
import { CallChecklist } from './CallChecklist'
import { CallLevelBars } from './CallLevelBars'
import { CallError } from './CallError'
import { CallCaptions } from './CallCaptions'
import { callStatus, callTime, type CallControlsProps } from './callPresentation'
import './voice.css'

type CallScreenProps = CallControlsProps & (
  | { purpose?: 'onboard'; onboarding: Onboarding; onMinimize?: never }
  | { purpose: 'desk'; onboarding?: never; onMinimize(): void }
)

/** Shared call controls; only setup calls have a coverage checklist. */
export function CallScreen({ snapshot, purpose = 'onboard', onboarding, onMute, onEnd, onRetry, onRetryTurn, onKeepTyping, onMinimize }: CallScreenProps) {
  const [captions, setCaptions] = useState(true)
  const finishing = snapshot.status === 'ending' || snapshot.status === 'ended'
  const failed = snapshot.status === 'error'
  const status = callStatus(snapshot)
  return <section className={`call-screen${purpose === 'desk' ? ' call-screen--desk' : ''}`} aria-label="Call with your Closeout Agent" data-call-status={snapshot.status}>
    {purpose === 'desk' && <header className="call-screen-header"><span>Payroll call</span><button type="button" className="call-control" aria-label="Minimize call" onClick={onMinimize}><ChevronDown size={22} aria-hidden /></button></header>}
    <div className="call-stage">
      <div className="call-agent">
        <CallOrb state={snapshot.orb} level={snapshot.level} levelSource={snapshot.levelSource} />
        <h1>Your Closeout Agent</h1>
        <p className="call-status" role="status">{status}</p>
        <time className="call-time" aria-label={`Call duration ${callTime(snapshot.seconds)}`}>{callTime(snapshot.seconds)}</time>
        {failed && <CallError error={snapshot.error || 'The call could not connect. Try again.'} errorKind={snapshot.errorKind} onRetry={onRetry} onKeepTyping={onKeepTyping} />}
        {!failed && snapshot.note && <p className="call-note" role="status">{snapshot.note} {onRetryTurn && <button type="button" onClick={onRetryTurn}>Retry</button>}</p>}
        {!failed && <CallCaptions snapshot={snapshot} enabled={captions} />}
      </div>
      {purpose === 'onboard' && onboarding && <CallChecklist onboarding={onboarding} />}
    </div>
    {!failed && <footer className="call-footer">
      <div className="call-controls" aria-label="Call controls">
        <VoiceBeam className="call-level" type="pill" theme="light" colorVariant="mono" bandStrength={0} stream={snapshot.stream} active={!snapshot.muted && snapshot.status === 'active'} idle={0} scale={0.22} glowWidth={38} glowHeight={30} rangeWidth={54} rangeHeight={34} staticColors>
          <CallLevelBars snapshot={snapshot} />
        </VoiceBeam>
        <span className="call-control-divider" aria-hidden />
        <button type="button" className="call-control" disabled={snapshot.status !== 'active'} aria-label={snapshot.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={snapshot.muted} onClick={onMute}>{snapshot.muted ? <MicOff size={19} aria-hidden /> : <Mic size={19} aria-hidden />}</button>
        <button type="button" className="call-control" aria-label={captions ? 'Hide live captions' : 'Show live captions'} aria-pressed={captions} onClick={() => setCaptions((value) => !value)}><Captions size={21} aria-hidden /></button>
        <button type="button" className="call-control call-end" disabled={finishing} aria-label="End call" onClick={onEnd}><PhoneOff size={19} aria-hidden /></button>
      </div>
      <div className="call-help">Having issues? <button type="button" onClick={onKeepTyping}>Keep typing</button></div>
    </footer>}
  </section>
}
