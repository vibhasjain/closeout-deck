import { describe, expect, it } from 'vitest'
import { buildSample, findings, sampleCsvs } from '@/lib/sample'
import { recentCycles } from '@/lib/cycles'
import { DEFAULTS } from '@/lib/onboarding'

describe('setup sample week', () => {
  const sample = buildSample()
  const found = findings(sample, (day) => `day ${day}`)

  it('is 2,047 workers at two clients, every Bullhorn timesheet against a client clock', () => {
    expect(sample.workers).toBe(2047)
    expect(new Set(sample.entries.map((e) => e.client))).toEqual(new Set(['A', 'B']))
  })

  it('reconciles to the seven findings and their amounts', () => {
    expect(found.map((f) => [f.id, f.cases.length, Math.round(f.amount * 100) / 100])).toEqual([
      [1, 140, 4428], [2, 12, 3000], [3, 8, 1664], [4, 95, 1900], [5, 60, 270], [6, 5, 185], [7, 6, 648],
    ])
    expect(new Set(found[0].cases.map((c) => c.worker)).size).toBe(47)
    const total = found.reduce((sum, f) => sum + f.amount, 0)
    expect(Math.round(total / 10) * 10).toBe(12100)
    expect(new Set(sample.entries.map((e) => e.worker)).size).toBe(2047)
    expect(found.filter((f) => f.deadline === 'payroll')).toHaveLength(4)
    expect(found.map((f) => f.hoursLabel)).toEqual(['153h 45m over-billed', '120h entered twice', '64h unpaid', '95 premium hours owed', '120h OT underpaid', '20h OT missed', '240h below cost'])
  })

  it('describes each finding only in terms the three files show', () => {
    const copy = found.flatMap((f) => [f.title, f.summary, f.why, f.action, f.draft ?? '', ...f.cases.map((c) => c.note)]).join('\n')
    expect(copy).not.toMatch(/e-?mail|\btext(ed)?\b|\border\b|phone|paper/i)
    const bullhorn = sampleCsvs(sample, recentCycles(DEFAULTS, 2)[1])[0]
    const via = bullhorn.header.indexOf('Entered Via')
    const keyed = bullhorn.rows.filter((row) => row[via] === 'Entered by staff')
    expect(keyed).toHaveLength(15)
    expect(found.find((f) => f.id === 2)!.summary).toBe('12 nights of 10h are in Bullhorn twice: once from the ADP clock import and again keyed by staff')
    // A client's supervisor is asked what was worked, never what to bill, and is always named with their role.
    const unsupported = found.find((f) => f.id === 1)!
    expect(unsupported.action).toContain("Maria Castillo, Pacific Cold Storage's site supervisor")
    expect(unsupported.draft).toMatch(/^Hi Maria, .+ punched out at .+\. Did they work any later than that\?$/)
    expect(`${unsupported.action} ${unsupported.draft}`).not.toMatch(/\bbill\?|what to bill|should we bill/i)
    expect(sample.entries.some((e) => e.worker === 'Maria Castillo')).toBe(false)
    expect(found.find((f) => f.id === 7)!.summary).toBe('6 forklift operators at Lonestar Packaging are billed $19.50 against $18.50 pay in Bullhorn')
  })

  it('shows hours only, and skips the margin check, when the timesheets carry no rates', () => {
    const bare = { ...sample, entries: sample.entries.map((e) => ({ ...e, pay: 0, bill: 0 })) }
    const hoursOnly = findings(bare, (day) => `day ${day}`)
    expect(hoursOnly.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6])
    expect(hoursOnly.every((f) => f.amount === 0 && f.amountLabel === '' && f.hoursLabel)).toBe(true)
  })

  it('writes the three files for the closed week', () => {
    const cycle = recentCycles(DEFAULTS, 2, new Date(2026, 8, 22))[1]
    const [bullhorn, ukg, adp] = sampleCsvs(sample, cycle)
    expect(bullhorn.rows).toHaveLength(sample.entries.length)
    expect(bullhorn.name).toBe('bullhorn_time_09-20-2026.csv')
    expect(ukg.rows.every((row) => row.length === ukg.header.length)).toBe(true)
    // The Sunday overnight is filed under Monday in ADP.
    expect(adp.rows.some((row) => row[3] === '09/21/2026' && row[5] === '10:00 PM')).toBe(false)
    expect(adp.rows.some((row) => row[3] === '09/21/2026' && row[4] === 'REG')).toBe(true)
  })
})
