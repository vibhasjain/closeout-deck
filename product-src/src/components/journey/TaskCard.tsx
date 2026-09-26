import { SkeletonRegion } from '@/components/Skeleton'
// Border beam source: https://libraries.dev/beam.html (border-beam, MIT).
import { useState } from 'react'
import { BorderBeam } from 'border-beam'
import { Check, ChevronDown } from 'lucide-react'
import { FirstCloseoutChoice } from '@/components/chat/FirstCloseoutChoice'
import { TaskRows, type TaskRow } from '@/components/beautiful/task-rows'
import { Spinner, Tag } from '@/components/ui'
import type { CyclePayload, CycleSummary } from '@/lib/data'
import { cycleLabel } from '@/lib/cycles'
import { kindLabel } from '@/lib/desk'
import { useJourneyCycle } from '@/lib/journey'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { useTweened } from '@/lib/useTweened'
import { DotMatrix } from './DotMatrix'
import './task-findings.css'

// eslint-disable-next-line react-refresh/only-export-components
export function taskProgress(cycle?: CyclePayload, row?: CycleSummary, empty = false, pipelineRunning = false, error?: string | null) {
  const counts = cycle?.counts ?? row?.counts ?? { set1: 0, set2: 0, set3: 0 }
  return {
    status: error ? 'Interrupted' as const : pipelineRunning ? 'Running' as const : cycle?.runAt ? 'Done' as const : empty ? 'No time entries yet' as const : 'Running' as const,
    sets: [counts.set1, counts.set2, counts.set3],
    missingSets: ([1, 2, 3] as const).filter(set => !counts[`set${set}`]),
    workers: cycle?.totals.workers ?? row?.totals?.workers ?? 0,
    rules: cycle?.rulesChecked ?? 0,
    differences: cycle ? [...cycle.groups, ...cycle.extraGroups].reduce((n, group) => n + group.cases, 0) : row?.findings ?? 0,
  }
}

const localDate = (date: string) => new Date(`${date}T00:00:00`)
function Count({ value }: { value: number }) { return <span className="tabular-nums journey-count">{Math.round(useTweened(value)).toLocaleString()}</span> }

export function TaskCard({ cycleId, messageId, onAnswer }: { cycleId: string; messageId?: string; onAnswer?(answer: string): void }) {
  const { cycle, row, empty, error, pipelineRunning, loading } = useJourneyCycle(cycleId, messageId)
  const task = taskProgress(cycle, row, empty, pipelineRunning, error)
  const reduced = useReducedMotion()
  const [expanded, setExpanded] = useState(false)
  const [completedRun, setCompletedRun] = useState<string | null>(task.status === 'Done' ? cycle?.runAt ?? '' : null)
  const running = task.status === 'Running'
  // Only a card that showed this run plays its hand-off; a card that mounted Done stays collapsed when a later run lands.
  const [ran, setRan] = useState(running)
  if (running && !ran) setRan(true)
  const settling = ran && task.status === 'Done' && completedRun !== cycle?.runAt && !reduced
  const showSteps = running || settling || expanded || task.status !== 'Done'
  const dates = cycle?.cycle ?? row
  const label = dates ? cycleLabel({ ...dates, start: localDate(dates.start), end: localDate(dates.end),
    cutoff: localDate(dates.cutoff), deadline: localDate(dates.deadline), payDate: localDate(dates.payDate) }) : cycleId
  const done = task.status === 'Done'
  const active = task.sets.some(count => !count) ? 0 : !task.workers ? 1 : !task.rules ? 2 : 3
  const status = (index: number): TaskRow['status'] => done || index < active ? 'done' : running && index === active ? 'running' : 'queued'
  const rows: TaskRow[] = [
    { key: 'fetch', step: 1, label: 'Time entry sets 1 · 2 · 3', amount: task.sets.map((count, index) => <span key={index}>{index > 0 && ' · '}<Count value={count} /></span>), status: status(0), details: task.sets.map((count, index) => ({ label: ['Worker-reported', 'Client-approved', 'Location'][index], meta: <Count value={count} /> })) },
    { key: 'match', step: 2, label: 'Matching workers', amount: <Count value={task.workers} />, status: status(1), details: [{ label: 'Workers matched', meta: <Count value={task.workers} /> }] },
    { key: 'rules', step: 3, label: 'Applying rules', amount: <Count value={task.rules} />, status: status(2), details: [{ label: 'Rules checked', meta: <Count value={task.rules} /> }] },
    { key: 'price', step: 4, label: 'Pricing differences', amount: <Count value={task.differences} />, status: status(3), details: [{ label: 'Findings priced', meta: <Count value={task.differences} /> }] },
  ]
  const labels = [
    ...(task.workers ? [`Matched ${task.workers.toLocaleString()} workers`] : []),
    ...task.sets.flatMap((count, i) => count ? [`Set ${i + 1} · ${count.toLocaleString()} time entries`] : []),
    ...(cycle ? [...cycle.groups, ...cycle.extraGroups].filter(group => group.cases > 0).map(group => `${kindLabel(group.ruleId)} · ${group.cases.toLocaleString()}`) : []),
  ]
  if (loading && !cycle && !error) return <SkeletonRegion className="journey-task" />
  return <section className="journey-task" aria-label={`Closeout · ${label}`} data-state={task.status}>
    {running && !reduced && <div className="journey-running-beam" aria-hidden="true" data-testid="running-beam"><BorderBeam size="line" colorVariant="mono" theme="light" strength={.35}><span /></BorderBeam></div>}
    <div className="journey-task-title">
      <h3>Closeout · {label}</h3>
      <span role="status"><Tag className="journey-task-status">{done ? <Check size={12} aria-hidden /> : running && <Spinner />}{task.status}</Tag></span>
      <button className="journey-task-toggle" type="button" aria-label={showSteps ? 'Hide closeout steps' : 'Show closeout steps'} aria-expanded={showSteps} disabled={running || settling} onClick={() => setExpanded(value => !value)}><ChevronDown size={12} aria-hidden="true" style={{ transform: showSteps ? 'rotate(180deg)' : undefined }} /></button>
    </div>
    {error && <p role="alert" className="journey-task-error">{error}</p>}
    <div className="journey-task-collapse" data-open={showSteps} inert={!showSteps}>
      <div><div className="journey-task-body">
        <div className="journey-task-columns"><span>Task{(cycle?.sample ?? row?.sample) && <> · <Tag>Sample</Tag></>}</span><span>Count</span></div>
        <TaskRows rows={rows} />
        {(running || settling) && <DotMatrix complete={done} paused={!!error} matched={task.workers || task.sets.reduce((sum, count) => sum + count, 0)} kept={task.differences} labels={labels} onFinished={() => setCompletedRun(cycle?.runAt ?? '')} />}
      </div></div>
    </div>
    {!pipelineRunning && task.missingSets.map(set => <div key={set} className="journey-missing-set">
      <div className="journey-missing-label">Set {set}{set === 3 ? ' · Location' : set === 1 ? ' · Worker-reported' : ' · Client-approved'}</div>
      <FirstCloseoutChoice card={{ kind: 'question', input: 'choice', topics: [], set, choice: { yours: 'Upload yours / connect', sample: 'Use sample' } }} onAnswer={onAnswer} />
      <Tag>Sample</Tag>
    </div>)}
  </section>
}
