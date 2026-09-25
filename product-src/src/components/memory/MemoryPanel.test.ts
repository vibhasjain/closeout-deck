import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryPanelContent } from './MemoryPanel'
import { learnedAgo, memoryRuleLabel, memoryText } from './memoryDisplay'
import { makeSuggestedRule } from './memoryActions'
import { applyAction } from '@/components/chat/ChatPane'
import { keepProposal, type Instinct, type MemorySnapshot } from '@/lib/memory'

vi.mock('@/components/chat/ChatPane', () => ({ applyAction: vi.fn() }))
vi.mock('@/lib/memory', async original => ({ ...await original<typeof import('@/lib/memory')>(), keepProposal: vi.fn() }))

const instinct = (patch: Partial<Instinct> = {}): Instinct => ({
  id: 'i_0123456789abcdef', kind: 'context', text: 'Travis Reed signs off Lonestar time entries',
  source: 'chat', status: 'pending', until: null, ruleId: null, at: '2026-09-25T16:00:00.000Z', ...patch,
})
const render = (snapshot: MemorySnapshot) => renderToStaticMarkup(h(MemoryPanelContent, {
  snapshot, loading: false, error: null, refresh: async () => {}, onMakeRule: async () => {},
}))
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers() })

describe('What the Closeout Agent knows', () => {
  it('groups live rows in Context, Autonomy, Style order with editable text, source tags, dates and pending Keep', () => {
    const html = render({ instincts: [
      instinct({ id: 'style', kind: 'style', text: 'Keep replies short', status: 'active', source: 'user' }),
      instinct({ id: 'autonomy', kind: 'autonomy', text: 'Ask before approving', status: 'active', source: 'send' }),
      instinct(), instinct({ id: 'gone', text: 'Forgotten text', status: 'forgotten' }),
    ], proposals: [], lastRun: null })
    const groups = [...html.matchAll(/<section class="memory-group"[^>]*aria-label="([^"]+)"/g)].map(match => match[1])
    expect(groups).toEqual(['Context', 'Autonomy', 'Style'])
    expect(html).toContain('>Travis Reed signs off Lonestar time entries</textarea>')
    expect(html).toContain('placeholder="What should the Closeout Agent know?"')
    expect(html).not.toContain('<label')
    expect(html).toContain('>Chat</span>')
    expect(html).toContain('>Payroll</span>')
    expect(html).toContain('>You</span>')
    expect(html).toContain('dateTime="2026-09-25T16:00:00.000Z">Sep 25</time>')
    expect(html.match(/>Keep<\/button>/g)).toHaveLength(1)
    expect(html).toContain('title="Forget this memory"')
    expect(html).not.toContain('Forgotten text')
  })

  it('uses Title Case for every source, including send as Payroll', () => {
    const sources: Instinct['source'][] = ['site', 'call', 'chat', 'decisions', 'send', 'user']
    const html = render({ instincts: sources.map(source => instinct({ id: source, source })), proposals: [], lastRun: null })
    for (const label of ['Site', 'Call', 'Chat', 'Decisions', 'Payroll', 'You']) expect(html).toContain(`>${label}</span>`)
    expect(html).not.toContain('>Send</span>')
  })

  it('shows engine labels in suggestions, reasons and editable memory without exposing rule ids', () => {
    const html = render({ instincts: [instinct({ kind: 'autonomy', source: 'decisions', ruleId: 'CA-MB-01', text: 'Usually dismisses CA-MB-01 findings' })],
      proposals: [{ ruleId: 'CA-MB-01', count: 4, cycles: 2, topReason: 'CA-MB-01 already paid' }], lastRun: null })
    expect(html).toContain('You dismissed Meal Break 4 times across 2 pay runs · most often: Meal Break already paid')
    expect(html).toContain('>Usually dismisses Meal Break findings</textarea>')
    expect(html).not.toContain('CA-MB-01')
    expect(html).toContain('>Make it a rule</button>')
    expect(memoryRuleLabel('missing-rule')).toBeNull()
    expect(memoryText('CA-MB-01, CS-01; TS-COMPLETE')).toBe('Meal Break, Duplicate; Missing Clock-Out')
  })

  it('explains persistent learning when empty and shows the last finished run even if nothing new was learned', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-25T16:05:00Z'))
    const html = render({ instincts: [], proposals: [], lastRun: { trigger: 'send', finishedAt: '2026-09-25T16:00:00Z', applied: 0, dropped: 2 } })
    expect(html).toContain('learns from the call, from your corrections and at each Send to Payroll')
    expect(html).toContain('Forget stays forgotten')
    expect(html).toContain('Last learned <time dateTime="2026-09-25T16:00:00Z">5m ago</time> · 0 new')
    expect(learnedAgo('2026-09-25T16:05:00Z')).toBe('just now')
    expect(learnedAgo('2026-09-25T14:00:00Z')).toBe('2h ago')
    expect(learnedAgo('2026-09-23T16:00:00Z')).toBe('2d ago')
  })

  it('renders only outline buttons in memory, including Add, pending Keep, Forget and suggestions', () => {
    const html = render({ instincts: [instinct()], proposals: [{ ruleId: 'CA-MB-01', count: 3, cycles: 2, topReason: 'Already paid' }], lastRun: null })
    const buttons = html.match(/<button\b[^>]*>/g)!
    expect(buttons).toHaveLength(5)
    expect(buttons.every(button => /class="btn memory-button(?: memory-icon)?"/.test(button))).toBe(true)
    expect(html).not.toMatch(/bg-primary|btn primary|bg-black|data-variant="default"/)
  })
})

describe('Make it a rule', () => {
  it('waits for proposal keep before using the existing add_rule action with a human-readable sentence', async () => {
    let finish!: (row: Instinct) => void
    vi.mocked(keepProposal).mockReturnValue(new Promise(resolve => { finish = resolve }))
    const update = vi.fn(), navigate = vi.fn(), params = new URLSearchParams()
    const pending = makeSuggestedRule('CA-MB-01', update, navigate, params)
    expect(keepProposal).toHaveBeenCalledWith('CA-MB-01')
    expect(applyAction).not.toHaveBeenCalled()
    finish(instinct({ status: 'active', text: 'Usually dismisses CA-MB-01 findings; most often: Already paid' }))
    await pending
    expect(applyAction).toHaveBeenCalledWith({ type: 'add_rule', sentence: 'Usually dismisses Meal Break findings; most often: Already paid' }, update, navigate, params)
  })

  it('does not add a rule when the proposal was forgotten in another tab', async () => {
    vi.mocked(keepProposal).mockResolvedValue(instinct({ status: 'forgotten' }))
    await expect(makeSuggestedRule('CA-MB-01', vi.fn(), vi.fn(), new URLSearchParams())).rejects.toThrow('You asked me to forget this')
    expect(applyAction).not.toHaveBeenCalled()
  })
})
