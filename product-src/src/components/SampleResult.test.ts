import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FindingDetail } from '@/components/SampleResult'
import { buildSample, findings, type EvidenceRow } from '@/lib/sample'

const dayLabel = (day: number) => `Day ${day + 1}`
const finding = findings(buildSample(), dayLabel)[2]

describe('Finding evidence presentation', () => {
  it('keeps only the issue and stats in the head tags and uses explicit clock headers', () => {
    const html = renderToStaticMarkup(createElement(FindingDetail, { finding, dayLabel }))
    const tags = html.slice(html.indexOf('<div class="finding-tags">'), html.indexOf('<section'))
    expect(tags).not.toContain('bucket-tag')
    expect(tags).not.toContain('issue-tag')
    expect(tags).toContain('finding-stats')
    expect(tags.match(/class="tag"/g)).toHaveLength(3)
    expect(tags).not.toContain(finding.dispute)
    for (const source of finding.sources) expect(tags).not.toContain(source)
    expect(html).toContain('>Clock In</th>')
    expect(html).toContain('>Clock Out</th>')
    expect(html).toContain('<td data-label="Source">Bullhorn</td>')
    for (const label of ['Source', 'Clock In', 'Meal Break', 'Clock Out', 'Hours']) expect(html).toContain(`data-label="${label}"`)
    expect(html).toContain('>No entry</td>')
  })

  it('omits empty rows and blank notes while keeping zero values and meaningful notes', () => {
    const blank: EvidenceRow = { source: ' ', start: null, end: null, meal: null, hours: null, note: ' ' }
    const rows: EvidenceRow[] = [
      { ...blank, start: 0, end: 0, hours: 0 },
      { ...blank, source: 'ADP', hours: 8, note: ' “ ” ' },
      { ...blank, source: 'Bullhorn', note: 'No entry' },
      { ...blank, source: 'ADP', hours: 8, note: 'Confirmed by supervisor' },
      blank,
    ]
    const html = renderToStaticMarkup(createElement(FindingDetail, {
      finding: { ...finding, cases: [{ ...finding.cases[0], rows }] }, dayLabel,
    }))
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1]
    expect(body.match(/<tr\b/g)).toHaveLength(5)
    expect(body.match(/class="finding-note"/g)).toHaveLength(1)
    expect(body).toContain('>12:00 AM</td>')
    expect(body).toContain('>0m</td>')
    expect(body).toContain('>No entry</td>')
    expect(body).toContain('ADP: Confirmed by supervisor')
  })

  it('keeps the exact source filename with natural wrap opportunities and row/date outside the hours cell', () => {
    const file = 'bullhorn_time_pacific_cold_storage_09-20-2026.csv'
    const html = renderToStaticMarkup(createElement(FindingDetail, {
      finding: { ...finding, cases: [{ worker: 'Abel Brooks', day: 1, rows: [{ source: 'Bullhorn', start: 356, end: null, meal: null, hours: null,
        note: `${file} · row 17 · Sep 15, 2026`, reference: { file, row: 17, date: 'Sep 15, 2026' } }] }] }, dayLabel,
    }))
    expect(html).toContain('bullhorn_<wbr/>time_<wbr/>pacific_<wbr/>cold_<wbr/>storage_<wbr/>09-<wbr/>20-<wbr/>2026.csv')
    expect(html).not.toContain('Bullhorn_time')
    expect(html).toContain('<span>row 17 · Sep 15, 2026</span>')
    expect(html).toContain('data-label="Hours" class="num">Not supplied</td>')
  })
})
