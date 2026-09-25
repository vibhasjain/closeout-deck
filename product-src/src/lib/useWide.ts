import { useSyncExternalStore } from 'react'

export type SidebarPreference = 'full' | 'rail'
export const WIDE_QUERY = '(min-width: 1024px)'

/** The CSS breakpoints and the accessible agent mode share these boundaries. */
export function shellLayout(width: number, sidebar: SidebarPreference = 'full'): {
  sidebar: SidebarPreference | 'drawer'
  agent: 'docked' | 'drawer' | 'sheet'
} {
  if (width >= 1280) return { sidebar, agent: 'docked' }
  if (width >= 1024) return { sidebar: 'rail', agent: 'docked' }
  return { sidebar: 'drawer', agent: width <= 600 ? 'sheet' : 'drawer' }
}

function subscribe(listener: () => void) {
  const media = window.matchMedia(WIDE_QUERY)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

const snapshot = () => window.matchMedia(WIDE_QUERY).matches
const serverSnapshot = () => false

/** Change presentation in place; never use this value to choose a second chat tree. */
export function useWide() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
