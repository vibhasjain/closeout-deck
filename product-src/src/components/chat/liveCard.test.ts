import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/lib/onboarding'
import { newestActionableCard } from './ChatPane'
import { Message } from './Message'

// The cards render their own buttons; here only the live flag the pane hands them matters.
vi.mock('@/components/journey/FormCard', () => ({ FormCard: ({ form, live }: { form: string; live: boolean }) => createElement('div', { 'data-card': form, 'data-live': String(live) }) }))
vi.mock('@/components/journey/FindingsCard', () => ({ FindingsCard: ({ live }: { live: boolean }) => createElement('div', { 'data-card': 'findings', 'data-live': String(live) }) }))
vi.mock('@/components/journey/TaskCard', () => ({ TaskCard: () => createElement('div', { 'data-card': 'task' }) }))

const agent = (id: string, cards: ChatMessage['cards']): ChatMessage => ({ id, role: 'agent', text: id, at: 0, cards })
function pane(messages: ChatMessage[]) {
  const live = newestActionableCard(messages)
  return messages.map(message => renderToStaticMarkup(createElement(Message, { message, liveCard: message.id === live?.id ? live.index : -1 })))
}

describe('agent pane black buttons (H3)', () => {
  it('keeps only the newest actionable card live; older forms are superseded', () => {
    const [older, newer] = pane([
      agent('chase', [{ kind: 'form', form: 'gaps', cycleId: '2026-09-20' }]),
      agent('send', [{ kind: 'form', form: 'send', cycleId: '2026-09-20' }]),
    ])
    expect(older).toContain('data-live="false"')
    expect(newer).toContain('data-live="true"')
  })

  it('within one message only the last actionable card is live, and a later status-only card supersedes nothing', () => {
    const [closeout, status] = pane([
      agent('closeout', [{ kind: 'task', cycleId: '2026-09-20' }, { kind: 'findings', cycleId: '2026-09-20' }, { kind: 'form', form: 'connect', cycleId: '2026-09-20' }]),
      agent('status', [{ kind: 'task', cycleId: '2026-09-20' }]),
    ])
    expect(closeout).toMatch(/data-card="findings" data-live="false"/)
    expect(closeout).toMatch(/data-card="connect" data-live="true"/)
    expect(status).not.toContain('data-live="true"')
    expect(newestActionableCard([agent('plain', undefined)])).toBeUndefined()
  })
})
