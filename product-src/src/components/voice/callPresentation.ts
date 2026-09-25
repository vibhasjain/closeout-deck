import type { CallSnapshot } from '@/lib/live'

export interface CallControlsProps {
  snapshot: CallSnapshot
  onMute(): void
  onEnd(): void
  onRetry(): void
  onRetryTurn?(): void
  onKeepTyping(): void
}

export function callTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function callStatus(snapshot: CallSnapshot) {
  if (snapshot.status === 'connecting') return 'Connecting…'
  if (snapshot.status === 'ending') return 'Finishing your call…'
  if (snapshot.status === 'ended') return 'Call ended'
  if (snapshot.status === 'error') return snapshot.errorKind === 'save' ? 'Call ended · notes need saving' : 'Call interrupted'
  if (snapshot.orb === 'composing') return 'Your Closeout Agent is speaking'
  if (snapshot.orb === 'working') return 'Your Closeout Agent is working'
  return snapshot.muted ? 'Your microphone is muted' : 'Listening to you'
}
