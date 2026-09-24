import { useState, type JSX } from 'react'
import { X } from 'lucide-react'
import type { Source } from '@/bench/vendors'
import { ConnectModal } from '@/components/ConnectModal'
import { InboxAddress } from '@/components/InboxAddress'
import { VendorTile, vendorKey } from '@/components/SourcesTable'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn } from '@/components/ui'
import { inboxAddress, useOnboarding } from '@/lib/onboarding'
import { useCurrentEmail } from '@/lib/useCurrentEmail'
import { METHODS, type Method } from '@/lib/connectMethods'

/** Pick how the agent reaches a system: browser sign-in, API key, or forwarded email. */
export function ConnectMethod({ vendor }: { vendor: Source }): JSX.Element {
  const [state, update] = useOnboarding()
  const { close, openModal, toast } = useOverlay()
  const email = useCurrentEmail()
  const key = vendorKey(vendor)
  const current = state.connections[key]?.method
  const [picked, setPicked] = useState<Method | null>(null)
  const save = (method: Method) => {
    update({ connections: { ...state.connections, [key]: { status: 'connected', method, lastSync: new Date().toISOString() } } })
    close()
    toast(`${vendor.name} connected`)
  }
  const disconnect = () => {
    const connections = { ...state.connections }
    delete connections[key]
    update({ connections })
    close()
  }

  return <div className="connect-method">
    <div className="drawer-head">
      <div className="vendor-title"><VendorTile vendor={vendor} /><h3 className="drawer-title">{vendor.name}</h3></div>
      <button className="icon-btn" type="button" aria-label="Close" onClick={close}><X aria-hidden="true" /></button>
    </div>
    {picked === 'api' ? <form className="connect-method-body" onSubmit={(event) => { event.preventDefault(); save('api') }}>
      <label className="setup-field"><span className="lbl">Read-only API key</span><input className="q-input" required placeholder="Paste key" /></label>
      <Btn type="submit" className="primary">Connect</Btn>
    </form> : picked === 'email' ? <div className="connect-method-body">
      <p className="r-note">Forward {vendor.name} exports here, or BCC this address</p>
      <InboxAddress address={inboxAddress(email)} />
      <Btn className="primary" onClick={() => save('email')}>Done</Btn>
    </div> : <div className="connect-method-options">
      {METHODS.map(({ id, label, hint, Icon }) => <button key={id} type="button" className={`connect-method-option${current === id ? ' active' : ''}`}
        onClick={() => id === 'browser' ? openModal(<ConnectModal vendor={vendor} onDone={() => undefined} />) : setPicked(id)}>
        <Icon size={18} aria-hidden="true" />
        <span className="connect-method-label">{label}</span>
        <span className="connect-method-hint">{hint}</span>
      </button>)}
      {current && <button type="button" className="lnk" onClick={disconnect}>Disconnect</button>}
    </div>}
  </div>
}
