import { Fragment, type JSX } from 'react'
import { fmtHM, money, type RunShift } from '@/bench/engine.js'
import { PayDelta, Tag } from '@/components/ui'
import { effectiveResolutions, kinds, type DeskCycle } from '@/lib/desk'
import { useOnboarding } from '@/lib/onboarding'
import './sheet.css'

const deltaTone = (value: number) => Math.abs(value) < 0.005 ? '' : value > 0 ? 'owed' : 'overpay'

export function Sheet({ cycle, shifts, groupBy, selected, onSelect, days }: { cycle: DeskCycle; shifts: RunShift[]; groupBy: 'worker' | 'kind' | 'none'; selected?: string; onSelect(id: string): void; days: string[] }): JSX.Element {
  const [settings] = useOnboarding()
  const decisions = effectiveResolutions(cycle, settings.resolutions)[cycle.id]

  const workerGroups = new Map<string, RunShift[]>()
  for (const rs of shifts) {
    const group = workerGroups.get(rs.shift.worker) ?? []
    group.push(rs)
    workerGroups.set(rs.shift.worker, group)
  }
  const groups = groupBy === 'worker'
    ? [...workerGroups].map(([worker, rows]) => ({
      id: worker,
      label: `${worker} · ${rows[0].shift.role}`,
      rows: [...rows].sort((a, b) => a.shift.day - b.shift.day || (a.shift.punches[0]?.in ?? 0) - (b.shift.punches[0]?.in ?? 0)),
    }))
    : groupBy === 'none' ? [{ id: 'shifts', label: '', rows: shifts }]
    : kinds(cycle, settings.resolutions).map((kind) => ({
      id: kind.ruleId,
      label: `${kind.ruleId} · ${kind.sentence}`,
      rows: shifts.filter((rs) => kind.cases.some((item) => item.shiftId === rs.shift.id)),
    })).filter((group) => group.rows.length > 0)
  const columns = 7

  return <table className={`sheet payments-sheet by-${groupBy}`} aria-label={groupBy === 'worker' ? 'Time entries by worker' : 'Flagged time entries by rule'}>
      <colgroup>{[11, 18, 18, 11, 22, 9, 11].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
      <thead><tr>
        <th scope="col">Day</th>
        <th scope="col">Worker</th>
        <th scope="col">Site</th>
        <th scope="col" className="num sheet-hours">Hours</th><th scope="col" className="num">Pay</th>
        <th scope="col" className="num" title="Difference from the submitted sheet">Δ</th><th scope="col">Status</th>
      </tr></thead>
      <tbody>
        {groups.map((group) => {
          const hours = group.rows.reduce((sum, rs) => sum + rs.payableMin, 0)
          const current = group.rows.reduce((sum, rs) => sum + rs.naive, 0)
          const pay = group.rows.reduce((sum, rs) => sum + rs.pay, 0)
          const under = group.rows.reduce((sum, rs) => sum + Math.max(0, rs.pay - rs.naive), 0)
          const over = group.rows.reduce((sum, rs) => sum + Math.max(0, rs.naive - rs.pay), 0)
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
              <th className={`num mono${groupBy === 'worker' ? ` pay-delta ${deltaTone(pay - current)}` : ''}`}>
                {groupBy === 'worker' ? money(Math.abs(pay - current)) : exposure}
              </th>
              <th />
            </tr>}
            {group.rows.map((rs) => {
              const s = rs.shift
              const decision = decisions?.[s.id]
              // Two states only: something a person still has to decide, or nothing.
              const flagged = !decision && (rs.held || rs.flagged)
              const delta = rs.pay - rs.naive
              return <tr key={s.id} data-shift={s.id} className={selected === s.id ? 'sel' : undefined}
                tabIndex={0} aria-selected={selected === s.id} aria-label={`${s.worker}, ${days[s.day]}, time entry ${s.id}`}
                onClick={() => onSelect(s.id)} onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(s.id) }
                }}>
                <td className="sheet-day">{days[s.day]}</td>
                <td><span className="block fade-trunc" title={s.worker}>{s.worker}</span></td>
                <td><span className="site-name fade-trunc" title={`${s.fac.name} · ${s.fac.city}, ${s.fac.state}`}>{s.fac.name}</span></td>
                <td className="num mono sheet-hours">{fmtHM(rs.payableMin)}</td><td className="num"><PayDelta current={rs.naive} resolved={rs.pay} size="sm" /></td>
                <td className={`num mono pay-delta ${deltaTone(delta)}`}>{money(Math.abs(delta))}</td>
                <td>{flagged && <Tag tone="amber">Flagged</Tag>}</td>
              </tr>
            })}
          </Fragment>
        })}
        {shifts.length === 0 && <tr><td colSpan={columns} className="empty">Nothing matches</td></tr>}
      </tbody>
    </table>
}
