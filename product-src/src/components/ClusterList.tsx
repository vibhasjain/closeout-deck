import type { ReactNode } from 'react'
import { Tag } from '@/components/ui'
import { money } from '@/bench/engine.js'

interface Cluster {
  id: string
  /** What the chip shows, when the selection key is not itself readable. */
  label?: string
  count: number
  status: string
  tone?: 'amber' | 'blue'
  sentence: string
  impact?: number
}

/** Flags and pay cycles share the same two-line row and spacing. */
export function ClusterList({ items, selected, onSelect, kind, header }: {
  items: Cluster[]
  /** Sits above the list, e.g. the pay-cycle period filters. */
  header?: ReactNode
  selected: string | null
  onSelect(id: string): void
  kind: 'flags' | 'cycles'
}) {
  if (!items.length && !header) return null
  return <aside className={`queue flags-pane${kind === 'cycles' ? ' pay-cycles-pane' : ''}`} aria-label={kind === 'cycles' ? 'Pay cycles' : 'Flags'}>
    {header}
    <div className="case-list scroll">
      {items.map((item) => <button type="button" key={item.id}
        data-cluster={item.id} data-cycle={kind === 'cycles' ? item.id : undefined}
        className={`case cluster-row${selected === item.id ? ' active' : ''}`}
        aria-pressed={selected === item.id} onClick={() => onSelect(item.id)}>
        {kind === 'cycles'
          // A pay cycle is named by its dates, not an id: plain title text, status on the
          // right, and the count folded into the meta line where it means something.
          ? <span className="row1">
              <span className="cluster-title">{item.label ?? item.id}</span>
              <Tag className="cluster-status" tone={item.tone}>{item.status}</Tag>
            </span>
          : <span className="row1">
              <span className="cluster-title">{item.label ?? item.id}</span>
              <span className="count mono">{item.count}</span>
              <Tag className="cluster-status" tone={item.tone}>{item.status}</Tag>
            </span>}
        {item.impact !== undefined
          ? <span className={`meta cluster-sentence mono pay-delta ${item.impact > 0.005 ? 'owed' : item.impact < -0.005 ? 'overpay' : ''}`} title="Net change from the submitted pay for these time entries">{item.impact < -0.005 ? '−' : item.impact > 0.005 ? '+' : ''}{money(Math.abs(item.impact))}</span>
          : item.sentence && <span className="meta cluster-sentence">{item.sentence}</span>}
      </button>)}
    </div>
  </aside>
}
