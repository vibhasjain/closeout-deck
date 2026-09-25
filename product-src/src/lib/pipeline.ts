import { useSyncExternalStore } from 'react'
import { recentCycles } from './cycles'
import { getOnboarding, updateOnboarding } from './onboarding'
import { viewerSession } from './viewerSession'

/** `card`: the chat message the run posted. Only that card shows the run; older cards of the cycle keep their own state. */
interface PipelineState { running: boolean; error: string | null; card?: string }
const idle: PipelineState = { running: false, error: null }
const states = new Map<string, PipelineState>()
const pending = new Map<string, number>()
const listeners = new Set<() => void>()
const account = () => viewerSession()?.email ?? 'development'
const keyFor = (cycleId: string) => `${account()}:${cycleId}`
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify) } }
const publish = (key: string, state: PipelineState) => { states.set(key, state); listeners.forEach(notify => notify()) }
export const ownsRun = (state: Pick<PipelineState, 'card'>, card?: string) => !card || state.card === card
export const pipelineRunning = (cycleId: string, card?: string) => { const state = states.get(keyFor(cycleId)); return !!state?.running && ownsRun(state, card) }
export function usePipeline(cycleId: string) {
  const key = keyFor(cycleId)
  return useSyncExternalStore(subscribe, () => states.get(key) ?? idle, () => idle)
}

/** Connect/sample populate the last closed calendar cycle. Publish its card before
 * awaiting the request, and keep Running until its real data refresh completes. */
export function startPipeline(cycleId = recentCycles(getOnboarding(), 2)[1].id) {
  const key = keyFor(cycleId)
  const count = pending.get(key) ?? 0
  pending.set(key, count + 1)
  const card = count ? states.get(key)?.card : crypto.randomUUID()
  publish(key, { running: true, error: null, card })
  if (!count) {
    const state = getOnboarding()
    updateOnboarding({ chat: [...state.chat, {
      id: card!, role: 'agent', text: '', at: Date.now(),
      cards: [{ kind: 'task', cycleId }],
    }] })
  }
  let finished = false
  return (cause?: unknown) => {
    if (finished) return
    finished = true
    const remaining = Math.max(0, (pending.get(key) ?? 1) - 1)
    pending.set(key, remaining)
    publish(key, { running: remaining > 0, error: cause ? cause instanceof Error ? cause.message : 'The connection could not be completed. Try again.' : states.get(key)?.error ?? null, card: states.get(key)?.card })
  }
}
