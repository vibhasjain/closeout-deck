import { useNavigate } from 'react-router-dom'
import { ConnectorGrid } from '@/components/ConnectorGrid'
import { PayCycles } from '@/components/PayCycles'
import { PayrollCalendar } from '@/components/PayrollCalendar'
import { PageTitle } from '@/components/shell/PageTitle'
import { PaintBoundary } from '@/components/shell/PaintBoundary'
import { SkeletonRegion } from '@/components/Skeleton'
import { StartOver } from '@/components/StartOver'
import { Btn } from '@/components/ui'
import './settings.css'

/** Settings is your connectors, with the payroll calendar beside them. HyperTrack accounts also get Start over, last. */
export function Settings() {
  return <PaintBoundary routeKey="settings" fallback={<div className="settings-layout">
    <PageTitle title="Settings" description="Manage your connected sources and Payroll calendar." />
    <div className="settings-columns settings-two"><SkeletonRegion variant="review" /><SkeletonRegion variant="profile" /></div>
  </div>}><SettingsContents /></PaintBoundary>
}

function SettingsContents() {
  const navigate = useNavigate()

  return (
    <div className="settings-layout">
      <PageTitle title="Settings" description="Manage your connected sources and Payroll calendar." right={
        <Btn title="Replays the setup steps. Your Payroll calendar and rulebook stay as they are."
          onClick={() => navigate('/setup/agent')}>
          Onboarding
        </Btn>
      } />
      <div className="settings-columns settings-two">
        <ConnectorGrid />
        <aside className="settings-side detail-body scroll" aria-labelledby="settings-calendar">
          <h3 id="settings-calendar">Payroll Calendar</h3>
          <h4 className="settings-cycle-head">Main Pay Cycle</h4>
          <PayrollCalendar />
          <h4 className="settings-cycle-head">Other Pay Cycles</h4>
          <PayCycles />
          <StartOver />
        </aside>
      </div>
    </div>
  )
}
