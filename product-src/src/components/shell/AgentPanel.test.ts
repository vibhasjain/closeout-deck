import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AgentPanel } from './AgentPanel'
import { shellLayout } from '@/lib/useWide'

vi.mock('@/components/chat/ChatPane', () => ({ ChatPane: () => createElement('div', { className: 'chat' }, 'Agent conversation') }))

describe('onboarding handoff at the mobile breakpoint', () => {
  const render = (url: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, createElement(AgentPanel, { docked: shellLayout(390).agent === 'docked' })))
  it('opens a visible, interactive agent sheet at 390 after Finish', () => {
    expect(shellLayout(390).agent).toBe('sheet')
    const html = render('/payroll?agent=1')
    const panel = html.match(/<div id="agent-panel"[^>]*>/)?.[0]
    expect(panel).toBeTruthy()
    expect(panel).toContain('role="dialog"')
    expect(panel).toContain('aria-modal="true"')
    expect(panel).not.toMatch(/\b(?:hidden|inert)=/)
    expect(html).toContain('Agent conversation')
    expect(html).toContain('aria-expanded="true"')
  })
  it('keeps the mobile agent hidden and inert without the handoff flag', () => {
    const panel = render('/payroll').match(/<div id="agent-panel"[^>]*>/)?.[0]
    expect(panel).toContain('hidden=""')
    expect(panel).toContain('inert=""')
  })
})
