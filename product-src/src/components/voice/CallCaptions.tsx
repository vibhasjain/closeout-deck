import type { CallSnapshot } from '@/lib/live'
import { callCaptions } from './callPresentation'

export function CallCaptions({ snapshot, enabled = true }: { snapshot: CallSnapshot; enabled?: boolean }) {
  const { agent, user } = callCaptions(snapshot)
  return <div className="call-captions" aria-label="Live call captions" aria-live={enabled ? 'polite' : 'off'} aria-relevant="additions text">
    {enabled && <>
      {user && <p className="call-caption-turn call-caption-turn--user"><span className="call-caption-speaker">You</span>{user}</p>}
      {agent && <p className="call-caption-turn call-caption-turn--agent"><span className="call-caption-speaker">Closeout Agent</span>{agent}</p>}
      {!agent && !user && <p className="call-captions-pending">Your conversation will appear here.</p>}
    </>}
  </div>
}
