import { useNavigate } from 'react-router-dom'
import { ConnectorGrid } from '@/components/ConnectorGrid'
import { PageTitle } from '@/components/shell/PageTitle'
import { PaintBoundary } from '@/components/shell/PaintBoundary'
import { getDataSnapshot } from '@/lib/data'
import { SkeletonRegion } from '@/components/Skeleton'
import { Btn } from '@/components/ui'
import './settings.css'

/** Settings is your connectors, full width. The pay calendar lives in Profile; Start over lives in the account menu. */
export function Settings() {
  return <PaintBoundary ready={getDataSnapshot().loaded} routeKey="settings" fallback={<div className="settings-layout">
    <PageTitle title="Settings" description="Manage your connected sources." />
    <div className="settings-columns settings-one"><SkeletonRegion variant="review" /></div>
  </div>}><SettingsContents /></PaintBoundary>
}

function SettingsContents() {
  const navigate = useNavigate()

  return (
    <div className="settings-layout">
      <PageTitle title="Settings" description="Manage your connected sources." right={
        <Btn title="Replays the setup steps. Your pay calendar and rulebook stay as they are."
          onClick={() => navigate('/setup/agent')}>
          Onboarding
        </Btn>
      } />
      <div className="settings-columns settings-one">
        <ConnectorGrid />
      </div>
    </div>
  )
}
