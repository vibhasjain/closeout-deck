import { prefetchGet } from '@/lib/api'
import { getDataSnapshot } from '@/lib/data'
import { getOnboarding } from '@/lib/onboarding'
import { activeCycles } from '@/lib/desk'
import { warmRuleActivity } from '@/lib/rules'
import { cycleIntake } from '@/lib/intake'

// App.tsx eagerly imports every route. The module graph is already resident before
// an intent can occur; importing it again resolves that same module without a chunk request.
const routes: Record<string, () => Promise<unknown>> = {
  payroll: () => import('@/pages/Payroll'), rules: () => import('@/pages/Rules'),
  profile: () => import('@/pages/Profile'), settings: () => import('@/pages/Settings'),
  shift: () => import('@/pages/ShiftPage'),
}
export function intentAllowed() {
  return !(typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
}
export function intentPaths(href: string, selectedCycle?: string, shift?: string): string[] {
  const url = new URL(href, 'https://closeout.local')
  const cycle = url.searchParams.get('cycle') ?? selectedCycle
  const paths = ['/state', '/data/cycles']
  if (cycle) paths.push(`/data/cycles/${encodeURIComponent(cycle)}`, `/data/threads?cycleId=${encodeURIComponent(cycle)}`)
  if (/\/(rules|profile)(\/|$)/.test(url.pathname)) paths.push('/memory', '/files')
  const entry = shift ?? (url.pathname.match(/\/payroll\/([^/]+)/)?.[1] && decodeURIComponent(url.pathname.split('/').at(-1)!))
  if (cycle && entry) paths.push(`/data/entries?${new URLSearchParams({ cycle, shift: entry })}`)
  return [...new Set(paths)]
}
export function prefetchIntent(href: string, cycle?: string, shift?: string): void {
  if (!intentAllowed()) return
  const path = new URL(href, 'https://closeout.local').pathname
  const route = /\/payroll\/[^/]+/.test(path) || shift ? 'shift' : path.split('/').filter(Boolean).at(-1) ?? 'payroll'
  void routes[route]?.().catch(() => {})
  void Promise.all(intentPaths(href, cycle, shift).map(path => prefetchGet(path))).then(() => {
    const state = getOnboarding(), cycles = activeCycles(state)
    if (route === 'rules') warmRuleActivity(cycles, state)
    if (route === 'payroll') {
      const id = new URL(href, 'https://closeout.local').searchParams.get('cycle') ?? cycle
      const target = cycles.find(item => item.id === id) ?? cycles.find(item => item.status === 'needs-review')
      if (target) cycleIntake(target, state)
    }
  }).catch(() => {})
}

/** Native capture observes pointerenter (which doesn't bubble), keyboard focus,
 * and touchstart for links, virtual rows and buttons using the same contract. */
export function listenForNavigationIntent(root: HTMLElement): () => void {
  const onIntent = (event: Event) => {
    if (!intentAllowed() || !(event.target instanceof Element)) return
    const target = event.target.closest<HTMLElement>('a[href], [data-prefetch-href], [data-cycle], [data-shift], [data-prefetch-shift]')
    if (!target || !root.contains(target)) return
    const here = new URL(location.href)
    const cycle = target.dataset.cycle ?? target.closest<HTMLElement>('[data-prefetch-cycle]')?.dataset.prefetchCycle
      ?? here.searchParams.get('cycle') ?? getDataSnapshot().list.find(row => row.status === 'needs-review')?.id
    const href = target.dataset.prefetchHref ?? target.getAttribute('href') ?? `/payroll${cycle ? `?cycle=${encodeURIComponent(cycle)}` : ''}`
    const destination = new URL(href, location.href)
    if (destination.origin !== location.origin) return
    const localHref = destination.pathname.replace(/^\/product(?=\/|$)/, '') + destination.search
    prefetchIntent(localHref, cycle, target.dataset.shift ?? target.dataset.prefetchShift)
  }
  const events = ['pointerenter', 'focus', 'touchstart']
  events.forEach(event => root.addEventListener(event, onIntent, { capture: true, passive: true }))
  return () => events.forEach(event => root.removeEventListener(event, onIntent, true))
}
