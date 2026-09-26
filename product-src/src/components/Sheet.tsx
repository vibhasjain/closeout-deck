import { Fragment, useEffect, useState, type JSX } from 'react'
import { fmtHM, money, type RunShift } from '@/bench/engine.js'
import { PayDelta, Tag } from '@/components/ui'
import { appliedCorrection, effectiveResolutions, kinds, rowResolution, type DeskCycle } from '@/lib/desk'
import { journeyAdjustmentLine, journeyPayroll, journeyShiftMinutes, journeyShiftPay, type JourneyPayAdjustment } from '@/lib/journeyPay'
import { useOnboarding } from '@/lib/onboarding'
import './sheet.css'

// ponytail: mount worker groups in chunks as the table scrolls; a full cycle is ~3,000 rows and blocks the switch. Virtualize if chunks ever lag.
const CHUNK = 40
const deltaTone = (value: number) => Math.abs(value) < 0.005 ? '' : value > 0 ? 'owed' : 'overpay'

export function Sheet({ cycle, shifts, groupBy, selected, onSelect, days, includeAdjustments = true }: { cycle: DeskCycle; shifts: RunShift[]; groupBy: 'worker' | 'kind' | 'none'; selected?: string; onSelect(id: string): void; days: string[]; includeAdjustments?: boolean }): JSX.Element {
  const [settings] = useOnboarding()
  const decisions = effectiveResolutions(cycle, settings.resolutions)[cycle.id]
  const [limit, setLimit] = useState(CHUNK)
  const [sentinel, setSentinel] = useState<HTMLTableRowElement | null>(null)
  useEffect(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setLimit((count) => count + CHUNK) }, { rootMargin: '800px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinel, limit])

  const workerGroups = new Map<string, RunShift[]>()
  for (const rs of shifts) {
    const group = workerGroups.get(rs.shift.worker) ?? []
    group.push(rs)
    workerGroups.set(rs.shift.worker, group)
  }
  const adjustments = includeAdjustments ? cycle.adjustments ?? [] : []
  for (const item of adjustments) if (!workerGroups.has(item.worker)) workerGroups.set(item.worker, [])
  const none: JourneyPayAdjustment[] = []
  const groups = groupBy === 'worker'
    ? [...workerGroups].map(([worker, rows]) => ({
      id: worker,
      label: rows[0]?.shift.role ? `${worker} · ${rows[0].shift.role}` : worker,
      rows: [...rows].sort((a, b) => a.shift.day - b.shift.day || (a.shift.punches[0]?.in ?? 0) - (b.shift.punches[0]?.in ?? 0)),
      adjustments: adjustments.filter(item => item.worker === worker),
    }))
    : groupBy === 'none' ? [{ id: 'shifts', label: '', rows: shifts, adjustments }]
    : kinds(cycle, settings.resolutions).map((kind) => ({
      id: kind.ruleId,
      label: `${kind.ruleId} · ${kind.sentence}`,
      rows: shifts.filter((rs) => kind.cases.some((item) => item.shiftId === rs.shift.id)),
      adjustments: none,
    })).filter((group) => group.rows.length > 0)
  const columns = 7

  return <table className={`sheet payments-sheet by-${groupBy}`} aria-label={groupBy === 'worker' ? 'Time entries by worker' : 'Flagged time entries by rule'}>
      {/* Widths live in sheet.css so a narrow pane can drop Delta and give its room to Pay. */}
      <colgroup>{['day', 'worker', 'site', 'hours', 'pay', 'delta', 'status'].map((name) => <col key={name} className={`sheet-col-${name}${name === 'delta' ? ' sheet-delta' : ''}`} />)}</colgroup>
      <thead><tr>
        <th scope="col">Day</th>
        <th scope="col">Worker</th>
        <th scope="col">Site</th>
        <th scope="col" className="num sheet-hours">Hours</th><th scope="col" className="num">Pay</th>
        <th scope="col" className="num sheet-delta" title="Difference from the submitted sheet">Delta</th><th scope="col">Status</th>
      </tr></thead>
      <tbody>
        {groups.slice(0, limit).map((group) => {
          const hours = group.rows.reduce((sum, rs) => sum + journeyShiftMinutes(rs), 0) + group.adjustments.reduce((sum, item) => sum + journeyAdjustmentLine(item).regular_hours * 60, 0)
          const current = group.rows.reduce((sum, rs) => sum + rs.naive, 0)
          const pay = journeyPayroll(group.rows.map(row => row.shift), group.rows, [], new Map(), group.adjustments).gross
          const under = group.rows.reduce((sum, rs) => sum + Math.max(0, journeyShiftPay(rs) - rs.naive), 0)
          const over = group.rows.reduce((sum, rs) => sum + Math.max(0, rs.naive - journeyShiftPay(rs)), 0)
          const exposure = under >= 0.005 && over >= 0.005
            ? <><span className="pay-delta owed">{money(under)}</span> / <span className="pay-delta overpay">{money(over)}</span></>
            : <span className={`pay-delta ${deltaTone(under || -over)}`}>{money(under || over)}</span>
          return <Fragment key={group.id}>
            {groupBy !== 'none' && <tr className="grp">
              <th scope="rowgroup" colSpan={3}>
                <div className="sheet-group-row"><span className="sheet-group-title fade-trunc" title={group.label}>{group.label}</span></div>
              </th>
              <th className="num mono sheet-hours">{fmtHM(hours)}</th>
              <th className="num"><PayDelta current={current} resolved={pay} size="sm" /></th>
              <th className={`num mono sheet-delta${groupBy === 'worker' ? ` pay-delta ${deltaTone(pay - current)}` : ''}`}>
                {groupBy === 'worker' ? money(Math.abs(pay - current)) : exposure}
              </th>
              <th />
            </tr>}
            {group.rows.map((rs) => {
              const s = rs.shift
              const decision = decisions?.[s.id]
              const escalated = rs.rows.some(row => (row.status === 'flag' || row.status === 'held' || appliedCorrection(cycle, row))
                && rowResolution(cycle, s.id, row.ruleId, settings.resolutions) === 'escalated')
              const flagged = rs.held || (!decision && rs.flagged)
              const pay = journeyShiftPay(rs)
              const delta = pay - rs.naive
              return <tr key={s.id} data-shift={s.id} data-prefetch-cycle={cycle.id} className={selected === s.id ? 'sel' : undefined}
                tabIndex={0} aria-selected={selected === s.id} aria-label={`${s.worker}, ${days[s.day]}, time entry`}
                onClick={() => onSelect(s.id)} onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(s.id) }
                }}>
                <td className="sheet-day">{days[s.day]}</td>
                <td><span className="block fade-trunc" title={s.worker}>{s.worker}</span></td>
                <td><span className="site-name fade-trunc" title={`${s.fac.name} · ${s.fac.city}, ${s.fac.state}`}>{s.fac.name}</span></td>
                <td className="num mono sheet-hours">{fmtHM(journeyShiftMinutes(rs))}</td><td className="num"><PayDelta current={rs.naive} resolved={pay} size="sm" /></td>
                <td className={`num mono sheet-delta pay-delta ${deltaTone(delta)}`}>{money(Math.abs(delta))}</td>
                <td>{rs.held ? <Tag tone="amber">Held</Tag> : escalated ? <Tag tone="amber">Escalated</Tag> : flagged && <Tag tone="amber">Flagged</Tag>}</td>
              </tr>
            })}
            {group.adjustments.map(item => {
              const line = journeyAdjustmentLine(item)
              return <tr key={item.id} data-adjustment={item.id}>
                <td className="sheet-day">—</td>
                <td><span className="block fade-trunc" title={item.worker}>{item.worker}</span></td>
                <td>Adjustment for {item.cycleId}</td>
                <td className="num mono sheet-hours">{fmtHM(line.regular_hours * 60)}</td>
                <td className="num"><PayDelta current={0} resolved={line.gross} size="sm" /></td>
                <td className={`num mono sheet-delta pay-delta ${deltaTone(line.gross)}`}>{money(Math.abs(line.gross))}</td>
                <td><Tag>Adjustment</Tag></td>
              </tr>
            })}
          </Fragment>
        })}
        {limit < groups.length && <tr ref={setSentinel} aria-hidden="true"><td colSpan={columns} /></tr>}
        {shifts.length === 0 && adjustments.length === 0 && <tr><td colSpan={columns} className="empty">Nothing matches</td></tr>}
      </tbody>
    </table>
}
