import type { ReactNode } from 'react'
import { AuxRail } from './Aux'

export function RailLayout({ children }: { children: ReactNode }) {
  return <div className="rail-layout">
    <section className="detail">{children}</section>
    <AuxRail />
  </div>
}
