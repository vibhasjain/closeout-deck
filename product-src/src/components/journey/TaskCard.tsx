import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { FirstCloseoutChoice } from '@/components/chat/FirstCloseoutChoice'
import { Spinner, Tag } from '@/components/ui'
import type { CyclePayload, CycleSummary } from '@/lib/data'
import { cycleLabel } from '@/lib/cycles'
import { useJourneyCycle } from '@/lib/journey'
import { DotMatrix } from './DotMatrix'
import './task-findings.css'

/** Counts interpolate only between server values; elapsed time never completes a task. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTweened(value: number) {
  const [shown, setShown] = useState(value)
  const last = useRef(value)
  useEffect(() => {
    const from = last.current
    const start = performance.now()
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const tick = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / 320)
      last.current = Math.round(from + (value - from) * (1 - (1 - t) ** 3))
      setShown(last.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return shown
}

// eslint-disable-next-line react-refresh/only-export-components
export function taskProgress(cycle?: CyclePayload, row?: CycleSummary) {
  const counts = cycle?.counts ?? row?.counts ?? { set1: 0, set2: 0, set3: 0 }
  return {
    // The list may still advertise an older run while the detail endpoint returns 404.
    status: cycle?.runAt ? 'Done' as const : 'Running' as const,
    sets: [counts.set1, counts.set2, counts.set3],
    missingSets: ([1, 2, 3] as const).filter(set => !counts[`set${set}`]),
    workers: cycle?.totals.workers ?? row?.totals?.workers ?? 0,
    rules: new Set(cycle?.results.flatMap(result => result.rows.map(row => row.ruleId)) ?? []).size,
    differences: cycle ? [...cycle.groups, ...cycle.extraGroups].reduce((n, group) => n + group.cases, 0) : row?.findings ?? 0,
  }
}

const localDate = (date: string) => new Date(`${date}T00:00:00`)
function Count({ value }: { value: number }) { return <span className="tabular-nums journey-count">{useTweened(value).toLocaleString()}</span> }

export function TaskCard({ cycleId, onAnswer }: { cycleId: string; onAnswer?(answer: string): void }) {
  const { cycle, row, error } = useJourneyCycle(cycleId)
  const task = taskProgress(cycle, row)
  const dates = cycle?.cycle ?? row
  const label = dates ? cycleLabel({ ...dates, start: localDate(dates.start), end: localDate(dates.end),
    cutoff: localDate(dates.cutoff), deadline: localDate(dates.deadline), payDate: localDate(dates.payDate) }) : cycleId
  return <section className="journey-task" aria-label={`Closeout · ${label}`}>
    <div className="journey-task-title"><h3>Closeout · {label}</h3><span role="status"><Tag className="journey-task-status">{task.status === 'Done' ? <Check size={12} aria-hidden /> : <Spinner />}{task.status}</Tag></span></div>
    {error && <p role="alert">{error}</p>}
    {(cycle?.sample ?? row?.sample) && <Tag>Sample</Tag>}
    <table className="journey-task-steps"><thead className="sr-only"><tr><th scope="col">Step</th><th scope="col">Count</th></tr></thead><tbody>
      <tr><th scope="row">Fetching set 1 · set 2 · set 3 (location)</th><td>{task.sets.map((count, index) => <span key={index}>{index > 0 && ' · '}<Count value={count} /></span>)}</td></tr>
      <tr><th scope="row">Matching workers</th><td><Count value={task.workers} /></td></tr>
      <tr><th scope="row">Applying <Count value={task.rules} /> rules</th><td><Count value={task.rules} /></td></tr>
      <tr><th scope="row">Pricing differences</th><td><Count value={task.differences} /></td></tr>
    </tbody></table>
    {task.status === 'Running' && <DotMatrix />}
    {task.missingSets.map(set => <div key={set} className="journey-missing-set">
      <div className="journey-missing-label">Set {set}{set === 3 ? ' · Location' : set === 1 ? ' · Worker-reported' : ' · Client-approved'}</div>
      <FirstCloseoutChoice card={{ kind: 'question', input: 'choice', topics: [], set, choice: { yours: 'Upload yours / connect', sample: 'Use sample' } }} onAnswer={onAnswer} />
      <Tag>Sample</Tag>
    </div>)}
  </section>
}
