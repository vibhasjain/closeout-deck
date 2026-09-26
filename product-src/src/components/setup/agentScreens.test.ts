import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Agent, WritingProfile } from '@/pages/setup/Agent'
import { QuestionScreen } from './QuestionScreen'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import type { QuestionCard } from '@/lib/chat'
import type { CallSnapshot } from '@/lib/live'

const state = vi.hoisted(() => ({ value: {} as Onboarding }))
const voice = vi.hoisted(() => ({ snapshot: null as CallSnapshot | null, start: vi.fn(), end: vi.fn(), dismiss: vi.fn(), retrySave: vi.fn(), retryTurn: vi.fn(), mute: vi.fn() }))
vi.mock('@/lib/useVoiceCall', () => ({ useVoiceCall: () => voice }))
vi.mock('@/lib/onboarding', async (original) => ({ ...await original<typeof import('@/lib/onboarding')>(), useOnboarding: () => [state.value, vi.fn()] }))
vi.mock('@/lib/viewerSession', () => ({ viewerSession: () => ({ name: 'Morgan Lee' }) }))
const primaryCount = (html: string) => (html.match(/<button\b[^>]*class="[^"]*\bprimary\b[^"]*"/g) ?? []).length
beforeEach(() => { state.value = structuredClone(DEFAULTS); voice.snapshot = null; vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }) })

describe('one black next step per setup pane', () => {
  it.each(['welcome', 'basics', 'trust', 'intro', 'conversation', 'writing', 'ready', 'never-contact'] as const)('%s respects the single primary contract', (step) => {
    state.value.setupStep = step
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))
    expect(primaryCount(html)).toBeLessThanOrEqual(1)
    if (step === 'basics' || step === 'conversation' || step === 'writing') expect(primaryCount(html)).toBe(0)
    if (step === 'intro') expect(html).toContain('Jump on a call with your Closeout Agent')
  })
  it('keeps the ready screen visible and inert under the never-contact dialog', () => {
    state.value.setupStep = 'never-contact'
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))
    expect(html).toContain('class="setup-stage" inert="" aria-hidden="true"')
    expect(html).toContain('Your Payroll profile is ready')
    expect(html).not.toContain('class="setup-stage" hidden')
  })
  it('shows the agent closing line during writing and on ready, with uncovered rows marked Not Yet', () => {
    state.value.setupClosing = 'I will ask before every fix and spend nothing on my own.'
    const writing = renderToStaticMarkup(createElement(WritingProfile, { state: state.value, onDone() {} }))
    expect(writing).toContain(state.value.setupClosing)
    expect(writing.match(/>Not Yet</g)).toHaveLength(9)
    expect(writing).not.toContain('class="done"')
    state.value.setupStep = 'ready'
    expect(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))).toContain(state.value.setupClosing)
  })
  it('uses the same single Next action when reviewing a previous question', () => {
    const html = renderToStaticMarkup(createElement(QuestionScreen, { question: 'How do hours arrive?', card: { kind: 'question', input: 'text', topics: ['workerHours'] }, initialAnswer: 'Email', canBack: true, onBack() {}, onAnswer() {} }))
    expect(html).not.toContain('Forward →')
    expect(html.match(/>Next →</g)).toHaveLength(1)
    expect(primaryCount(html)).toBe(1)
  })
  it.each(['welcome', 'conversation', 'ready'] as const)('%s keeps a quiet account corner with Log out, outside the one black next step', (step) => {
    state.value.setupStep = step
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))
    const corner = html.slice(html.indexOf('<div class="setup-account">'), html.indexOf('<div class="setup-stage"'))
    expect(corner).toMatch(/<button type="button" class="setup-account-trigger" popoverTarget="([^"]+)" aria-label="Account menu"[^>]*>.*<div id="\1" popover="auto"/)
    expect(corner).toContain('Log out')
    expect(corner).not.toContain('primary')
    // This session has no HyperTrack email, so no Start over.
    expect(corner).not.toContain('Start over')
  })
  it('keeps the account corner inert with the stage under the never-contact dialog', () => {
    state.value.setupStep = 'never-contact'
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))
    expect(html).toContain('<div class="setup-account" inert="" aria-hidden="true">')
    state.value.setupStep = 'ready'
    expect(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))).toContain('<div class="setup-account">')
  })
  it('gives the corner menu rows a 44px tap target that does not lean on the setup page', () => {
    const css = readFileSync(new URL('./onboarding-account.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.setup-account \.setup-account-item \{[^}]*min-height: 44px/)
    expect(css).not.toContain('.agent-setup')
  })
  it('personalizes the welcome from the viewer session', () => {
    expect(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))).toContain('Welcome, Morgan')
  })
  it('keeps document previews secondary and Finish primary when the completed profile is ready', () => {
    state.value.setupStep = 'ready'
    state.value.setupClosing = 'Your Payroll profile is ready to use.'
    state.value.firm = { name: 'Summit Staffing', domain: 'sample', summary: '', states: ['CA'], verticals: [], clientTypes: [], size: '', staffing: true }
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))
    expect(html).toContain('aria-label="Open your Rulebook"')
    expect(html).toContain('aria-label="Open your Payroll profile"')
    expect(html).toContain('profile-card-compact')
    expect(primaryCount(html)).toBe(1)
    expect(html).toMatch(/class="btn primary setup-bottom"[^>]*>Finish →/)
  })
  it('keeps the populated never-contact dialog as the only primary while ready is inert', () => {
    state.value.setupStep = 'never-contact'
    state.value.neverContact = ['Alex at Pacific']
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))
    expect(html).toContain('Anyone I should never contact?')
    expect(html).toContain('Remove Alex at Pacific')
    expect(primaryCount(html)).toBe(1)
    expect(html).toContain('class="btn action-button primary"')
    expect(html).toContain('>Save and continue</span>')
  })
  it('never shows a previous call summary for an unconnected call, and shows only this call once it is carded', () => {
    state.value.setupStep = 'intro'
    state.value.chat = [{ id: 'call-old', role: 'agent', text: 'Previous call summary', at: 1, cards: [{ kind: 'call', callId: 'old', seconds: 24 }] }]
    voice.snapshot = { status: 'ended', callId: 'new', orb: 'listening', stream: null, remoteStream: null, muted: false, seconds: 0, caption: '', transcript: [], level: 0 }
    const render = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))
    expect(render()).not.toContain('Your call is saved')
    expect(render()).not.toContain('Previous call summary')
    expect(render()).toContain('Build your Payroll profile')
    state.value.chat.push({ id: 'call-new', role: 'agent', text: 'This call summary', at: 2, cards: [{ kind: 'call', callId: 'new', seconds: 12 }] })
    expect(render()).toContain('Your call is saved')
    expect(render()).toContain('This call summary')
    expect(render()).not.toContain('Previous call summary')
    state.value.chat[1].callServerSaved = false
    expect(render()).toContain('Call ended')
    expect(render()).not.toContain('Your call is saved')
  })
  it('keeps failed call cards and Retry saving visible beside typing after dismissal, without showing previous calls or duplicating the summary', () => {
    state.value.setupStep = 'conversation'
    state.value.setupHistory = [{ question: 'How do worker hours arrive?', card: { kind: 'question', input: 'text', topics: ['workerHours'] } }]
    state.value.chat = [
      { id: 'call-old', role: 'agent', text: 'Previous saved call', at: 1, cards: [{ kind: 'call', callId: 'old', seconds: 24 }] },
      { id: 'call-pending', role: 'agent', text: '', at: 2, cards: [{ kind: 'call', callId: 'pending', seconds: 12 }], callSaveError: 'The notes could not be saved. Please try again.', callServerSaved: false },
    ]
    const render = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))
    const html = render()
    expect(html).toContain('aria-label="Call notes awaiting saving"')
    expect(html).toContain('data-call-id="pending"')
    expect(html).toContain('The notes could not be saved. Please try again.')
    expect(html).toContain('Retry saving')
    expect(html).toContain('How do worker hours arrive?')
    expect(html).not.toContain('Previous saved call')
    expect(html).not.toContain('Your call is saved')
    voice.snapshot = { status: 'ended', callId: 'pending', orb: 'listening', stream: null, remoteStream: null, muted: false, seconds: 12, caption: '', transcript: [], level: 0 }
    expect(render().match(/data-call-id="pending"/g)).toHaveLength(1)
    expect(render()).not.toContain('Your call is saved')
    voice.snapshot.status = 'active'
    expect(render()).not.toContain('data-call-id="pending"')
  })
  it('restores previous chips as selections so a replacement does not retain stale free text', () => {
    const html = renderToStaticMarkup(createElement(QuestionScreen, { question: 'Where should I pick those up?', card: { kind: 'question', input: 'chips', topics: ['workerHours'], chips: ['Email', 'Shared sheet'] }, initialAnswer: 'Email', canBack: true, onBack: () => {}, onAnswer: () => {} }))
    expect(html).toContain('aria-pressed="true"')
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/)
  })
  it.each(['text', 'chips', 'multi', 'calendar', 'files', 'choice'] as const)('%s has no primary before an answer and exactly one afterward', (input) => {
    const card: QuestionCard = { kind: 'question', input, topics: ['workerHours'], ...(input === 'chips' || input === 'multi' ? { chips: ['Email', 'Sheet'] } : {}), ...(input === 'choice' ? { choice: { yours: 'Your files / connection', sample: 'Use sample' } } : {}) }
    const render = (initialAnswer?: string, busy = false) => renderToStaticMarkup(createElement(QuestionScreen, { question: 'Where should I pick those up?', card, initialAnswer, busy, canBack: true, onBack: () => {}, onAnswer: () => {} }))
    expect(primaryCount(render())).toBe(input === 'calendar' ? 1 : 0)
    expect(primaryCount(render('Forward them to you'))).toBe(1)
    expect(primaryCount(render('Forward them to you', true))).toBe(0)
    expect(render()).toContain('<textarea')
    expect(render()).toContain('Dictate your answer')
  })
})
