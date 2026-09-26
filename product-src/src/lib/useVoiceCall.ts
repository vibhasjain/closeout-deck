import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ChatContext } from '@/lib/chat'
import { startCall, type CallHandle, type CallSnapshot, type LiveContext } from '@/lib/live'
import { effectiveAuthority, getOnboarding, ONBOARD_TOPICS } from '@/lib/onboarding'
import { callOwner, clearStoredCall, persistLiveCall, readStoredCall, registerCallRetry } from '@/lib/callRecovery'
import { applyVoiceActions, createVoiceAudit, recordVoiceCall, recoverVoiceCall, restoreVoiceAudit } from '@/lib/voiceActions'

/** Structured facts come first so the bounded hint retains the goals and calendar. */
export function voiceContext(cycleId?: string): LiveContext {
  const state = getOnboarding()
  const known = {
    covered: state.covered,
    calendar: { frequency: state.frequency, periodEndDay: state.periodEndDay, payDay: state.payDay, cutoffDays: state.cutoffDays, deadlineDays: state.deadlineDays },
    sources: state.sources.map(({ set, label }) => ({ set, label })), authority: effectiveAuthority(state), profile: state.profile,
  }
  return {
    ...(state.firm ? { firm: { name: state.firm.name.slice(0, 200), summary: state.firm.summary.slice(0, 500), states: state.firm.states } } : {}),
    known: JSON.stringify(known).slice(0, 2400), uncovered: ONBOARD_TOPICS.filter(topic => !state.covered.includes(topic)), ...(cycleId ? { cycleId } : {}),
  }
}

export function useVoiceCall(purpose: 'onboard' | 'desk', cycleId?: string, scope?: string, getContext?: () => LiveContext | ChatContext) {
  const [snapshot, setSnapshot] = useState<CallSnapshot | null>(null)
  const handle = useRef<CallHandle | null>(null), starting = useRef(false), mounted = useRef(true), visible = useRef(true)
  const contextRef = useRef(getContext)
  const navigate = useNavigate(), [params] = useSearchParams()
  useEffect(() => { contextRef.current = getContext }, [getContext])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; void handle.current?.dispose().catch(() => {}) }
  }, [])

  async function start() {
    if (starting.current) return
    starting.current = true; visible.current = true
    setSnapshot({ status: 'connecting', orb: 'connecting', stream: null, remoteStream: null, muted: false, seconds: 0, caption: '', transcript: [], level: 0 })
    try {
      // Reconnect waits for the old lock, while its consolidation continues independently.
      const old = handle.current
      if (old) {
        handle.current = null
        const previous = old.snapshot(), stored = callOwner() ? readStoredCall(callOwner()!) : null
        if (stored && stored.sessionId !== previous.callId) await recoverVoiceCall(navigate, params)
        // Start recovery immediately; only its lock release blocks a call Retry.
        void old.retrySave().catch(() => {})
        await old.release()
        if (previous.callId && stored?.sessionId === previous.callId && getOnboarding().chat.find(message => message.id === `call-${previous.callId}`)?.callSaving) {
          recordVoiceCall({ callId: previous.callId, seconds: previous.seconds, transcript: previous.transcript, final: '', saving: true, serverSaved: true, purpose: stored.purpose }, restoreVoiceAudit(previous.callId), scope, stored.startedAt)
        }
      } else await recoverVoiceCall(navigate, params)
      if (!mounted.current || !visible.current) return
      const email = callOwner(), audit = createVoiceAudit()
      let connected = false
      const currentContext = (): LiveContext => {
        const extra = contextRef.current?.()
        return { ...voiceContext(cycleId), ...extra, firm: voiceContext(cycleId).firm }
      }
      const next: CallHandle = startCall({
        purpose, context: currentContext(), getContext: currentContext,
        onSkipped: skipped => { audit.skipped.push(...skipped) },
        async onActions(actions) {
          let failed = await applyVoiceActions(actions, purpose, audit, navigate, params, cycleId)
          if (!failed.length) return
          const error = audit.skipped.at(-1) ?? 'An action could not be applied.'
          return { error, retry: async () => {
            failed = await applyVoiceActions(failed, purpose, audit, navigate, params, cycleId)
            const current = next.snapshot()
            if (current.callId) recordVoiceCall({ callId: current.callId, seconds: current.seconds, transcript: current.transcript, final: '', saving: true, live: current.status === 'active', purpose }, audit, scope)
            if (failed.length) throw new Error(audit.skipped.at(-1) ?? error)
          } }
        },
        onPersist(record, ended) {
          if (email) persistLiveCall(email, record, ended)
          registerCallRetry(record.sessionId, () => next.retrySave())
          if (connected) {
            try { recordVoiceCall({ callId: record.sessionId, seconds: record.seconds, transcript: record.transcript, final: '', saving: true, live: !ended, purpose }, audit, scope, record.startedAt) } catch (error) { console.warn('Call journal unavailable', error) }
          }
        },
        onSaved: id => { if (email) clearStoredCall(email, id) },
        onEvent(event) {
          if (event.type === 'state' && event.snapshot.status === 'active') connected = true
          if (event.type === 'state' && mounted.current && visible.current && handle.current === next) setSnapshot(event.snapshot)
          if (event.type === 'actions' && connected) {
            const current = next.snapshot()
            if (current.callId) recordVoiceCall({ callId: current.callId, seconds: current.seconds, transcript: current.transcript, final: '', saving: true, live: current.status === 'active', purpose }, audit, scope)
          }
          if (event.type === 'completed') recordVoiceCall({ ...event, purpose }, audit, scope)
        },
      })
      handle.current = next
      setSnapshot(next.snapshot())
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'The call could not be started. Try again.'
      if (mounted.current && visible.current) setSnapshot(previous => previous ? { ...previous, status: 'error', error, errorKind: 'call' } : null)
    } finally { starting.current = false }
  }

  async function end() { await handle.current?.hangup() }
  function dismiss() {
    visible.current = false
    if (mounted.current) setSnapshot(null)
    // Saving and its call-card Retry remain alive after the call UI is dismissed.
    void handle.current?.hangup().catch(() => {})
  }
  return { snapshot, start, end, dismiss, retrySave: async () => { await handle.current?.retrySave() }, retryTurn: async () => { await handle.current?.retryTurn() }, mute: () => handle.current?.mute() }
}
