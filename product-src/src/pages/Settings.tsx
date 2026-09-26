import { useNavigate } from 'react-router-dom'
import { ConnectorGrid } from '@/components/ConnectorGrid'
import { PageTitle } from '@/components/shell/PageTitle'
import { PaintBoundary } from '@/components/shell/PaintBoundary'
import { SkeletonRegion } from '@/components/Skeleton'
import { StartOver } from '@/components/StartOver'
import { Btn } from '@/components/ui'
import './settings.css'

/** Settings is your connectors. The pay calendar lives in Profile. HyperTrack accounts also get Start over, last. */
export function Settings() {
  return <PaintBoundary routeKey="settings" fallback={<div className="settings-layout">
    <PageTitle title="Settings" description="Manage your connected sources." />
    <div className="settings-columns"><SkeletonRegion variant="review" /></div>
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
      <div className="settings-columns">
        <ConnectorGrid />
        <StartOver />
      </div>
    </div>
  )
}
