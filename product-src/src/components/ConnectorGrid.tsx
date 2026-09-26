import { SOURCES } from '@/bench/vendors'
import { ConnectMethod } from '@/components/ConnectMethod'
import { InboxAddress } from '@/components/InboxAddress'
import { VendorTile, vendorKey } from '@/components/SourcesTable'
import { useOverlay } from '@/components/shell/Overlay'
import { Lbl } from '@/components/ui'
import { METHODS } from '@/lib/connectMethods'
import { inboxAddress, useOnboarding } from '@/lib/onboarding'
import { useCurrentEmail } from '@/lib/useCurrentEmail'
import './connector-grid.css'

/** The inbox address, then every timesheet system as a logo. Nothing is connected until you pick how; a connected logo carries its method's icon. */
export function ConnectorGrid() {
  const [state] = useOnboarding()
  const { openModal } = useOverlay()
  const email = useCurrentEmail()
  return <div className="detail-body scroll source-grid-wrap">
    <InboxAddress address={inboxAddress(email)} />
    {[...new Set(SOURCES.map((item) => item.group))].map((group) => <section key={group} className="source-grid-group">
      <Lbl>{group}</Lbl>
      <div className="source-grid">
        {SOURCES.filter((item) => item.group === group).map((item) => {
          const method = state.connections[vendorKey(item)]?.method
          const Mark = METHODS.find((entry) => entry.id === method)?.Icon
          const sample = state.connections[vendorKey(item)]?.sample
          return <button type="button" key={item.id} className={`source-tile${method ? ' on' : ''}`} title={item.name} aria-label={`${item.name}${method ? ` · connected by ${method}` : ''}`}
            // The catalog's sites are illustrative; a sample connection uses the sample's own clients.
            onClick={() => openModal(<ConnectMethod vendor={{ ...item, sites: [] }} />)}>
            <VendorTile vendor={item} large />
            {/* Sample and the connect method share the top-right corner, out of the logo's flow. */}
            {(Mark || sample) && <span className="source-tile-badges">
              {sample && <span className="tag">Sample</span>}
              {Mark && <span className="source-tile-method"><Mark size={11} aria-hidden="true" /></span>}
            </span>}
          </button>
        })}
      </div>
    </section>)}
  </div>
}
