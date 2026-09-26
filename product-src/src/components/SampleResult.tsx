import { Fragment, useId } from 'react'
import { EmailIssue } from '@/components/EmailIssue'
import { Lbl, Tag } from '@/components/ui'
import { fmtHM } from '@/bench/engine.js'
import { findingEmail, type FindingEvidence } from '@/lib/issueEmail'
import { clock } from '@/lib/sample'
import { titleCase } from '@/lib/utils'
import './sample-result.css'

function findingCopy(value: string) {
  const text = value.trim().replace(/["“”]/g, '').replace(/\bpayroll\b/gi, 'Payroll')
  const sentence = /[.!?]\s+\S/.test(text) ? text : text.replace(/\.$/, '')
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

function findingStatCopy(value: string) {
  return findingCopy(value).replace(/\b[a-z]/i, (letter) => letter.toUpperCase())
}

export function FindingAmount({ label }: { label: string }) {
  const amount = label.match(/^(\$[\d,.]+)\s+(.+)$/)
  return <span className="finding-amount">{amount ? <>
    <span className="finding-amount-value">{amount[1]}</span>
    <span className="finding-amount-label">{findingCopy(amount[2])}</span>
  </> : findingCopy(label)}</span>
}

/** One finding's evidence, each source side by side for the same shift, and the drafted action. */
export function FindingDetail({ finding, dayLabel }: { finding: FindingEvidence; dayLabel(day: number): string }) {
  const id = useId()
  const time = (value: number | null) => value == null ? '' : clock(value)
  return <div className="shift-evidence"><div className="shift-evidence-scroll finding-detail">
    <h2>{findingCopy(finding.title)}</h2>
    <p className="finding-why">{findingCopy(finding.why)}</p>
    <div className="finding-tags">
      <Tag>{finding.cases.length} {titleCase(findingCopy(finding.tag))}</Tag>
      <div className="finding-stats">
        {finding.hoursLabel && <Tag>{titleCase(findingStatCopy(finding.hoursLabel))}</Tag>}
        {finding.amountLabel && <Tag>{titleCase(findingStatCopy(finding.amountLabel))}</Tag>}
      </div>
    </div>
    <section className="finding-action-card" aria-label="Suggested action">
      <Lbl className="finding-action-label">Suggested action</Lbl>
      <p className="finding-action">{findingCopy(finding.action)}</p>
      {finding.draft && <blockquote className="finding-draft">{findingCopy(finding.draft)}</blockquote>}
      <EmailIssue email={findingEmail(finding, dayLabel)} />
    </section>
    <Lbl>Evidence · {finding.cases.length} {finding.cases.length === 1 ? 'case' : 'cases'}</Lbl>
    <div className="finding-cases">{finding.cases.map((item, index) => <div key={index} className="finding-case">
      <div className="finding-case-header">
        <h3 id={`${id}-case-${index}`}>{findingCopy(item.worker)}</h3>
        <span className="finding-case-meta">{item.day == null ? null : findingCopy(dayLabel(item.day))}</span>
      </div>
      <div className="finding-case-body" role="region" aria-labelledby={`${id}-case-${index}`} tabIndex={0}>
        <table className="sheet" aria-labelledby={`${id}-case-${index}`}>
          <colgroup>{[18, 20, 26, 20, 16].map((width, column) => <col key={column} style={{ width: `${width}%` }} />)}</colgroup>
          <thead><tr><th scope="col">Source</th><th scope="col" className="num">Clock In</th><th scope="col" className="num">Meal Break</th><th scope="col" className="num">Clock Out</th><th scope="col" className="num">Hours</th></tr></thead>
          <tbody>{item.rows.map((row, i) => {
            const source = findingCopy(row.source).trim()
            // References remain on the evidence data and in its download, never in the UI.
            const note = !row.reference && row.note ? findingCopy(row.note).trim() : ''
            if (!source && row.start == null && row.end == null && row.meal == null && row.hours == null && !note) return null
            return <Fragment key={i}>
              <tr>
                <td data-label="Source">{source}</td><td data-label="Clock In" className="num">{time(row.start)}</td><td data-label="Meal Break" className="num">{row.meal ? `${clock(row.meal[0])} to ${clock(row.meal[1])}` : row.start == null ? '' : 'None'}</td>
                <td data-label="Clock Out" className="num">{time(row.end)}</td><td data-label="Hours" className="num">{row.hours == null ? row.reference ? 'Not supplied' : note : fmtHM(row.hours * 60)}</td>
              </tr>
              {row.hours != null && note ? <tr className="finding-note"><td colSpan={5}>{source}: {note}</td></tr> : null}
            </Fragment>
          })}</tbody>
        </table>
      </div>
    </div>)}</div>
  </div></div>
}
