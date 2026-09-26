import { useEffect, useRef, useState } from 'react'

/** Keep a row's control mounted while its mutation publishes a refreshed collection.
 * Retained rows are presentation only; the shared data store always stays current. */
export function useActionRetention<T>(items: readonly T[], keyOf: (item: T) => string) {
  const [held, setHeld] = useState<Array<{ key: string; item: T; index: number }>>([])
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => { const active = timers.current; return () => { active.forEach(clearTimeout) } }, [])
  const visible = [...items]
  for (const row of held) if (!visible.some(item => keyOf(item) === row.key)) visible.splice(Math.min(row.index, visible.length), 0, row.item)
  return { items: visible, retain(item: T) {
    const key = keyOf(item), index = items.findIndex(row => keyOf(row) === key)
    setHeld(previous => [...previous.filter(row => row.key !== key), { key, item, index: Math.max(0, index) }])
    return (delay = 900) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        setHeld(previous => previous.filter(row => row.key !== key))
      }, delay)
      timers.current.add(timer)
    }
  } }
}
