import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { applyAction } from '@/lib/chatActions'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import type { CallSnapshot } from '@/lib/live'
import { CallChecklist } from './CallChecklist'
import { CallScreen } from './CallScreen'
import { CallBar } from './CallBar'

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
})
