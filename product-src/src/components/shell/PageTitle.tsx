import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import './page-title.css'

export function PageTitle({ title, description, label, sub, right }: {
  title: ReactNode
  description: string
  label?: string
  sub?: ReactNode
  right?: ReactNode
}) {
  return <header className="page-title-row">
    <div className="page-title-text">
      <div className="page-title-heading">
        <h2>{title}</h2>
        <Tooltip.Provider delayDuration={250}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button type="button" className="page-title-info" aria-label={`About ${label ?? title}`}>
                <Info size={15} aria-hidden="true" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="page-title-tooltip" sideOffset={6}>
                {description}
                <Tooltip.Arrow className="page-title-tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
      {sub && <p className="page-title-sub">{sub}</p>}
    </div>
    {right && <div className="page-title-actions">{right}</div>}
  </header>
}
