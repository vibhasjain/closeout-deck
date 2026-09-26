import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'

const subscribe = () => () => {}
const browserSnapshot = () => false
const serverSnapshot = () => true

/** Let the route's header and ghost frame paint before mounting a dense table or review pane.
 * The cycle store remains mounted in the shell, so returning to a page uses its cached data. */
export function PaintBoundary({ routeKey, fallback, children }: { routeKey: string; fallback: ReactNode; children: ReactNode }) {
  const server = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot)
  const [painted, setPainted] = useState<string | null>(null)
  useEffect(() => {
    let second = 0
    let task: ReturnType<typeof setTimeout> | undefined
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        // Run outside the frame callback: the ghost is presented before expensive work starts.
        task = setTimeout(() => setPainted(routeKey), 0)
      })
    })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); clearTimeout(task) }
  }, [routeKey])
  return server || painted === routeKey ? children : fallback
}
