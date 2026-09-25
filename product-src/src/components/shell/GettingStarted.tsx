import { Check, ChevronRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { checklist } from '@/lib/checklist'
import { useDesk } from '@/lib/desk'
import { useOnboarding } from '@/lib/onboarding'
import { useTweened } from '@/lib/useTweened'

export function GettingStarted({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [state, update] = useOnboarding()
  const { cycles } = useDesk()
  const progress = checklist(state, new Date(), cycles)
  const done = useTweened(progress.done)
  if (progress.dismissed) return null
  return <section className="getting-started" aria-label="Getting started">
    <div className="getting-started-head">
      <h2>Getting started <span className="tabular-nums" aria-label={`${progress.done} of ${progress.total} complete`}>{Math.round(done)}/{progress.total}</span></h2>
      <button type="button" className="btn icon-btn" aria-label="Dismiss getting started" onClick={() => update({ checklistDismissed: true })}><X size={14} aria-hidden="true" /></button>
    </div>
    <ol className="getting-started-list">
      {progress.items.map((item) => <li key={item.id} className={`${item.done ? 'done' : ''}${item.expanded ? ' expanded' : ''}`}>
        <Link to={item.href} onClick={onNavigate} aria-current={item.expanded ? 'step' : undefined}>
          <span className="checklist-mark" aria-hidden="true"><Check size={14} data-visible={item.done} /><span data-visible={!item.done} /></span>
          <span className="checklist-copy"><span className="checklist-label">{item.label}</span>{item.expanded && <span className="checklist-hint">{item.hint}</span>}</span>
          {!item.done && <ChevronRight className="checklist-chevron" size={14} aria-hidden />}
          {item.done && <span className="sr-only"> (done)</span>}
        </Link>
      </li>)}
    </ol>
  </section>
}
