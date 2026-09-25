import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
const media = () => typeof matchMedia === 'function' ? matchMedia(query) : null
const subscribe = (notify: () => void) => {
  const preference = media()
  preference?.addEventListener('change', notify)
  return () => preference?.removeEventListener('change', notify)
}

/** Rest on the server and follow preference changes without remounting. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? true, () => true)
}
