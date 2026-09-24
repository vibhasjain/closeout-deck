import { useNavigate } from 'react-router-dom'
import { ConnectorGrid } from '@/components/ConnectorGrid'
import { PayCycles } from '@/components/PayCycles'
import { PayrollCalendar } from '@/components/PayrollCalendar'
import { Btn, InfoBar } from '@/components/ui'

/** Settings is your connectors, with the payroll calendar beside them. Nothing else. */
export function Settings() {
  const navigate = useNavigate()

  return (
    <div className="settings-layout">
      <InfoBar title="Settings" right={
        <Btn title="Replays the setup steps. Your Payroll calendar and rulebook stay as they are."
          onClick={() => navigate('/setup/agent')}>
          Onboarding
        </Btn>
      } />
      <div className="settings-columns settings-two">
        <ConnectorGrid />
        <aside className="settings-side detail-body scroll" aria-labelledby="settings-calendar">
          <h3 id="settings-calendar">Payroll calendar</h3>
          <h4 className="settings-cycle-head">Main pay cycle</h4>
          <PayrollCalendar />
          <h4 className="settings-cycle-head">Other pay cycles</h4>
          <PayCycles />
        </aside>
      </div>
    </div>
  )
}
