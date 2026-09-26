import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

export type ActionStatus = 'idle' | 'pending' | 'success' | 'error'
export interface ActionOptions { optimistic?: boolean; rollback?: () => void }
export interface PendingAction {
  status: ActionStatus
  key: string
  pending: boolean
  /** A reversible action can already look complete while its request is still locked. */
  inFlight?: boolean
  optimistic?: boolean
  error: string | null
  run(task: () => Promise<unknown> | unknown, key?: string, options?: ActionOptions): Promise<boolean>
  retry(): Promise<boolean>
  reset(): void
}

/** One lifecycle for mutations: lock synchronously, retain the operation for Retry,
 * and keep success visible until the surface deliberately moves on. */
export function usePendingAction(message = (cause: unknown) => cause instanceof Error ? cause.message : 'This could not be saved. Try again.'): PendingAction {
  const [state, setState] = useState<{ status: ActionStatus; key: string; error: string | null; inFlight: boolean; optimistic: boolean }>({ status: 'idle', key: '', error: null, inFlight: false, optimistic: false })
  const lock = useRef(false)
  const previous = useRef<{ task: () => Promise<unknown> | unknown; key: string; options: ActionOptions } | null>(null)
  async function run(task: () => Promise<unknown> | unknown, key = '', options: ActionOptions = {}) {
    if (lock.current) return false
    lock.current = true
    previous.current = { task, key, options }
    const start = () => setState({ status: options.optimistic ? 'success' : 'pending', key, error: null, inFlight: true, optimistic: !!options.optimistic })
    // Commit the small control before a large cycle publication can start rendering its panes.
    if (options.optimistic) flushSync(start)
    else start()
    try {
      await task()
      setState({ status: 'success', key, error: null, inFlight: false, optimistic: !!options.optimistic })
      return true
    } catch (cause) {
      options.rollback?.()
      setState({ status: 'error', key, error: message(cause), inFlight: false, optimistic: !!options.optimistic })
      return false
    } finally { lock.current = false }
  }
  return { ...state, pending: state.status === 'pending', run,
    retry: () => previous.current ? run(previous.current.task, previous.current.key, previous.current.options) : Promise.resolve(false),
    reset: () => { if (!lock.current) setState({ status: 'idle', key: '', error: null, inFlight: false, optimistic: false }) },
  }
}
