// Source: https://www.beautifului.dev/r/task-rows.json (Beautiful UI, MIT).
// Ported SpinnerRing, expandable rows and detail grammar; server state replaces the demo timeline.
import { useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import './task-rows.css'

export interface TaskRow {
  key: string
  label: string
  amount: ReactNode
  status: 'done' | 'running' | 'queued'
  step: number
  details: { label: string; meta: ReactNode }[]
}

function SpinnerRing({ active, done, children }: { active: boolean; done: boolean; children: ReactNode }) {
  const size = 24, stroke = 0.5, radius = (size - stroke) / 2, circumference = 2 * Math.PI * radius
  return <span className="beautiful-task-ring">
    <svg width={size} height={size} aria-hidden="true" data-active={active}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(0,0,0,.1)" strokeWidth={stroke} />
      {active && <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray={`${circumference * .28} ${circumference * .72}`} />}
    </svg>
    <span>{done ? <Check size={12} aria-hidden="true" /> : children}</span>
  </span>
}

export function TaskRows({ rows }: { rows: TaskRow[] }) {
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({})
  return <div className="beautiful-task-rows" role="list" aria-label="Closeout steps">
    {rows.map(row => {
      const open = manualOpen[row.key] ?? false
      return <div className="beautiful-task-row" key={row.key} role="listitem" data-state={row.status}>
        <button type="button" aria-expanded={open} onClick={() => setManualOpen(current => ({ ...current, [row.key]: !open }))}>
          <SpinnerRing active={row.status === 'running'} done={row.status === 'done'}>{row.step}</SpinnerRing>
          <span className="beautiful-task-label">{row.label}</span>
          <span className="beautiful-task-amount tabular-nums">{row.amount}</span>
          <ChevronDown size={12} aria-hidden="true" className="beautiful-task-chevron" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
        <div className="beautiful-task-details" inert={!open} style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}>
          <div><div className="beautiful-task-details-inner">
            <span aria-hidden="true" className="beautiful-task-guide" />
            <div>{row.details.map(detail => <div key={detail.label} className="beautiful-task-detail"><span>{detail.label}</span><span className="tabular-nums">{detail.meta}</span></div>)}</div>
          </div></div>
        </div>
      </div>
    })}
  </div>
}
