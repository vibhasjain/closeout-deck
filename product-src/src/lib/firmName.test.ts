import { describe, expect, it } from 'vitest'
import { DEFAULTS, type FirmFacts, type Onboarding } from './onboarding'
import { firmClientNames, payrollFirmName, singleFirmName } from './firmName'
import { applyAction, validatedActions } from './chatActions'

const firm: FirmFacts = { name: 'Summit Staffing', domain: 'sample', summary: '', states: [], verticals: [], clientTypes: [], size: '', staffing: true }

describe('the Payroll profile names one staffing agency', () => {
  it.each([' / ', ' & ', ', ', ' and '])('rejects joined known clients using %s while keeping other firm facts', separator => {
    const patch = { name: `Pacific Cold Storage${separator}Lonestar Packaging`, states: ['CA'] }
    expect(validatedActions([{ type: 'set_firm', patch }], firm)).toEqual({ actions: [{ type: 'set_firm', patch: { states: ['CA'] } }], skipped: ['set_firm.name'] })
    expect(payrollFirmName({ ...firm, name: patch.name })).toBe('Summit Staffing')
    let state: Onboarding = { ...DEFAULTS, firm }
    applyAction({ type: 'set_firm', patch }, update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) } }, () => {}, new URLSearchParams())
    expect(state.firm?.name).toBe('Summit Staffing')
    expect(state.firm?.states).toEqual(['CA'])
  })

  it('keeps punctuation that belongs to a real agency, without truncating it', () => {
    for (const name of ['Smith & Jones Staffing', 'Anderson and Sons Staffing', 'Staffing Partners, Inc.']) {
      expect(singleFirmName(name, ['Pacific Cold Storage', 'Lonestar Packaging'])).toBe(name)
      expect(payrollFirmName({ ...firm, domain: 'example.com', name })).toBe(name)
    }
  })

  it('uses explicit pre-read clients for real firms and hides an old composite instead of displaying it', () => {
    const real = { ...firm, domain: 'example.com', name: 'North Warehouse / West Factory', summary: 'Staffing agency. Clients: North Warehouse (Boston, MA) and West Factory (Reno, NV).' }
    expect(firmClientNames(real)).toEqual(['North Warehouse', 'West Factory'])
    expect(payrollFirmName(real)).toBe('Your firm')
    expect(validatedActions([{ type: 'set_firm', patch: { name: real.name } }], real).actions).toEqual([])
  })
})
