import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuestionScreen } from './QuestionScreen'
import type { DictationState } from '@/lib/dictate'

const dictation = vi.hoisted(() => ({ active: false, finishing: false, state: 'idle' as DictationState | 'idle', status: '', error: '', start: vi.fn(), stop: vi.fn(), dismiss: vi.fn() }))
vi.mock('@/lib/useDictation', () => ({ useDictation: () => dictation }))
beforeEach(() => {
  Object.assign(dictation, { active: false, finishing: false, state: 'idle', status: '', error: '' })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
})
afterEach(() => vi.unstubAllGlobals())
const render = () => renderToStaticMarkup(createElement(QuestionScreen, {
  question: 'When do you run Payroll?', card: { kind: 'question', input: 'text', topics: ['calendar'] },
  initialAnswer: 'Every week', canBack: false, onBack() {}, onAnswer() {},
}))

it.each([
  ['connecting', 'Connecting…', 'spinner'],
  ['listening', 'Listening…', 'lucide-square'],
  ['finishing', 'Finishing…', 'spinner'],
] as const)('shows a visible %s dictation state and an active control', (state, status, icon) => {
  Object.assign(dictation, { active: true, finishing: state === 'finishing', state, status })
  const html = render()
  expect(html).toContain(`role="status">${status}`)
  expect(html).toContain('aria-pressed="true"')
  expect(html).toContain(icon)
  expect(html).toContain(state === 'finishing' ? 'aria-label="Finishing dictation"' : 'aria-label="Stop dictation"')
  expect(html).toContain('readOnly=""')
})

it('shows an outline Retry alongside a filled Next after partial dictation fails', () => {
  dictation.error = 'Dictation is busy right now. Try again in a moment.'
  const html = render()
  expect(html).toContain('role="alert"')
  expect(html).toContain('class="btn">Retry</button>')
  expect(html).toContain('class="btn primary">Next →</button>')
  expect(html.match(/class="btn primary"/g)).toHaveLength(1)
  expect(html).toContain('Keep typing')
})

it('shows a revisited answer immediately even when motion is enabled, with one next step', () => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
  const html = render()
  expect(html).not.toContain('data-typing="true"')
  expect(html).toContain('When do you run Payroll?')
  expect(html).toContain('setup-caret is-done')
  expect(html.match(/class="btn primary"/g)).toHaveLength(1)
})

it.each([true, false])('keeps a new question single-primary and respects reduced motion %s', (reduced) => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) })
  const html = renderToStaticMarkup(createElement(QuestionScreen, {
    question: 'How do hours arrive?', card: { kind: 'question', input: 'chips', topics: ['workerHours'], chips: ['Email', 'Sheet'] },
    canBack: true, onBack() {}, onAnswer() {},
  }))
  expect(html).not.toContain('btn primary')
  expect(html.includes('data-typing="true"')).toBe(!reduced)
  expect(html.includes('setup-caret is-done')).toBe(reduced)
  expect(html).toContain('aria-label="How do hours arrive?"')
  // The full line reserves its final height; assistive technology gets only the h1 name.
  expect(html).toContain('class="setup-question-measure" aria-hidden="true"')
})
