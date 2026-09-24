import { type ReactNode, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import './table.css'

export { PayDelta } from '@/components/ui/PayDelta'

export const Btn = (p: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...p} className={cn('btn', p.className)} />
export const Tag = ({ tone, click, children, className, ...p }: { tone?: 'amber' | 'blue'; click?: boolean; children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) =>
  click ? <button type="button" {...p} className={cn('tag click', tone, className)}>{children}</button> : <span className={cn('tag', tone, className)}>{children}</span>
export const Chip = ({ active, children, ...p }: { active?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...p} className={cn('chip', active && 'active')}>{children}</button>
export const Lbl = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('lbl', className)}>{children}</div>
export const Mono = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('mono', className)}>{children}</span>
export const Kv = ({ rows }: { rows: [string, ReactNode][] }) => <table className="kv">
  <thead className="sr-only"><tr><th scope="col">Field</th><th scope="col">Value</th></tr></thead>
  <tbody>{rows.map(([k, v]) => <tr key={k}><th className="k" scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
</table>
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>
export const Spinner = () => <span className="spinner" aria-hidden />

export const InfoBar = ({ title, sub, right }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode }) => (
  <div className="info-bar">
    <div className="ib-text">
      {title && <h2>{title}</h2>}
      {sub && <p className="ib-sub">{sub}</p>}
    </div>
    {right && <div className="ib-right">{right}</div>}
  </div>
)
export const Toolbar = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('toolbar', className)}>{children}</div>
export const Tile = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('tile', className)}>{children}</span>
