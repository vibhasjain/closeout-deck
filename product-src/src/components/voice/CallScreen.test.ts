import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { applyAction } from '@/lib/chatActions'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import type { CallSnapshot } from '@/lib/live'
import { CallChecklist } from './CallChecklist'
import { CallScreen } from './CallScreen'
import { CallBar } from './CallBar'
import { CallCaptions } from './CallCaptions'
import { callCaptions } from './callPresentation'

const snapshot: CallSnapshot = { status: 'active', orb: 'listening', stream: null, remoteStream: null, muted: false, seconds: 276, caption: 'When does your pay period end?', transcript: [], level: 0 }
const callbacks = { onMute: vi.fn(), onEnd: vi.fn(), onRetry: vi.fn(), onKeepTyping: vi.fn() }

describe('call coverage and controls', () => {
  it('draws a strike and advances the current bullet only after a cover_topic action', () => {
    let state: Onboarding = structuredClone(DEFAULTS)
    const render = () => renderToStaticMarkup(createElement(CallChecklist, { onboarding: state }))
    expect(render()).toContain('data-topic="calendar" data-covered="false" aria-current="step"')
    expect(render()).not.toContain('<s class="call-topic-label">Your pay calendar</s>')
    const update = (patch: Partial<Onboarding> | ((previous: Onboarding) => Partial<Onboarding>)) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
    }
    applyAction({ type: 'cover_topic', topic: 'calendar' }, update, vi.fn(), new URLSearchParams())
    applyAction({ type: 'cover_topic', topic: 'workerHours' }, update, vi.fn(), new URLSearchParams())
    const html = render()
    expect(html).toContain('<s class="call-topic-label">Your pay calendar</s>')
    expect(html).toContain('<s class="call-topic-label">How workers report time</s>')
    expect(html).toContain('data-topic="clientHours" data-covered="false" aria-current="step"')
    expect(html).toContain('<details class="call-checklist-mobile"><summary><span>2 of 7 covered</span>')
    expect(html).toContain('How you run Payroll')
    expect(html).toContain('Your rules')
  })

  it('renders microphone denial with Retry and the explicit typing exit', () => {
    const error = 'Your browser blocked the mic. Allow it and try again, or keep typing.'
    const html = renderToStaticMarkup(createElement(CallScreen, { ...callbacks, onboarding: DEFAULTS, snapshot: { ...snapshot, status: 'error', error } }))
    expect(html).toContain(error)
    expect(html).toContain('class="call-retry"')
    expect(html).toContain('>Retry the call</button>')
    expect(html).toContain('class="call-keep-typing"')
    expect(html).toContain('>Keep typing</button>')
    expect(html).not.toContain('aria-label="Call controls"')
  })

  it('labels a save failure as Retry saving and keeps the typing exit enabled while ending', () => {
    const html = renderToStaticMarkup(createElement(CallScreen, { ...callbacks, onboarding: DEFAULTS, snapshot: { ...snapshot, status: 'error', errorKind: 'save', error: 'The notes could not be saved.' } }))
    expect(html).toContain('>Retry saving</button>')
    expect(html).not.toContain('>Retry the call</button>')
    for (const Component of [CallScreen, CallBar]) {
      const ending = renderToStaticMarkup(createElement(Component, { ...callbacks, onboarding: DEFAULTS, snapshot: { ...snapshot, status: 'ending' } }))
      expect(ending).toMatch(/<button type="button">Keep typing<\/button>/)
      expect(ending).toContain('disabled="" aria-label="End call"')
    }
  })

  it('shows a quiet retriable turn note without removing active call controls', () => {
    for (const Component of [CallScreen, CallBar]) {
      const html = renderToStaticMarkup(createElement(Component, { ...callbacks, onRetryTurn: vi.fn(), onboarding: DEFAULTS, snapshot: { ...snapshot, note: 'The notes update timed out.' } }))
      expect(html).toContain('class="call-note" role="status"')
      expect(html).toContain('The notes update timed out.')
      expect(html).toContain('>Retry</button>')
      expect(html).toContain('aria-label="End call"')
      expect(html).not.toContain('class="call-error"')
    }
  })

  it('shows the active timer, captions, mute state, and end action', () => {
    const html = renderToStaticMarkup(createElement(CallScreen, { ...callbacks, onboarding: DEFAULTS, snapshot }))
    expect(html).toContain('data-call-status="active"')
    expect(html).toContain('Call duration 4:36')
    expect(html).toContain(snapshot.caption)
    expect(html).toContain('aria-label="Hide live captions" aria-pressed="true"')
    expect(html).toContain('aria-label="Mute microphone" aria-pressed="false"')
    expect(html).toContain('aria-label="End call"')
  })

  it('keeps the desk call compact with an unmute control', () => {
    const html = renderToStaticMarkup(createElement(CallBar, { ...callbacks, snapshot: { ...snapshot, muted: true } }))
    expect(html).toContain('call-orb--compact')
    expect(html).toContain('Call duration 4:36')
    expect(html).toContain('aria-label="Unmute microphone" aria-pressed="true"')
    expect(html).toContain('aria-label="End call"')
  })

  it('keeps the last line from each speaker when live captions change speaker', () => {
    const conversation: CallSnapshot = { ...snapshot, caption: 'Please review the exceptions.', transcript: [
      { role: 'agent', text: 'What do you need on Payroll?', startMs: 0, endMs: 1000 },
      { role: 'user', text: 'Give me an overview.', startMs: 2000, endMs: 3000 },
      { role: 'agent', text: 'There are 2,047 time entries in this pay run.', startMs: 4000, endMs: 6000 },
      { role: 'user', text: 'Please review the exceptions.', startMs: 7000, endMs: 8000 },
    ] }
    expect(callCaptions(conversation)).toEqual({ agent: 'There are 2,047 time entries in this pay run.', user: 'Please review the exceptions.' })
    for (const Component of [CallScreen, CallBar]) {
      const html = renderToStaticMarkup(createElement(Component, { ...callbacks, onboarding: DEFAULTS, snapshot: conversation }))
      expect(html).toContain('class="call-caption-turn call-caption-turn--agent"')
      expect(html).toContain('There are 2,047 time entries in this pay run.')
      expect(html).toContain('class="call-caption-turn call-caption-turn--user"')
      expect(html).toContain('Please review the exceptions.')
      expect(html).not.toContain('Give me an overview.')
    }
  })

  it('opens the desk call with the large orb, caption controls and minimize but no setup checklist', () => {
    const html = renderToStaticMarkup(createElement(CallScreen, { ...callbacks, purpose: 'desk', onMinimize: vi.fn(), snapshot }))
    expect(html).toContain('call-screen--desk')
    expect(html).toContain('aria-label="Minimize call"')
    expect(html).toContain('aria-label="Hide live captions"')
    expect(html).toContain('>Keep typing</button>')
    expect(html).toContain('aria-label="End call"')
    expect(html).not.toContain('call-orb--compact')
    expect(html).not.toContain('call-checklist')
    expect(html).not.toContain("What we’re covering")
  })

  it('hides both speakers with captions off and does not label a user-only line as the agent', () => {
    const userOnly = { ...snapshot, caption: 'Can you hear me?', transcript: [{ role: 'user' as const, text: 'Can you hear me?', startMs: 0, endMs: 1000 }] }
    expect(callCaptions(userOnly)).toEqual({ user: 'Can you hear me?' })
    const html = renderToStaticMarkup(createElement(CallCaptions, { snapshot: userOnly, enabled: false }))
    expect(html).toContain('aria-live="off"')
    expect(html).not.toContain('Can you hear me?')
  })
})
