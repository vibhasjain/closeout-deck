import { useRef, useState } from 'react'

export type ActionStatus = 'idle' | 'pending' | 'success' | 'error'
export interface PendingAction {
  status: ActionStatus
  key: string
  pending: boolean
  error: string | null
  run(task: () => Promise<unknown> | unknown, key?: string): Promise<boolean>
  retry(): Promise<boolean>
  reset(): void
}

/** One lifecycle for mutations: lock synchronously, retain the operation for Retry,
 * and keep success visible until the surface deliberately moves on. */
export function usePendingAction(message = (cause: unknown) => cause instanceof Error ? cause.message : 'This could not be saved. Try again.'): PendingAction {
  const [state, setState] = useState<{ status: ActionStatus; key: string; error: string | null }>({ status: 'idle', key: '', error: null })
  const lock = useRef(false)
  const previous = useRef<{ task: () => Promise<unknown> | unknown; key: string } | null>(null)
  async function run(task: () => Promise<unknown> | unknown, key = '') {
    if (lock.current) return false
    lock.current = true
    previous.current = { task, key }
    setState({ status: 'pending', key, error: null })
    try {
      await task()
      setState({ status: 'success', key, error: null })
      return true
    } catch (cause) {
      setState({ status: 'error', key, error: message(cause) })
      return false
    } finally { lock.current = false }
  }
  return { ...state, pending: state.status === 'pending', run,
    retry: () => previous.current ? run(previous.current.task, previous.current.key) : Promise.resolve(false),
    reset: () => { if (!lock.current) setState({ status: 'idle', key: '', error: null }) },
  }
}
