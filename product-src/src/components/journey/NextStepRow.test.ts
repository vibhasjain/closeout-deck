import { Children, createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextStepRow } from './NextStepRow'
import { postToChat } from '@/lib/chatBus'
import { Btn } from '@/components/ui'
import type { NextStep } from '@/lib/journey'

vi.mock('@/lib/chatBus', () => ({ postToChat: vi.fn() }))
const cycle = { id: '2026-09-14', label: 'Sep 14–20' }
const steps: [NextStep['kind'], string][] = [
  ['get_timesheets', 'Get timesheets'], ['chase_missing', 'Chase missing time'],
  ['review', 'Review 4 issues'], ['send', 'Send to Payroll'], ['done', 'Done'],
]
const next = (kind: NextStep['kind'], label: string): NextStep => ({ kind, label, detail: 'Cycle detail from the server', counts: { missingSets: 1, gaps: 2, openGroups: 4 } })
type Props = { children?: ReactNode; onClick?: () => void }
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap((child) => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
afterEach(() => vi.clearAllMocks())

describe('Payroll next step', () => {
  it.each(steps)('renders the server label, detail and counts for %s with exactly one outline button', (kind, label) => {
    const html = renderToStaticMarkup(h(NextStepRow, { nextStep: next(kind, label), cycle }))
    expect(html).toContain(`<strong>${label}</strong>`)
    expect(html).toContain('Cycle detail from the server')
    expect(html).toContain('1 missing sets · 2 gaps · 4 open groups')
    expect(html.match(/<button\b/g)).toHaveLength(1)
    expect(html).toContain('class="btn journey-next-button"')
    expect(html).not.toContain('primary')
  })

  it.each(steps)('posts the %s user message through chat with cycle context and a context chip', (kind, label) => {
    const onReview = vi.fn()
    const nextStep = next(kind, label)
    const action = kind === 'done' ? 'Disputes' : label
    const tree = NextStepRow({ nextStep, cycle, onReview })
    elements(tree).find((element) => element.type === Btn)!.props.onClick!()
    expect(postToChat).toHaveBeenCalledWith(expect.objectContaining({ text: `${action} for Sep 14–20`, contextChip: `${action} · Sep 14–20`,
      context: expect.objectContaining({ page: '/payroll', cycle: { ...cycle, stats: nextStep.detail }, selection: { nextStep } }) }))
    expect(onReview).toHaveBeenCalledTimes(kind === 'review' ? 1 : 0)
  })
})
