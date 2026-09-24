import { Check, FileInput, FilePenLine, ListChecks, Pencil, Send, SkipForward, type LucideIcon } from 'lucide-react'
import { Tag } from '@/components/ui'
import type { TrailEntry } from '@/lib/threads'
import './agent-trace.css'

export type TraceEntry = Omit<TrailEntry, 'action'> & { action: TrailEntry['action'] | 'resolved' | 'skipped' }

const actions: Record<TraceEntry['action'], { label: string; icon: LucideIcon }> = {
  ingested: { label: 'Ingested', icon: FileInput },
  drafted: { label: 'Drafted', icon: FilePenLine },
  revised: { label: 'Revised', icon: Pencil },
  sent: { label: 'Sent', icon: Send },
  status: { label: 'Updated', icon: ListChecks },
  resolved: { label: 'Resolved', icon: Check },
  skipped: { label: 'Skipped', icon: SkipForward },
}

export function AgentTrace({ entries }: { entries: readonly TraceEntry[] }) {
  const ordered = [...entries].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0))
  return <ol className="agent-trace" aria-label="Closeout Agent activity">
    {ordered.map((entry, index) => {
      const skipped = entry.action === 'status' && entry.detail === 'Draft marked not needed'
      const { label, icon: Icon } = actions[skipped ? 'skipped' : entry.action]
      const date = new Date(entry.at)
      const recorded = Number.isFinite(date.getTime())
      return <li className="agent-trace-event" key={`${entry.at}:${entry.action}:${index}`}>
        <span className="agent-trace-icon" aria-hidden="true"><Icon size={13} strokeWidth={1.75} /></span>
        <article className="agent-trace-card">
          <div className="agent-trace-meta">
            {recorded
              ? <time dateTime={entry.at} title={date.toLocaleString('en-US', { hour12: true })}>{date.toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
              })}</time>
              : <span>Time not recorded</span>}
            <Tag className="agent-trace-action">{label}</Tag>
          </div>
          <p>{skipped ? 'Draft skipped' : entry.detail}</p>
        </article>
      </li>
    })}
  </ol>
}
