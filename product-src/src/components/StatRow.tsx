import type { ReactNode } from 'react'
import { Lbl } from '@/components/ui'

export interface Stat {
  label: string
  value: ReactNode
  /** Selectable stats pick the view below; the selected one sits on a quiet fill. */
  onSelect?(): void
  pressed?: boolean
  tone?: 'flagged'
  title?: string
  disabled?: boolean
}

/** The one stats row: equal columns split by hairlines, label over value. */
export function StatRow({ stats, label }: { stats: Stat[]; label?: string }) {
  return <div className="result-summary" aria-label={label}>
    {stats.map((stat) => {
      const className = `stat${stat.tone ? ` ${stat.tone}` : ''}`
      const body = <><Lbl>{stat.label}</Lbl><div className="stat-value">{stat.value}</div></>
      return stat.onSelect || stat.disabled
        ? <button key={stat.label} type="button" className={className} aria-pressed={stat.pressed} title={stat.title} disabled={stat.disabled} onClick={stat.onSelect}>{body}</button>
        : <div key={stat.label} className={className} title={stat.title}>{body}</div>
    })}
  </div>
}
