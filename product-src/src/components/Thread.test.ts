import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Thread } from '@/components/Thread'
import { OverlayProvider } from '@/components/shell/Overlay'
import { buildCycles } from '@/lib/desk'
import * as onboarding from '@/lib/onboarding'
import { DEFAULTS } from '@/lib/onboarding'
import { defaultThreadParty, generateThread, recordThreadAction, type MediationState } from '@/lib/threads'

const cycle = buildCycles(DEFAULTS, new Date(2026, 8, 22, 12))[0]
const rs = cycle.run.shifts.find((payment) => generateThread(cycle, payment).draft)!
const party = defaultThreadParty(cycle, rs)
const original = generateThread(cycle, rs, party)
const at = '2026-09-23T12:00:00.000Z'

function render(saved?: MediationState) {
  vi.spyOn(onboarding, 'useOnboarding').mockReturnValue([
    { ...DEFAULTS, mediation: saved ? { [original.id]: saved } : {} }, vi.fn(),
  ])
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/payroll/${rs.shift.id}?with=${party}`] },
    h(OverlayProvider, null, h(Thread, { cycle, rs }))))
}

afterEach(() => vi.restoreAllMocks())

describe('Payroll Agent draft presentation', () => {
  it('identifies the agent draft and keeps Skip separate from the primary actions', () => {
    const html = render()
    const draft = html.match(/<section class="thread-draft"[\s\S]*?<\/section>/)![0]
    // No origin header: Pending sits on the subject line.
    expect(draft).not.toContain('thread-draft-origin')
    expect(draft).toMatch(/<div class="thread-draft-subject"><p class="thread-subject">[^<]+<\/p><span class="tag[^"]*">Pending<\/span><\/div>/)
    expect(draft).toMatch(/<div class="thread-draft-primary-actions"><button[^>]*>Send<\/button><button[^>]*>Edit<\/button><\/div><button type="button" class="btn thread-draft-skip">Skip<\/button>/)
    expect(draft).not.toContain('Not needed')
  })

  it('renders the sent draft as a regular outbound card without draft controls', () => {
    const saved = recordThreadAction(undefined, { type: 'send', draft: true, text: 'Please confirm the recorded time', at })
    const html = render(saved)
    expect(html).not.toContain('class="thread-draft"')
    expect(html).not.toContain('thread-draft-origin')
    expect(html).not.toContain('thread-draft-skip')
    const outgoing = [...html.matchAll(/<article class="thread-bubble out">[\s\S]*?<\/article>/g)].map((match) => match[0])
    expect(outgoing.at(-1)).toContain('Please confirm the recorded time')
    expect(outgoing.at(-1)).toContain(`dateTime="${at}"`)
  })

  it('removes a skipped draft without creating a sent message', () => {
    const saved = recordThreadAction(undefined, { type: 'dismiss', at })
    const html = render(saved)
    expect(html).not.toContain('class="thread-draft"')
    expect(html.match(/class="thread-bubble /g)).toHaveLength(original.entries.length)
    expect(html).not.toContain('Waiting on')
  })
})
