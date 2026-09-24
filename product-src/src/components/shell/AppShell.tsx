import type { ReactNode } from 'react'
import { AuxProvider } from './Aux'
import { Overlay, OverlayProvider } from './Overlay'
import { TopNav } from './TopNav'
import { AgentPanel } from './AgentPanel'
import { ChatProvider } from '@/components/chat/ChatPane'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OverlayProvider>
      <AuxProvider>
        <ChatProvider>
          <div className="app">
            <TopNav />
            <main className="main">{children}</main>
            <AgentPanel />
            <Overlay />
          </div>
        </ChatProvider>
      </AuxProvider>
    </OverlayProvider>
  )
}
