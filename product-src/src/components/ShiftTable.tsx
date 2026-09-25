import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { RunShift } from '@/bench/engine.js'
import { Sheet } from '@/components/Sheet'
import { appliedCorrection, rowResolution, type DeskCycle } from '@/lib/desk'
import { useOnboarding } from '@/lib/onboarding'

/** Payroll's ledger. The stats row above owns its discrepancy filter; there is no search. */
export function ShiftTable({ cycle, children, shifts = cycle.run.shifts, flag = false, filterMode, onSelect, defaultFilter = 'all' }: {
  cycle: DeskCycle
  /** Rendered above the table. */
  children?: ReactNode
  shifts?: RunShift[]; flag?: boolean; filterMode?: 'discrepancies'; onSelect(id: string): void
  defaultFilter?: string
}) {
  const [state] = useOnboarding()
  const [params] = useSearchParams()
  const filter = params.get('filter') ?? defaultFilter
  const matches = (shift: RunShift) => {
    if (filterMode !== 'discrepancies' || !['total', 'agent-resolved', 'needs-review'].includes(filter)) return true
    return shift.rows.some((row) => {
      // Server cross-source corrections also count when the engine has no pay effect.
      if (row.status === 'applied') return appliedCorrection(cycle, row) && (filter === 'total' || filter === 'agent-resolved')
      if (row.status !== 'flag' && row.status !== 'held') return false
      const resolved = rowResolution(cycle, shift.shift.id, row.ruleId, state.resolutions)
      if (resolved === 'dismissed') return false
      return filter === 'total' || (filter === 'agent-resolved' ? resolved === 'applied' : !resolved)
    })
  }
  const visible = shifts.filter(matches)
  if (flag) visible.sort((a, b) => Math.abs(b.pay - b.naive) - Math.abs(a.pay - a.naive) || a.shift.id.localeCompare(b.shift.id))

  return <>
    {children}
    {visible.length > 0 && <div className="sheet-wrap reconcile-sheet scroll flex-1 min-h-0">
      <Sheet cycle={cycle} shifts={visible} groupBy={flag ? 'none' : 'worker'} onSelect={onSelect} days={cycle.days} />
    </div>}
  </>
}
