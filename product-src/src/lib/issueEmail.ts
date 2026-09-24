import { money } from '@/bench/engine.js'
import { kindLabel, type DeskCycle } from '@/lib/desk'
import { actionFor, proposalFor, type ResolutionGroup } from '@/lib/resolution'
import { clock, type Finding } from '@/lib/sample'

/** A pre-written email about one issue, with its time entries as a CSV attachment. */
export interface IssueEmail { subject: string; body: string; file: string; csv: string; rows: number }

const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
const toCsv = (rows: (string | number)[][]) => rows.map((row) => row.map(quote).join(',')).join('\r\n')
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const sentence = (text: string) => text.trim().replace(/[.]?$/, '.')
const entries = (n: number) => `${n.toLocaleString()} time ${n === 1 ? 'entry' : 'entries'}`
const letter = (lines: string[], file: string) => ['Hi,', ...lines, `The time entries are attached (${file}).`, 'Thanks'].join('\n\n')

/** From the setup demo's evidence: every source row for every case, side by side. */
export function findingEmail(finding: Finding, dayLabel: (day: number) => string): IssueEmail {
  const rows = finding.cases.flatMap((item) => item.rows.map((row) => [item.worker, item.day == null ? '' : dayLabel(item.day), row.source,
    row.start == null ? '' : clock(row.start), row.meal ? clock(row.meal[0]) : '', row.meal ? clock(row.meal[1]) : '', row.end == null ? '' : clock(row.end),
    row.hours == null ? '' : row.hours.toFixed(2), row.note ?? '']))
  const file = `${slug(finding.tag)}_time_entries.csv`
  return {
    subject: `${finding.title} · ${entries(finding.cases.length)}`,
    body: letter([`${sentence(finding.summary)}${finding.amountLabel ? ` That's ${finding.amountLabel}.` : ''} ${sentence(finding.why)}`,
      `Suggested action: ${sentence(finding.action)}`], file),
    file, rows: rows.length,
    csv: toCsv([['Worker', 'Date', 'Source', 'Clock in', 'Meal start', 'Meal end', 'Clock out', 'Hours', 'Note'], ...rows]),
  }
}

/** From a Payroll group: one row per time entry, with its pay before and after the fix. */
export function groupEmail(group: ResolutionGroup, cycle: DeskCycle): IssueEmail {
  const label = kindLabel(group.ruleId)
  const file = `${slug(label)}_${cycle.id}.csv`
  const fix = group.state === 'fixed' ? `Fixed: ${sentence(actionFor(group.ruleId))}` : group.state === 'proposed' ? `Proposed fix: ${sentence(proposalFor(group.ruleId))}`
    : group.state === 'waiting' ? `We've asked ${group.asked} to confirm the hours worked.` : `This needs a decision from the ${group.owner ?? 'account owner'}.`
  return {
    subject: `${label} · ${entries(group.cases.length)} · ${cycle.label}`,
    body: letter([`${entries(group.cases.length)} in the ${cycle.label} pay cycle ${group.cases.length === 1 ? 'is' : 'are'} flagged ${label}. ${sentence(group.cases[0].note)}`,
      `Pay is ${money(group.current)} today and ${money(group.resolved)} after the fix. ${fix}`], file),
    file, rows: group.cases.length,
    csv: toCsv([['Time entry ID', 'Worker', 'Date', 'Site', 'Issue', 'Current pay', 'Resolved pay'],
      ...group.cases.map((item) => [item.shiftId, item.worker, item.day, item.site, item.note, item.before.toFixed(2), item.after.toFixed(2)])]),
  }
}

/** The addresses typed into To, split on commas, semicolons or spaces; `error` says what to fix. */
export function recipients(text: string) {
  const list = text.split(/[\s,;]+/).filter(Boolean)
  const bad = list.find((address) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
  return { list, error: !list.length ? 'Add who to send it to' : bad ? `${bad} isn't an email address` : '' }
}
