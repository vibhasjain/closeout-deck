import { fmtT, type RunShift } from '@/bench/engine.js'
import { provenance, type DeskCycle } from '@/lib/desk'

/** The rows behind one shift, as a CSV the reviewer can open where the data lives. */
export function exportShiftRows(cycle: DeskCycle, rs: RunShift) {
  const s = rs.shift
  const source = provenance(cycle, rs.shift, 0)
  const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const header = ['Time entry ID', 'Worker', 'Day', 'Site', 'System', 'Source file', 'Source row', 'Punch in', 'Punch out', 'Rate', 'Sheet pay', 'Closeout pay']
  const rows = s.punches.map((punch) => [s.id, s.worker, cycle.days[s.day], s.fac.name, source.system, source.file, source.row, fmtT(punch.in), punch.out == null ? '' : fmtT(punch.out), s.rate.toFixed(2), rs.naive.toFixed(2), rs.pay.toFixed(2)])
  const csv = [header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${source.file.replace(/\.csv$/i, '')}_shift_${s.id}.csv`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
