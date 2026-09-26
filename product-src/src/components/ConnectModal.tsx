import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { SkeletonRegion } from '@/components/Skeleton'
import { usePendingAction } from '@/lib/usePendingAction'
import { useEffect, useRef, useState, type JSX } from 'react'
import { ChevronLeft, ChevronRight, Lock, X } from 'lucide-react'
import type { Source, Destination } from '@/bench/vendors'
import { useDesk } from '@/lib/desk'
import { useOnboarding } from '@/lib/onboarding'
import { connectSource } from '@/lib/data'
import { Tag } from '@/components/ui'
import { VendorTile, vendorKey } from '@/components/SourcesTable'
import { useOverlay } from '@/components/shell/Overlay'

/** `cycleId`: the cycle this connection loads; by default the closing cycle, the one the server's sample connection fills. */
export function ConnectModal({ vendor, onDone, loadSample = false, cycleId }: { vendor: Source | Destination; onDone(): void; loadSample?: boolean; cycleId?: string }): JSX.Element {
  const [state, update] = useOnboarding()
  const { cycles, current, byId } = useDesk()
  const cycle = (cycleId ? byId(cycleId) : undefined) ?? cycles.find((item) => item.status === 'needs-review') ?? current
  const { close, toast } = useOverlay()
  const [phase, setPhase] = useState<'login' | 'syncing' | 'done'>('login')
  const action = usePendingAction()
  const [loaded, setLoaded] = useState<number | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const latest = useRef(state)
  useEffect(() => { latest.current = state }, [state])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; if (completionTimer.current) clearTimeout(completionTimer.current) }
  }, [])
  const host = vendor.name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')
  const destination = 'format' in vendor
  const sites = destination || !vendor.sites.length ? new Set(cycle.week.map((shift) => shift.fac.name)).size : vendor.sites.length
  const approved = cycle.run.shifts.filter((row) => !row.held)
  // A sample load reports what it actually loaded; a demo connection reports the entries already in this cycle.
  const entries = loaded ?? cycle.run.shifts.filter(({ shift }) => !vendor.sites.length || vendor.sites.includes(shift.fac.name)).length
  // The request starts on click; the Sign In button carries Connecting…/Retry while the frame shows a skeleton.
  function connect() {
    if (phase !== 'login') return
    void action.run(async () => {
      setPhase('syncing')
      if (loadSample && !destination) {
        try {
          const result = await connectSource({ set: vendor.set ?? 2, system: vendor.name, site: vendor.sites[0] })
          if (mounted.current) setLoaded((result?.files ?? []).reduce((total, file) => total + (file.entryCount ?? 0), 0))
        } catch (cause) { if (mounted.current) setPhase('login'); throw cause }
      }
      if (!mounted.current) return
      const connections = { ...latest.current.connections, [vendorKey(vendor)]: { status: 'connected' as const, method: 'browser' as const, lastSync: new Date().toISOString(), ...(loadSample ? { sample: true } : {}) } }
      latest.current = { ...latest.current, connections }
      update({ connections })
      setPhase('done')
      completionTimer.current = setTimeout(() => {
        close()
        toast(`${vendor.name} connected${loadSample ? ' · Sample' : ''}`)
        onDone()
      }, 700)
    })
  }

  return <div className="connect-modal">
    <div className="drawer-head">
      <h3 className="drawer-title">Connect {vendor.name}</h3>
      <button ref={closeButton} className="icon-btn" type="button" aria-label="Close connect dialog" onClick={close}><X aria-hidden="true" /></button>
    </div>
    <div className="connect-browser-wrap">
      <div className="vbrowser">
        <div className="vbrowser-chrome">
          <ChevronLeft aria-hidden="true" /><ChevronRight aria-hidden="true" />
          <div className="vbrowser-url"><Lock aria-hidden="true" /><span>{host}.com/auth/login</span></div>
          <Tag>{loadSample ? 'Sample' : 'Demo'}</Tag>
        </div>
        <div className="vbrowser-page">
          <div className="vbrowser-login">
            <VendorTile vendor={vendor} large />
            <h4>Sign in to {vendor.name}</h4>
            <div className="vbrowser-account">
              <div className="vbrowser-account-heading"><span>Demo account</span><Tag>Signed Out</Tag></div>
              <dl>
                <div><dt>Email</dt><dd className="mono">payroll.ops@demo.hypertrack.com</dd></div>
                <div><dt>Password</dt><dd className="mono">••••••••</dd></div>
              </dl>
            </div>
            <ActionButton action={action} pendingLabel="Connecting…" successLabel="Connected" className="primary" onClick={connect}>Sign In</ActionButton>
            <p className="r-note">{loadSample ? 'Simulated connector · loads Sample time entries' : 'Demo connection · use placeholder credentials'}</p>
            <ActionFeedback action={action} />
          </div>
          {phase !== 'login' && <div className="vbrowser-progress">
            <div className="vbrowser-progress-heading">
              <div className="vendor-title"><VendorTile vendor={vendor} large /><h4>{vendor.name}</h4></div>
              {phase === 'done' && <div role="status"><Tag>Connected</Tag></div>}
            </div>
            {phase === 'syncing' ? <SkeletonRegion className="vbrowser-result" rows={2} /> : <>
              <p className="r-note">{cycle.label}</p>
              <p className="vbrowser-result" role="status">Connected · <span className="mono">{sites}</span> {sites === 1 ? 'site' : 'sites'} · {destination
                ? <><span className="mono">{approved.length}</span> approved payments previewed</>
                : <><span className="mono">{entries.toLocaleString()}</span> time entries pulled</>}</p>
              {destination && <p className="r-note">Review and send pay runs from Payroll</p>}
            </>}
          </div>}
        </div>
      </div>
    </div>
  </div>
}
