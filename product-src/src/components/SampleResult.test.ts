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
    expect(html).toContain('>Clock in</th>')
    expect(html).toContain('>Clock out</th>')
    expect(html).toContain('<td>Bullhorn</td>')
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
})
