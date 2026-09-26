import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayProvider } from '@/components/shell/Overlay'
import { AuxProvider } from '@/components/shell/Aux'
import { hydrate, type CyclePayload, type FileRecord } from '@/lib/data'
import * as desk from '@/lib/desk'
import { DEFAULTS } from '@/lib/onboarding'
import recorded from '@/lib/fixtures/server-cycle.json'
import { Payroll } from './Payroll'
import { ShiftPage } from './ShiftPage'

const payload = recorded.payload as unknown as CyclePayload
const fullCycle = hydrate(payload, DEFAULTS, recorded.files as FileRecord[])
const entryId = fullCycle.run.shifts[0].shift.id
const emptyCycle = { ...fullCycle, week: [], run: { ...fullCycle.run, shifts: [] } }

function render({ loaded, error = null, cycleErrors = {}, present = false }: {
  loaded: boolean; error?: string | null; cycleErrors?: Record<string, string>; present?: boolean
}) {
  const cycle = present ? fullCycle : emptyCycle
  vi.spyOn(desk, 'useDesk').mockReturnValue({ cycles: [cycle], current: cycle, loaded, error, cycleErrors, byId: id => id === cycle.id ? cycle : undefined })
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/payroll/${encodeURIComponent(entryId)}?cycle=${cycle.id}&step=review&filter=needs-review&agent=1`] },
    h(OverlayProvider, null, h(AuxProvider, null, h(Routes, null,
      h(Route, { path: '/payroll', element: h(Payroll) }, h(Route, { path: ':shiftId', element: h(ShiftPage) })),
    ))),
  ))
}
const dialog = (html: string) => html.slice(html.indexOf('<section class="shift-modal open"'))
afterEach(() => { vi.restoreAllMocks() })

describe('time-entry frame while its data arrives', () => {
  it('mounts the nested frame immediately with destination skeletons before data is loaded', () => {
    const html = render({ loaded: false })
    expect(html).toContain('role="dialog" aria-modal="true" aria-label="Time entry"')
    const sheet = dialog(html)
    expect(sheet).toContain('aria-label="Close time entry"')
    expect(sheet).toContain('data-shift-pending="true"')
    expect(sheet).toContain('skeleton-region')
    expect(sheet).not.toContain('Not found')
    expect(sheet).not.toContain('Loading…')
    expect(sheet).not.toContain(entryId)
  })

  it.each(['initial', 'cycle'] as const)('keeps the frame open with Retry after an %s data failure', kind => {
    const html = render(kind === 'initial'
      ? { loaded: false, error: 'Network unavailable' }
      : { loaded: true, cycleErrors: { [fullCycle.id]: 'Network unavailable' } })
    const sheet = dialog(html)
    expect(sheet).toContain('role="dialog" aria-modal="true" aria-label="Time entry"')
    expect(sheet).toContain('role="alert"')
    expect(sheet).toContain('>Retry</button>')
    expect(sheet).not.toContain('Not found')
    expect(sheet).not.toContain('data-shift-pending')
    expect(sheet).not.toContain(entryId)
  })

  it('only shows missing-entry copy once a successful load confirms it is absent', () => {
    const sheet = dialog(render({ loaded: true }))
    expect(sheet).toContain('Not found')
    expect(sheet).not.toContain('data-shift-pending')
    expect(sheet).not.toContain(entryId)
  })

  it('retains available entry content during a background refresh', () => {
    const sheet = dialog(render({ loaded: false, present: true }))
    expect(sheet).toContain(fullCycle.run.shifts[0].shift.worker)
    expect(sheet).not.toContain('data-shift-pending')
    expect(sheet).not.toContain('Not found')
  })
})
