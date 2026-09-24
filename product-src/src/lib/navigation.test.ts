import { describe, expect, it } from 'vitest'
import { agentHref, canonicalHref, shiftHref, shiftListHref } from '@/lib/navigation'

describe('shift navigation', () => {
  it('carries full prior-cycle identity, flag and shared table controls without obsolete view state', () => {
    const href = shiftHref('2026-09-07', 'W20260907-4821', new URLSearchParams('flag=CA-MB-01&agent=1&filter=needs-review&q=Maria&view=cycles'))
    const url = new URL(href, 'https://closeout.local')
    expect(url.pathname).toBe('/payroll/W20260907-4821')
    expect(Object.fromEntries(url.searchParams)).toEqual({ cycle: '2026-09-07', flag: 'CA-MB-01', agent: '1', filter: 'needs-review' })
    expect(shiftListHref('2026-09-07', url.searchParams, '/payroll'))
      .toBe('/payroll?cycle=2026-09-07&flag=CA-MB-01&agent=1&filter=needs-review')
    expect(shiftListHref('2026-09-07', url.searchParams, '/payroll', true))
      .toBe('/payroll?cycle=2026-09-07&agent=1')
  })

  it('migrates a saved agent action and supplies its current cycle', () => {
    const href = agentHref('/reconcile?shift=W20260907-4821&view=sheet&rail=thread', new URLSearchParams('agent=1'), '2026-09-07')
    const url = new URL(href, 'https://closeout.local')
    expect(url.pathname).toBe('/payroll/W20260907-4821')
    expect(Object.fromEntries(url.searchParams)).toEqual({ cycle: '2026-09-07', agent: '1' })
  })

  it('opens and closes a payroll shift with its selected cycle and table controls intact', () => {
    const context = new URLSearchParams('cycle=2026-09-21&destination=adp&filter=needs-review&q=Maria&agent=1&review=done&cases=old')
    const href = shiftHref('2026-09-07', 'W20260907-4821', context, '/payroll')
    const url = new URL(href, 'https://closeout.local')
    expect(url.pathname).toBe('/payroll/W20260907-4821')
    expect(Object.fromEntries(url.searchParams)).toEqual({ cycle: '2026-09-07', destination: 'adp', filter: 'needs-review', agent: '1' })
    expect(shiftListHref('2026-09-07', url.searchParams, '/payroll'))
      .toBe('/payroll?cycle=2026-09-07&agent=1&destination=adp&filter=needs-review')
    expect(shiftListHref('2026-09-07', context, '/payroll', true))
      .toBe('/payroll?cycle=2026-09-07&agent=1&destination=adp')
    expect(context.get('cycle')).toBe('2026-09-21')
  })

  it('supplies cycle and agent context to payroll shift actions', () => {
    expect(agentHref('/payroll/W20260907-4821', new URLSearchParams('agent=1'), '2026-09-07'))
      .toBe('/payroll/W20260907-4821?cycle=2026-09-07&agent=1')
    expect(agentHref('/payroll/W20260907-4821?cycle=2026-09-07', new URLSearchParams(), '2026-09-21'))
      .toBe('/payroll/W20260907-4821?cycle=2026-09-07')
  })

  it('preserves an explicitly targeted cycle and the setup turn', () => {
    const context = new URLSearchParams('agent=1')
    expect(agentHref('/reconcile/W20260907-4821?cycle=2026-09-07', context, '2026-09-21')).toBe('/payroll/W20260907-4821?cycle=2026-09-07&agent=1')
    expect(agentHref('/setup/agent?step=5', context)).toBe('/setup/agent?step=5&agent=1')
  })
})


describe('legacy route redirects', () => {
  it.each(['/timesheets', '/reconcile'])('opens Review for a flagged %s bookmark while preserving its context', (legacyPath) => {
    expect(canonicalHref(`${legacyPath}?cycle=2026-09-07&flag=CA-MB-01&agent=1#review`))
      .toBe('/payroll?cycle=2026-09-07&flag=CA-MB-01&agent=1&filter=needs-review#review')
  })

  it.each(['/timesheets', '/reconcile'])('redirects %s list and modal bookmarks to Payroll', (legacyPath) => {
    expect(canonicalHref(legacyPath)).toBe('/payroll')
    expect(canonicalHref(`${legacyPath}/W20260907-4821?cycle=2026-09-07&cases=a%2Cb`))
      .toBe('/payroll/W20260907-4821?cycle=2026-09-07&cases=a%2Cb')
  })

  it.each(['/timesheets', '/reconcile'])('retains an explicit filter on a flagged %s bookmark', (legacyPath) => {
    expect(canonicalHref(`${legacyPath}?cycle=2026-09-07&flag=CA-MB-01&filter=agent-resolved&q=Maria`))
      .toBe('/payroll?cycle=2026-09-07&flag=CA-MB-01&filter=agent-resolved&q=Maria')
  })

  it.each(['/timesheets', '/reconcile'])('opens a flagged %s modal over the Review screen', (legacyPath) => {
    expect(canonicalHref(`${legacyPath}/W20260907-4821?cycle=2026-09-07&flag=CA-MB-01&agent=1#review`))
      .toBe('/payroll/W20260907-4821?cycle=2026-09-07&flag=CA-MB-01&agent=1&filter=needs-review#review')
  })

  it.each(['/timesheets', '/reconcile'])('migrates a flagged %s query selection to a Payroll modal over Review', (legacyPath) => {
    expect(canonicalHref(`${legacyPath}?shift=W20260907-4821&cycle=2026-09-07&flag=CA-MB-01&view=sheet&rail=thread&kind=meal&agent=1#review`))
      .toBe('/payroll/W20260907-4821?cycle=2026-09-07&flag=CA-MB-01&agent=1&filter=needs-review#review')
  })

  it('opens the corresponding Settings connection section with vendor selection', () => {
    expect(canonicalHref('/connect')).toBe('/settings?tab=sources')
    expect(canonicalHref('/connect?tab=timesheets&source=source%3Aukg&agent=1'))
      .toBe('/settings?tab=sources&source=source%3Aukg&agent=1')
    expect(canonicalHref('/connect?tab=payroll&source=dest%3Aadp'))
      .toBe('/settings?tab=destinations&source=dest%3Aadp')
  })
})
