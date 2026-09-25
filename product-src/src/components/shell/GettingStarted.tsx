import { Check, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { checklist } from '@/lib/checklist'
import { useOnboarding } from '@/lib/onboarding'

export function GettingStarted({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [state, update] = useOnboarding()
  const progress = checklist(state)
  if (progress.dismissed) return null
  return <section className="getting-started" aria-label="Getting started">
    <div className="getting-started-head">
      <h2>Getting started <span>{progress.done}/{progress.total}</span></h2>
      <button type="button" className="btn icon-btn" aria-label="Dismiss getting started" onClick={() => update({ checklistDismissed: true })}><X size={14} aria-hidden="true" /></button>
    </div>
    <ol className="getting-started-list">
      {progress.items.map((item) => <li key={item.id} className={`${item.done ? 'done' : ''}${item.expanded ? ' expanded' : ''}`}>
        <Link to={item.href} onClick={onNavigate} aria-current={item.expanded ? 'step' : undefined}>
          <span className="checklist-mark" aria-hidden="true">{item.done ? <Check size={13} /> : <span />}</span>
          <span className="checklist-copy"><span className="checklist-label">{item.label}</span>{item.expanded && <span className="checklist-hint">{item.hint}</span>}</span>
          {item.done && <span className="sr-only"> (done)</span>}
        </Link>
      </li>)}
    </ol>
  </section>
}
