import { describe, expect, it } from 'vitest'
import { buildCycles } from '@/lib/desk'
import { findingEmail, groupEmail, recipients } from '@/lib/issueEmail'
import { DEFAULTS } from '@/lib/onboarding'
import { resolutionGroups } from '@/lib/resolution'
import { buildSample, findings } from '@/lib/sample'

const dayLabel = (day: number) => `Day ${day + 1}`
const found = findings(buildSample(), dayLabel)

describe('emailing an issue', () => {
  it('writes the demo issue up with every source row attached', () => {
    const duplicate = found.find((finding) => finding.id === 2)!
    const email = findingEmail(duplicate, dayLabel)
    expect(email.subject).toBe('Duplicate time entry · 12 time entries')
    expect(email.body.split('\n\n')).toEqual([
      'Hi,',
      '12 nights of 10h are in Bullhorn twice: once from the ADP clock import and again keyed by staff. That\'s $3,000 overbilled. Clients find these in audits, then question every invoice.',
      'Suggested action: Delete the copies staff keyed by hand before invoicing.',
      'The time entries are attached.',
      'Thanks',
    ])
    const lines = email.csv.split('\r\n')
    expect(lines[0]).toBe('"Worker","Date","Source","Clock in","Meal start","Meal end","Clock out","Hours","Note"')
    expect(lines).toHaveLength(email.rows + 1)
    expect(email.rows).toBe(duplicate.cases.reduce((total, item) => total + item.rows.length, 0))
    expect(lines[1]).toMatch(/^"[^"]+","Day \d","Bullhorn","\d+:\d\d [AP]M"/)
  })

  it('writes a Payroll group up with each time entry and its pay before and after', () => {
    const cycle = buildCycles(DEFAULTS, new Date(2026, 8, 22)).find((item) => item.status === 'needs-review')!
    const waiting = resolutionGroups(cycle, {}).find((group) => group.state === 'waiting')!
    const email = groupEmail(waiting, cycle)
    expect(email.subject).toBe(`Unsupported hours · 3 time entries · ${cycle.label}`)
    expect(email.body).toContain("We've asked Maria Castillo, Pacific Cold Storage's site supervisor, to confirm the hours worked.")
    expect(email.file).toBe(`unsupported_hours_${cycle.id}.csv`)
    expect(email.csv.split('\r\n')).toHaveLength(4)
    expect(email.csv).toContain(`"${waiting.cases[0].shiftId}","${waiting.cases[0].worker}"`)
  })

  it('quotes values so commas and quotes survive in a spreadsheet', () => {
    const [finding] = found
    const email = findingEmail({ ...finding, cases: [{ ...finding.cases[0], worker: 'Reyes, "Ana"' }] }, dayLabel)
    expect(email.csv.split('\r\n')[1]).toMatch(/^"Reyes, ""Ana""",/)
  })

  it('asks for at least one valid address', () => {
    expect(recipients('')).toMatchObject({ list: [], error: 'Add who to send it to' })
    expect(recipients('maria@pcs.com, payroll')).toMatchObject({ error: "payroll isn't an email address" })
    expect(recipients('maria@pcs.com; ops@agency.com')).toEqual({ list: ['maria@pcs.com', 'ops@agency.com'], error: '' })
  })
})
