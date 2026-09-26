import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { SkeletonRegion } from '@/components/Skeleton'
import { usePendingAction } from '@/lib/usePendingAction'
import { useState, type JSX } from 'react'
import { X } from 'lucide-react'
import type { Source } from '@/bench/vendors'
import { InboxAddress } from '@/components/InboxAddress'
import { ConnectModal } from '@/components/ConnectModal'
import { VendorTile, vendorKey } from '@/components/SourcesTable'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, Chip, Tag } from '@/components/ui'
import { getOnboarding, inboxAddress, useOnboarding } from '@/lib/onboarding'
import { useCurrentEmail } from '@/lib/useCurrentEmail'
import { METHODS, type Method } from '@/lib/connectMethods'
import { connectSource } from '@/lib/data'

/** Pick how the agent reaches a system: browser sign-in, API key, or forwarded email. */
/** `onConnect`: called as the user starts a connection, so the host card can keep this set while the data refreshes. `setPicker`: false when the host card already chose the set. */
export function ConnectMethod({ vendor, inline = false, cycleId, onConnect, setPicker = true }: { vendor: Source; inline?: boolean; cycleId?: string; onConnect?(): void; setPicker?: boolean }): JSX.Element {
  const [state, update] = useOnboarding()
  const { close, toast, openModal } = useOverlay()
  const email = useCurrentEmail()
  const key = vendorKey(vendor)
  const current = state.connections[key]?.method
  const [picked, setPicked] = useState<Method | null>(null)
  const [set, setSet] = useState<1 | 2>(vendor.set === 1 ? 1 : 2)
  const action = usePendingAction()
  const busy = action.pending
  const [done, setDone] = useState(false)
  const save = async (method: Method) => {
    if (busy) return
    onConnect?.()
    if (inline && method === 'browser') {
      setPicked(method)
      openModal(<ConnectModal vendor={{ ...vendor, set: vendor.set === 3 || vendor.builtin ? 3 : set }} cycleId={cycleId} loadSample onDone={() => setDone(true)} />)
      return
    }
    setPicked(method)
    await action.run(async () => {
      await connectSource({ set: vendor.set === 3 || vendor.builtin ? 3 : set, system: vendor.name, site: vendor.sites[0] })
      update({ connections: { ...getOnboarding().connections, [key]: { status: 'connected', method, sample: true, lastSync: new Date().toISOString() } } })
      setDone(true)
      toast(`${vendor.name} connected · Sample`)
    }, method)
  }
  const disconnect = () => {
    const connections = { ...state.connections }
    delete connections[key]
    update({ connections })
    close()
  }

  return <div className="connect-method">
    {!inline && <div className="drawer-head">
      <div className="vendor-title"><VendorTile vendor={vendor} /><h3 className="drawer-title">{vendor.name}</h3></div>
      <button className="icon-btn" type="button" aria-label="Close" onClick={close}><X aria-hidden="true" /></button>
    </div>}
    {done && action.status !== 'success' ? <div className="connect-method-body">
      <p>Connected {!inline && <Tag>Sample</Tag>}</p>
      <p className="r-note">{vendor.name} time entries are ready in Payroll. This is a simulated connection.</p>
      {picked === 'email' && <InboxAddress address={inboxAddress(email)} />}
      {!inline && <Btn className="primary" onClick={close}>Done</Btn>}
    </div> : <div className="connect-method-options">
      <p>How do you want to connect?</p>
      <p className="r-note">Simulated connector · loads Sample time entries</p>
      {setPicker && !vendor.builtin && vendor.set !== 3 && <div className="chips" role="group" aria-label="Time entry source">
        <Chip disabled={busy || done} active={set === 1} aria-pressed={set === 1} onClick={() => setSet(1)}>Worker-reported</Chip>
        <Chip disabled={busy || done} active={set === 2} aria-pressed={set === 2} onClick={() => setSet(2)}>Client-approved</Chip>
      </div>}
      {METHODS.map(({ id, label, hint, Icon }) => <ActionButton key={id} action={action} actionKey={id} pendingLabel="Connecting…" successLabel="Connected" disabled={busy || done} className={`connect-method-option${current === id ? ' active' : ''}`}
        onClick={() => void save(id)}>
        <Icon size={18} aria-hidden="true" />
        <span className="connect-method-label">{label}</span>
        <span className="connect-method-hint">{hint}</span>
      </ActionButton>)}
      {busy && <SkeletonRegion rows={2} />}
      {done && <><p className="r-note">{vendor.name} time entries are ready in Payroll.</p>{picked === 'email' && <InboxAddress address={inboxAddress(email)} />}{!inline && <Btn onClick={close}>Done</Btn>}</>}
      <ActionFeedback action={action} />
      {current && <button type="button" className="lnk" onClick={disconnect}>Disconnect</button>}
    </div>}
  </div>
}
