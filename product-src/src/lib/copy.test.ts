import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayProvider } from '@/components/shell/Overlay'
import { AuxProvider } from '@/components/shell/Aux'
import { PayrollCalendar } from '@/components/PayrollCalendar'
import { ProfileCard } from '@/components/profile/ProfileCard'
import { TaskCard } from '@/components/journey/TaskCard'
import { FindingsCard } from '@/components/journey/FindingsCard'
import { FormCard } from '@/components/journey/FormCard'
import { Payroll } from '@/pages/Payroll'
import * as desk from '@/lib/desk'
import { hydrate, NO_DATA_STEP, type CyclePayload, type FileRecord } from '@/lib/data'
import type { JourneyThread, NextStep } from '@/lib/journey'
import { recentCycles } from '@/lib/cycles'
import { DEFAULTS } from '@/lib/onboarding'
import recorded from '@/lib/fixtures/server-cycle.json'

const payload = recorded.payload as unknown as CyclePayload
const thread: JourneyThread = { id: 't_1', cycleId: payload.cycle.id, counterparty: { kind: 'worker', name: 'Ana Reid', gapIds: [] }, status: 'waiting', createdAt: '2026-09-25T12:00:00Z',
  messages: [{ id: 'm_1', threadId: 't_1', dir: 'out', text: 'Did you work that day?', status: 'not_sent_demo', at: '2026-09-25T12:00:00Z' }] }
vi.mock('@/lib/journey', async (original) => ({ ...await original<typeof import('@/lib/journey')>(),
  useJourneyCycle: () => ({ cycle: payload, row: undefined, running: false, empty: false, loading: false, error: null }),
  useJourneyThreads: () => ({ threads: [thread], loading: false, loaded: true, error: null }) }))
afterEach(() => { vi.restoreAllMocks() })

/** H1/H2: what a person reads (text, labels, tooltips, placeholders) keeps the owner's "Timesheets" and "Get timesheets" and never says shift. */
function copyViolations(html: string): string[] {
  const visible = [html.replace(/<[^>]+>/g, ' '), ...[...html.matchAll(/\b(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map((match) => match[1])]
    .join(' ').replace(/&#x27;/g, "'").replace(/\bGet timesheets\b/g, '').replace(/\bTimesheets\b/g, '')
  return [...visible.matchAll(/\b(?:shifts?|timesheets?)\b/gi)].map((match) => visible.slice(Math.max(0, match.index - 40), match.index + 40))
}
const shell = (node: ReactElement, url = '/payroll') => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] }, h(OverlayProvider, null, h(AuxProvider, null, node))))
const step = (kind: NextStep['kind']): NextStep => ({ kind, label: { get_timesheets: 'Get timesheets', chase_missing: 'Chase missing time', review: 'Review 3 issues', send: 'Send to Payroll', done: 'Done' }[kind], detail: 'No location yet', counts: { missingSets: 1, gaps: 2, openGroups: 3 } })
function payroll(cycle: desk.DeskCycle, url: string) {
  vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, byId: () => cycle })
  return shell(h(Routes, null, h(Route, { path: '/payroll', element: h(Payroll) })), url)
}

describe('H1/H2: rendered copy says time entries', () => {
  it('checks both words, and allows only the owner\'s nav and step labels', () => {
    expect(copyViolations('<p>Did you work those shifts?</p><span title="Timesheet cutoff">x</span><a>Timesheets</a><b>Get timesheets</b>')).toHaveLength(2)
  })
  it('in the Payroll work pane for every next step, both steps, and an account with no data yet', () => {
    const cycle = hydrate(payload, DEFAULTS, recorded.files as FileRecord[])
    for (const kind of ['get_timesheets', 'chase_missing', 'review', 'send', 'done'] as const) for (const view of ['intake', 'review']) {
      expect(copyViolations(payroll({ ...cycle, nextStep: step(kind) }, `/payroll?cycle=${cycle.id}&step=${view}`))).toEqual([])
    }
    const period = recentCycles(DEFAULTS, 2)[1]
    const empty: desk.DeskCycle = { ...hydrate({ ...payload, week: [], results: [], groups: [], extraGroups: [], gaps: [], intake: { sources: [], expected: [], received: [] } }, DEFAULTS),
      ...period, label: 'Sep 14 to 20', nextStep: NO_DATA_STEP }
    const html = payroll(empty, `/payroll?cycle=${empty.id}`)
    expect(html).toContain('No time entries yet')
    expect(copyViolations(html)).toEqual([])
  })
  it('in the agent cards, the calendar form and the Payroll profile', () => {
    for (const card of [h(TaskCard, { cycleId: payload.cycle.id }), h(FindingsCard, { cycleId: payload.cycle.id }),
      ...(['gaps', 'send', 'dispute'] as const).map((form) => h(FormCard, { form, cycleId: payload.cycle.id }))]) {
      expect(copyViolations(shell(card))).toEqual([])
    }
    const calendar = shell(h(PayrollCalendar))
    expect(calendar).toContain('Cutoff')
    expect(copyViolations(calendar)).toEqual([])
    expect(copyViolations(shell(h(ProfileCard, { state: { ...DEFAULTS, profile: { workerHours: 'Texted to recruiters' } } })))).toEqual([])
  })
})
