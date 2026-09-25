import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShiftDetail } from '@/components/ShiftDetail'
import { OverlayProvider } from '@/components/shell/Overlay'
import { hydrate, type CyclePayload, type FileRecord } from '@/lib/data'
import { DEFAULTS } from '@/lib/onboarding'
import fixture from '@/lib/fixtures/server-cycle.json'

const payload = fixture.payload as unknown as CyclePayload
const files = fixture.files as FileRecord[]
const render = (index: number, hoursOnly = false) => {
  const cycle = hydrate(structuredClone(payload), DEFAULTS, files)
  const rs = cycle.run.shifts[index]
  if (hoursOnly) {
    cycle.week[index].prov!.hoursOnly = true
    rs.shift.punches = [{ in: 0, out: rs.payableMin }]
    rs.shift.sched = null
    rs.shift.meal = null
    delete rs.shift.mealMin
  }
  return renderToStaticMarkup(createElement(OverlayProvider, null, createElement(ShiftDetail, { cycle, rs })))
}

describe('server time-entry evidence', () => {
  it('shows the original file and row, Sample tag and reported break length', () => {
    const html = render(1)
    expect(html).toContain('bullhorn_2026-09-20.csv')
    expect(html).toContain('From Bullhorn')
    expect(html).toContain('row 3')
    expect(html).toContain('>Sample<')
    expect(html).toContain('30 min · break times not supplied')
  })

  it('shows hours-only records without the engine placeholder clock times', () => {
    const html = render(0, true)
    expect(html).toContain('Reported hours')
    expect(html).toContain('8h · clock times not supplied')
    expect(html).not.toContain('12:00 AM to')
  })
})
