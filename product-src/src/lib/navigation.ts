import { reconcileQuery } from '@/lib/review'

export type ShiftParent = '/payroll'

function shiftQuery(cycleId: string, context: URLSearchParams, parent: ShiftParent, allShifts = false): URLSearchParams {
  const params = reconcileQuery(cycleId, context, allShifts)
  const keys = [...(parent === '/payroll' ? ['destination'] : []), ...(!allShifts ? ['filter'] : [])]
  for (const key of keys) {
    const value = context.get(key)
    if (value !== null) params.set(key, value)
  }
  return params
}

/** Shift links carry full engine IDs and the table context to restore when the modal closes. */
export function shiftHref(cycleId: string, shiftId: string, context = new URLSearchParams(), parent: ShiftParent = '/payroll'): string {
  return `${parent}/${encodeURIComponent(shiftId)}?${shiftQuery(cycleId, context, parent)}`
}

export function shiftListHref(cycleId: string, context: URLSearchParams, parent: ShiftParent, allShifts = false): string {
  return `${parent}?${shiftQuery(cycleId, context, parent, allShifts)}`
}

/** Bookmarks and saved agent actions keep their selection while routes are renamed. */
export function canonicalHref(to: string): string {
  const url = new URL(to, 'https://closeout.local')
  if (url.origin !== 'https://closeout.local') return to
  // The Timesheets tab folded into Payroll: its bucket screen is Payroll's "Needs review" mode.
  if (url.pathname === '/reconcile' || url.pathname.startsWith('/reconcile/')) {
    url.pathname = url.pathname.replace('/reconcile', '/payroll')
  }
  if (url.pathname === '/timesheets' || url.pathname.startsWith('/timesheets/')) {
    url.pathname = url.pathname.replace('/timesheets', '/payroll')
  }
  if (url.pathname === '/payroll' && url.searchParams.has('shift')) {
    url.pathname = `/payroll/${encodeURIComponent(url.searchParams.get('shift')!)}`
    url.searchParams.delete('shift')
    for (const key of ['view', 'rail', 'kind']) url.searchParams.delete(key)
  }
  if ((url.pathname === '/payroll' || url.pathname.startsWith('/payroll/')) && url.searchParams.has('flag') && !url.searchParams.has('filter')) {
    url.searchParams.set('filter', 'needs-review')
  }
  if (url.pathname === '/connect') {
    url.pathname = '/settings'
    const destination = ['payroll', 'destinations'].includes(url.searchParams.get('tab') ?? '')
      || url.searchParams.get('source')?.startsWith('dest:')
    url.searchParams.set('tab', destination ? 'destinations' : 'sources')
  }
  return `${url.pathname}${url.search}${url.hash}`
}

/** Old agent transcripts can still emit former routes. Normalize at the action boundary. */
export function agentHref(to: string, context: URLSearchParams, cycleId?: string): string {
  const url = new URL(canonicalHref(to), 'https://closeout.local')
  if (url.origin !== 'https://closeout.local') return to
  if (url.pathname.startsWith('/payroll/') && !url.searchParams.has('cycle') && cycleId) url.searchParams.set('cycle', cycleId)
  if (context.get('agent') === '1') url.searchParams.set('agent', '1')
  return `${url.pathname}${url.search}${url.hash}`
}

export type PayrollView = 'all' | 'total' | 'agent-resolved' | 'needs-review'
const VIEWS: PayrollView[] = ['all', 'total', 'agent-resolved', 'needs-review']
/** Payroll's four views, keyed by `filter`. Opens on Discrepancies; old `view=list` links open Payments. */
export function payrollView(params: URLSearchParams): PayrollView {
  const filter = params.get('filter') as PayrollView
  if (VIEWS.includes(filter)) return filter
  return params.get('view') === 'list' ? 'all' : 'total'
}
export const isTableView = (view: PayrollView) => view === 'all' || view === 'agent-resolved'
