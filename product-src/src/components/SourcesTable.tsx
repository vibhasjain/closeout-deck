import { ActionButton } from '@/components/ActionButton'
import { usePendingAction } from '@/lib/usePendingAction'
/* eslint-disable react-refresh/only-export-components -- Vendor metadata helpers are shared by the table, detail and modal. */
import { Fragment, useEffect, useRef, type JSX } from 'react'
import { Camera, Clock3, MapPin, QrCode, Upload } from 'lucide-react'
import { DESTS, SOURCES, type Destination, type Source } from '@/bench/vendors'
import type { Shift } from '@/bench/engine.js'
import { useDesk, type DeskCycle } from '@/lib/desk'
import { useOnboarding, type Onboarding } from '@/lib/onboarding'
import { Btn, Tag, Tile } from '@/components/ui'
import { useOverlay } from '@/components/shell/Overlay'

export type Vendor = Source | Destination

export const vendorKey = (vendor: Vendor) => `${'pulls' in vendor ? 'source' : 'dest'}:${vendor.id}`

/** The prefix keeps payroll destinations distinct from identically named sources. */
export function connectedVendor(vendor: Vendor, connections: Onboarding['connections']): Vendor {
  const connection = connections[vendorKey(vendor)] ?? connections[vendor.id]
  if (!connection) return vendor
  return {
    ...vendor,
    status: connection.status,
    method: connection.method === 'browser' ? 'Browser sign-in' : connection.method === 'api' ? 'API' : vendor.method,
    lastSync: connection.lastSync ?? vendor.lastSync,
    sites: vendor.sites,
  }
}

export function vendorRows(vendor: Vendor, cycle: DeskCycle): Shift[] {
  if (vendor.status === 'available') return []
  if (!('pulls' in vendor) || vendor.builtin) return cycle.week
  return cycle.week.filter((shift) => vendor.sites.includes(shift.fac.name))
}

export function VendorTile({ vendor, large = false }: { vendor: Vendor; large?: boolean }): JSX.Element {
  // The HyperTrack mark belongs only in the shell header; location evidence uses a map pin.
  const mark = 'mark' in vendor && !vendor.builtin ? vendor.mark : undefined
  const icon = 'icon' in vendor ? vendor.icon : undefined
  const Icon = icon === 'camera' ? Camera : icon === 'clock' ? Clock3 : icon === 'qr' ? QrCode : icon === 'upload' ? Upload : MapPin
  return <Tile className={large ? 'lg' : undefined}>
    {vendor.tile || mark ? <img src={vendor.tile ?? mark} alt="" className={mark ? 'mark' : undefined} /> : <Icon aria-hidden="true" />}
  </Tile>
}

export function vendorMethod(method: string): string {
  return method === 'Export · nightly' ? 'Nightly Export' : method === 'Email · xlsx' ? 'Email XLSX' : method
}

export function SourcesTable({ group, selected, onSelect, onConnect, vendors: suppliedVendors, sectionLabels = false, actionFor }: {
  group: 'sources' | 'dests'
  selected?: string
  onSelect(key: string): void
  onConnect(key: string): void
  /** Optional page-level filtering or metadata, leaving onboarding's list unchanged. */
  vendors?: Vendor[]
  sectionLabels?: boolean
  actionFor?(vendor: Vendor): { label: string; disabled?: boolean; onClick(): void } | undefined
}): JSX.Element {
  const [state, update] = useOnboarding()
  const { current } = useDesk()
  const { toast } = useOverlay()
  const syncAction = usePendingAction()
  useEffect(() => {
    if (syncAction.status !== 'success') return
    const timer = setTimeout(syncAction.reset, 900)
    return () => clearTimeout(timer)
  }, [syncAction])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const latest = useRef(state)
  useEffect(() => { latest.current = state }, [state])
  useEffect(() => {
    const pending = timers.current
    return () => { for (const timer of pending.values()) clearTimeout(timer) }
  }, [])
  const vendors = (suppliedVendors ?? (group === 'sources' ? SOURCES : DESTS)).map((vendor) => connectedVendor(vendor, state.connections))
  const groups = [...new Set(vendors.map((vendor) => vendor.group))]

  function sync(vendor: Vendor) {
    const key = vendorKey(vendor)
    if (timers.current.has(key)) return
    void syncAction.run(() => new Promise<void>(resolve => {
    timers.current.set(key, setTimeout(() => {
      timers.current.delete(key)
      const connections = latest.current.connections
      const next = { ...connections, [key]: { ...connections[key], status: 'connected' as const, lastSync: new Date().toISOString() } }
      latest.current = { ...latest.current, connections: next }
      update({ connections: next })
      resolve()
      toast(`${vendor.name} synced · ${vendorRows(vendor, current).length} records`)
    }, 1200))
    }), key)
  }

  return <div className="sources-table-wrap scroll">
    <table className="sheet sources-sheet" aria-label={group === 'sources' ? 'Time sources' : 'Payroll destinations'}>
      <thead><tr>
        <th scope="col" aria-label="Logo" /><th scope="col">Name</th><th scope="col">Method</th><th scope="col" className="num">Sites</th><th scope="col" className="num">Last Sync</th>
        <th scope="col" className="num">Records</th><th scope="col">Status</th><th scope="col" aria-label="Action" />
      </tr></thead>
      <tbody>{groups.map((name) => <Fragment key={name}>
        <tr className={sectionLabels ? 'sect' : 'grp'}><th scope="rowgroup" colSpan={8}>{sectionLabels ? <span className="lbl">{name}</span> : name}</th></tr>
        {vendors.filter((vendor) => vendor.group === name).map((vendor) => {
          const key = vendorKey(vendor)
          const active = selected === key || selected === vendor.id
          const busy = syncAction.pending && syncAction.key === key
          const action = actionFor?.(vendor)
          const lastSync = vendor.lastSync?.includes('T') ? new Date(vendor.lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : vendor.lastSync
          return <tr key={key} data-source={key} className={active ? 'sel' : undefined} tabIndex={0} aria-selected={active}
            onClick={() => onSelect(key)} onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(key) }
            }}>
            <td><VendorTile vendor={vendor} /></td>
            <td><span className="source-name" title={vendor.name}>{vendor.name}</span></td>
            <td className="source-method">{vendorMethod(vendor.method)}</td>
            <td className="mono num">{vendor.sites.length}</td>
            <td className="mono num" title={vendor.lastSync?.includes('T') ? new Date(vendor.lastSync).toLocaleString('en-US', { hour12: true }) : lastSync ?? undefined}>{lastSync}</td>
            <td className="mono num">{vendorRows(vendor, current).length}</td>
            <td><Tag tone={busy ? 'blue' : undefined}>{busy ? 'Syncing' : vendor.status === 'connected' ? 'Connected' : 'Available'}</Tag></td>
            <td>{vendor.status === 'connected' && !action ? <ActionButton action={syncAction} actionKey={key} pendingLabel="Syncing…" successLabel="Synced" onClick={event => { event.stopPropagation(); onSelect(key); sync(vendor) }}>Sync Now</ActionButton> : <Btn disabled={busy || action?.disabled} onClick={(event) => {
              event.stopPropagation()
              onSelect(key)
              if (action) action.onClick()
              else if (vendor.status === 'connected') sync(vendor)
              else onConnect(key)
            }}>{action?.label ?? (vendor.status === 'connected' ? 'Sync Now' : 'Connect')}</Btn>}</td>
          </tr>
        })}
      </Fragment>)}{vendors.length === 0 && <tr><td colSpan={8}><span className="r-note">No systems match this search</span></td></tr>}</tbody>
    </table>
  </div>
}
