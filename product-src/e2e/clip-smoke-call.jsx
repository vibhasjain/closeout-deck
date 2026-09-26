import React from 'react'
import { createRoot } from 'react-dom/client'
import { CallScreen } from '../src/components/voice/CallScreen'
import { DEFAULTS } from '../src/lib/onboarding'
import '../src/index.css'
import '../src/components/shell/shell.css'
import '../src/pages/setup/agent.css'

// The production presentation receives a session snapshot; no voice transport is mounted.
const snapshot = { status: 'active', orb: 'listening', stream: null, remoteStream: null,
  muted: false, seconds: 276, caption: 'When does your pay period end?', transcript: [], level: 0 }
const noop = () => {}
createRoot(document.getElementById('root')).render(
  <div className="app app-setup"><main className="main"><div className="agent-setup" data-step="conversation" data-on-call="true">
    <div className="setup-stage"><CallScreen snapshot={snapshot} onboarding={DEFAULTS}
      onMute={noop} onEnd={noop} onRetry={noop} onKeepTyping={noop} /></div>
  </div></main></div>,
)
