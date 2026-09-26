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
const render = (index: number, hoursOnly = false, showHeading = true) => {
  const cycle = hydrate(structuredClone(payload), DEFAULTS, files)
  const rs = cycle.run.shifts[index]
  if (hoursOnly) {
    cycle.week[index].prov!.hoursOnly = true
    rs.shift.punches = [{ in: 0, out: rs.payableMin }]
    rs.shift.sched = null
    rs.shift.meal = null
    delete rs.shift.mealMin
  }
  return renderToStaticMarkup(createElement(OverlayProvider, null, createElement(ShiftDetail, { cycle, rs, showHeading })))
}

describe('server time-entry evidence', () => {
  it('shows the source system without file provenance, with one Sample tag and the reported break length', () => {
    const html = render(1)
    expect(html).toContain('>Bullhorn</span>')
    expect(html).toContain('From Bullhorn')
    expect(html).not.toMatch(/\.csv|\brow \d+/i)
    expect(html.match(/>Sample</g)).toHaveLength(1)
    expect(html).toContain('30 min · break times not supplied')
  })

  it('leaves Sample to the sheet header when its own heading is suppressed', () => {
    const html = render(1, false, false)
    expect(html).not.toContain('>Sample<')
    expect(html).not.toMatch(/\.csv|\brow \d+/i)
    const cycle = hydrate(structuredClone(payload), DEFAULTS, files)
    expect(cycle.week[1].prov).toMatchObject({ file: 'bullhorn_2026-09-20.csv', row: 3 })
  })

  it('shows hours-only records without the engine placeholder clock times', () => {
    const html = render(0, true)
    expect(html).toContain('Reported hours')
    expect(html).toContain('8h · clock times not supplied')
    expect(html).not.toContain('12:00 AM to')
  })
})
