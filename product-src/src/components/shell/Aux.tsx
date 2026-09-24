import { createContext, useContext, useId, useLayoutEffect, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Btn } from '@/components/ui'
import { useOverlay } from './Overlay'

export interface AuxTab {
  key: string
  head: string
  node: ReactNode
  disabled?: boolean
}

interface AuxSlots {
  top: ReactNode | null
  bottom: ReactNode | AuxTab[]
  heads: { top?: string; bottom?: string }
}

const empty: AuxSlots = { top: null, bottom: null, heads: { bottom: '' } }
const SlotsContext = createContext<AuxSlots>(empty)
const RegisterContext = createContext<Dispatch<SetStateAction<AuxSlots>> | null>(null)

export function AuxProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState(empty)
  return (
    <RegisterContext.Provider value={setSlots}>
      <SlotsContext.Provider value={slots}>{children}</SlotsContext.Provider>
    </RegisterContext.Provider>
  )
}

// Pages register slots beside their render; only the rail subscribes to their contents.
// eslint-disable-next-line react-refresh/only-export-components
export function useAux(top: ReactNode | null, bottom: AuxSlots['bottom'] = null, heads: AuxSlots['heads'] = {}): void {
  const register = useContext(RegisterContext)
  if (!register) throw new Error('useAux requires AppShell')
  const { top: topHead, bottom: bottomHead } = heads
  useLayoutEffect(() => {
    register({ top, bottom, heads: { top: topHead, bottom: bottomHead } })
    return () => register(empty)
  }, [register, top, bottom, topHead, bottomHead])
}

function isTabbed(bottom: AuxSlots['bottom']): bottom is AuxTab[] {
  return Array.isArray(bottom) && bottom.length > 0 && bottom.every((tab) => tab != null
    && typeof tab === 'object' && 'key' in tab && 'head' in tab && 'node' in tab)
}

function AuxContents() {
  const { top, bottom, heads } = useContext(SlotsContext)
  const [params, setParams] = useSearchParams()
  const id = useId()
  const tabs = isTabbed(bottom) ? bottom : undefined
  const active = tabs?.find((tab) => tab.key === params.get('rail') && !tab.disabled)
    ?? tabs?.find((tab) => !tab.disabled)
  const threadUnavailable = tabs?.some((tab) => tab.key === 'thread' && tab.disabled)

  function selectTab(key: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (key === tabs?.[0].key) next.delete('rail')
      else next.set('rail', key)
      return next
    })
  }

  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next].focus()
    buttons[next].click()
  }

  return (
    <>
      {tabs && <div className="aux-head aux-tabs" role="tablist" aria-label="Time entry context" onKeyDown={navigateTabs}>
        {tabs.map((tab) => <button key={tab.key} type="button" role="tab" className="aux-tab"
          id={`${id}-${tab.key}`} aria-controls={`${id}-panel`} aria-selected={active?.key === tab.key}
          aria-describedby={tab.key === 'thread' && tab.disabled ? `${id}-hint` : undefined}
          tabIndex={active?.key === tab.key ? 0 : -1} disabled={tab.disabled} onClick={() => selectTab(tab.key)}>{tab.head}</button>)}
      </div>}
      {/* One scroll region. The selection detail and the resting context read as a single
          column, rather than two panes that scroll independently of each other. */}
      <div className="aux-body scroll" {...(tabs ? { role: 'tabpanel', id: `${id}-panel`, 'aria-labelledby': active ? `${id}-${active.key}` : undefined, tabIndex: 0 } : {})}>
        {top != null && <section className="aux-section">
          {heads.top && <div className="lbl">{heads.top}</div>}
          {top}
        </section>}
        {tabs
          ? <>{threadUnavailable && <p className="aux-tab-hint" id={`${id}-hint`}>Pick a row to see its conversation</p>}{active?.node}</>
          : bottom != null && <section className="aux-section">
              {heads.bottom && <div className="lbl">{heads.bottom}</div>}
              {bottom as ReactNode}
            </section>}
      </div>
    </>
  )
}

export function AuxRail() {
  const { openDrawer } = useOverlay()
  const { top, bottom } = useContext(SlotsContext)
  if (top == null && bottom == null) return null
  return <>
    <aside className="aux"><AuxContents /></aside>
    <Btn data-aux-toggle onClick={() => openDrawer(<div className="flex h-full min-h-0 flex-col"><AuxContents /></div>, 'Context')}>Context</Btn>
  </>
}
