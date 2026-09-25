import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '@/pages/setup/Agent'
import { QuestionScreen } from './QuestionScreen'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
import type { QuestionCard } from '@/lib/chat'

const state = vi.hoisted(() => ({ value: {} as Onboarding }))
vi.mock('@/lib/onboarding', async (original) => ({ ...await original<typeof import('@/lib/onboarding')>(), useOnboarding: () => [state.value, vi.fn()] }))
vi.mock('@/lib/viewerSession', () => ({ viewerSession: () => ({ name: 'Morgan Lee' }) }))
const primaryCount = (html: string) => (html.match(/class="btn primary(?:\s[^"]*)?"/g) ?? []).length
beforeEach(() => { state.value = structuredClone(DEFAULTS); vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }) })

describe('one black next step per setup pane', () => {
  it.each(['welcome', 'basics', 'trust', 'intro', 'conversation', 'writing', 'ready', 'never-contact'] as const)('%s respects the single primary contract', (step) => {
    state.value.setupStep = step
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))
    expect(primaryCount(html)).toBeLessThanOrEqual(1)
    if (step === 'basics' || step === 'conversation' || step === 'writing') expect(primaryCount(html)).toBe(0)
    expect(html).not.toContain('Jump on a call')
  })
  it('personalizes the welcome from the viewer session', () => {
    expect(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Agent)))).toContain('Hey Morgan!')
  })
  it('restores previous chips as selections so a replacement does not retain stale free text', () => {
    const html = renderToStaticMarkup(createElement(QuestionScreen, { question: 'Where should I pick those up?', card: { kind: 'question', input: 'chips', topics: ['workerHours'], chips: ['Email', 'Shared sheet'] }, initialAnswer: 'Email', canBack: true, onBack: () => {}, onAnswer: () => {} }))
    expect(html).toContain('aria-pressed="true"')
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/)
  })
  it.each(['text', 'chips', 'multi', 'calendar', 'files', 'choice'] as const)('%s has no primary before an answer and exactly one afterward', (input) => {
    const card: QuestionCard = { kind: 'question', input, topics: ['workerHours'], ...(input === 'chips' || input === 'multi' ? { chips: ['Email', 'Sheet'] } : {}), ...(input === 'choice' ? { choice: { yours: 'Your files / connection', sample: 'Use sample' } } : {}) }
    const render = (initialAnswer?: string, busy = false) => renderToStaticMarkup(createElement(QuestionScreen, { question: 'Where should I pick those up?', card, initialAnswer, busy, canBack: true, onBack: () => {}, onAnswer: () => {} }))
    expect(primaryCount(render())).toBe(0)
    expect(primaryCount(render('Forward them to you'))).toBe(1)
    expect(primaryCount(render('Forward them to you', true))).toBe(0)
    expect(render()).toContain('<textarea')
    expect(render()).not.toContain('Dictate your answer')
  })
})
