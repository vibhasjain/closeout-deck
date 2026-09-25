import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AuxProvider } from './Aux'
import { Overlay, OverlayProvider } from './Overlay'
import { TopNav } from './TopNav'
import { AgentPanel } from './AgentPanel'
import { ChatProvider } from '@/components/chat/ChatPane'
import { useOnboarding } from '@/lib/onboarding'
import { useWide } from '@/lib/useWide'

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const setup = pathname.startsWith('/setup')
  const wide = useWide()
  const [{ sidebar }] = useOnboarding()
  return (
    <OverlayProvider>
      <AuxProvider>
        <ChatProvider>
          <div className={`app${setup ? ' app-setup' : ''}`} data-sidebar={sidebar}>
            {!setup && <TopNav wide={wide} />}
            <main className="main">{children}</main>
            <AgentPanel docked={wide} suppressed={setup} />
            <Overlay />
          </div>
        </ChatProvider>
      </AuxProvider>
    </OverlayProvider>
  )
}
