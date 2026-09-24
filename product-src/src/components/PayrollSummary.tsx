import { useState, type CSSProperties } from 'react'
import { RULES } from '@/bench/engine.js'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Mail } from 'lucide-react'
import { EmailIssue } from '@/components/EmailIssue'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, PayDelta } from '@/components/ui'
import { shortDate } from '@/lib/cycles'
import { bucketHue, kindLabel, rememberKind, type DeskCycle } from '@/lib/desk'
import { shiftHref } from '@/lib/navigation'
import { titleCase } from '@/lib/utils'
import { groupEmail } from '@/lib/issueEmail'
import { getOnboarding, useOnboarding } from '@/lib/onboarding'
import { actionFor, proposalFor, resolutionGroups, STATES, type ResolutionGroup, type ResolutionState } from '@/lib/resolution'
import './sheet.css'

const pill = (ruleId: string, count: number) => {
  const label = kindLabel(ruleId)
  return <span className="bucket-tag issue-tag" style={{ '--hue': bucketHue(ruleId) } as CSSProperties}>{count.toLocaleString()} {titleCase(label)}</span>
}
// Big totals read better with separators: 24,801h 44m.
const hours = (minutes: number) => { const whole = Math.round(minutes), m = whole % 60; return `${Math.floor(whole / 60).toLocaleString()}h${m ? ` ${m}m` : ''}` }

const HEADINGS: Record<ResolutionState, { title: string; empty: string }> = {
  proposed: { title: 'Approve', empty: 'Nothing waiting on approval' },
  waiting: { title: 'Waiting on a Reply', empty: 'Nobody has been asked anything this cycle' },
  judgment: { title: 'Needs Judgment', empty: 'Nothing needs a business decision' },
  fixed: { title: 'Fixed', empty: 'Nothing has been fixed yet' },
}

/**
 * The payroll person's landing view: every discrepancy triaged by the agent into what to approve, what it is
 * waiting on, what needs a decision it can't make, and what it already fixed (undoable until payroll closes).
 * `review` is the Review stat's view: only what a person acts on, without Fixed or By client.
 */
export function PayrollSummary({ cycle, review = false }: { cycle: DeskCycle; review?: boolean }) {
  const [state, update] = useOnboarding()
  const { toast } = useOverlay()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [open, setOpen] = useState<string[]>([])
  // The issue being emailed, in a panel that slides out on the right.
  const [emailing, setEmailing] = useState<ResolutionGroup | null>(null)
  // The group just approved asks once whether to do it every cycle.
  const [learning, setLearning] = useState<{ cycleId: string; ruleId: string; count: number } | null>(null)
  const undone = state.undone[cycle.id] ?? []
  const groups = resolutionGroups(cycle, state.resolutions, undone)
  const closed = cycle.statusTag === 'Paid' || new Date() > cycle.deadline
  const key = (group: ResolutionGroup) => `${group.state}:${group.ruleId}:${!!group.approved}`

  function approve(group: ResolutionGroup) {
    const ids = group.cases.map((item) => item.shiftId)
    const latest = getOnboarding(), at = new Date().toISOString()
    const decisions = { ...latest.resolutions[cycle.id] }, times = { ...latest.decisionTimes }
    for (const id of ids) { decisions[id] = 'applied'; times[`${cycle.id}:${id}`] = at }
    update({ resolutions: { ...latest.resolutions, [cycle.id]: decisions }, decisionTimes: times })
    toast(`Approved ${ids.length.toLocaleString()} · ${kindLabel(group.ruleId)}`)
    if (RULES.some((rule) => rule.id === group.ruleId)) setLearning({ cycleId: cycle.id, ruleId: group.ruleId, count: ids.length })
  }

  function undo(group: ResolutionGroup) {
    const latest = getOnboarding()
    update({ undone: { ...latest.undone, [cycle.id]: [...new Set([...(latest.undone[cycle.id] ?? []), group.ruleId])] } })
    toast(`Undid ${group.cases.length.toLocaleString()} ${kindLabel(group.ruleId)} fixes · they now wait for approval`)
  }

  /** A category's one action, shown in its header: it acts on every group in the category. */
  function action(resolution: ResolutionState, items: ResolutionGroup[], count: number) {
    if (!items.length) return null
    if (resolution === 'proposed') return <Btn className="primary" onClick={() => {
      for (const group of items) approve(group)
      if (items.length > 1) { setLearning(null); toast(`Approved ${count.toLocaleString()}`) }
    }}>Approve {count.toLocaleString()}</Btn>
    if (resolution === 'fixed') {
      const undoable = items.filter((group) => !group.approved)
      return closed || !undoable.length ? null : <Btn onClick={() => undoable.forEach(undo)}>Undo All</Btn>
    }
    if (resolution === 'judgment') return <Btn onClick={() => toast(`Sent ${count.toLocaleString()} cases to ${[...new Set(items.map((group) => group.owner))].join(', ')}`)}>Escalate</Btn>
    return null
  }

  function line(group: ResolutionGroup) {
    const note = group.cases[0].note
    const detail = group.cases.length === 1 ? note : `${note.replace(/\.$/, '')}, and ${(group.cases.length - 1).toLocaleString()} more like it${note.endsWith('.') ? '.' : ''}`
    if (group.state === 'waiting') return `Asked ${group.asked} to confirm the hours worked · reply due ${shortDate(cycle.cutoff)}`
    if (group.state === 'judgment') return `${note.replace(/\.$/, '')}. Not a Payroll call.`
    if (group.state === 'fixed') return `${actionFor(group.ruleId)} · ${group.approved ? 'approved by you' : 'by the agent'}`
    if (group.state === 'proposed') return `${proposalFor(group.ruleId)} · ${detail.replace(/\.$/, '')}`
    return detail
  }

  const clients = new Map<string, { workers: Set<string>; entries: number; minutes: number; current: number; resolved: number }>()
  for (const rs of cycle.run.shifts) {
    const current = clients.get(rs.shift.fac.name) ?? { workers: new Set(), entries: 0, minutes: 0, current: 0, resolved: 0 }
    current.workers.add(rs.shift.worker)
    current.entries += 1
    current.minutes += rs.payableMin
    current.current += rs.naive
    current.resolved += rs.pay
    clients.set(rs.shift.fac.name, current)
  }

  const learned = learning?.cycleId === cycle.id ? learning : null

  return <div className="payroll-summary scroll">
    <Sheet open={!!emailing} onOpenChange={(next) => { if (!next) setEmailing(null) }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>Email This Issue</SheetTitle></SheetHeader>
        {emailing && <div className="px-4 pb-4"><EmailIssue key={key(emailing)} email={groupEmail(emailing, cycle)} open onOpenChange={(next) => { if (!next) setEmailing(null) }} /></div>}
      </SheetContent>
    </Sheet>
    {STATES.filter((resolution) => !review || resolution !== 'fixed').map((resolution) => {
      const items = groups.filter((group) => group.state === resolution)
      const count = items.reduce((total, group) => total + group.cases.length, 0)
      // An empty category needs no attention, so it isn't shown at all.
      if (!items.length) return null
      return <section key={resolution} aria-labelledby={`summary-${resolution}`}>
        <div className="payroll-summary-head">
          <h3 id={`summary-${resolution}`}>{HEADINGS[resolution].title} · {count.toLocaleString()}</h3>
          <span className="payroll-summary-head-end">
            {resolution === 'fixed' && count > 0 && !closed && <span className="r-note">Undo the agent's fixes until Payroll closes {shortDate(cycle.deadline)}</span>}
            {action(resolution, items, count)}
          </span>
        </div>
        {resolution === 'proposed' && learned && <div className="decision-learn">
          <span>Approved {learned.count.toLocaleString()} · {kindLabel(learned.ruleId)}. Approve these automatically from now on?</span>
          <Btn className="primary" onClick={() => { rememberKind(learned.ruleId); setLearning(null); toast(`Decision remembered for ${learned.ruleId}`) }}>Yes</Btn>
          <Btn onClick={() => setLearning(null)}>Not Now</Btn>
        </div>}
        {items.length === 0 ? <p className="r-note">{HEADINGS[resolution].empty}</p> : items.map((group) => {
          const expanded = open.includes(key(group))
          const toggle = () => setOpen(expanded ? open.filter((item) => item !== key(group)) : [...open, key(group)])
          return <div key={key(group)} className="decision" data-rule={group.ruleId}>
            {/* The whole row expands; its own buttons and links keep their clicks. The chevron stays the keyboard control. */}
            <div className="payroll-summary-row" onClick={(event) => { if (!(event.target as Element).closest('button, a')) toggle() }}>
              <button type="button" className="decision-toggle" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} cases`}
                onClick={toggle}>
                {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
              </button>
              {pill(group.ruleId, group.cases.length)}
              <span className="decision-line">{line(group)}</span>
              <PayDelta className="num" current={group.current} resolved={group.resolved} size="sm" />
              <span className="decision-action">
                <button type="button" className="icon-btn sm dim" aria-label="Email This Issue" title="Email This Issue"
                  onClick={() => setEmailing(group)}><Mail aria-hidden /></button>
              </span>
            </div>
            {expanded && <ul className="decision-cases">
              {group.cases.map((item) => <li key={item.shiftId} className="decision-case"
                onClick={(event) => { if (!(event.target as Element).closest('a, button')) navigate(shiftHref(cycle.id, item.shiftId, params, '/payroll')) }}>
                <span className="decision-who"><Link to={shiftHref(cycle.id, item.shiftId, params, '/payroll')}>{item.worker}</Link><span className="r-note">{item.day} · {item.site}</span></span>
                <span className="decision-note">{item.note}{(resolution === 'fixed' || resolution === 'proposed') && <b>{resolution === 'fixed' ? actionFor(group.ruleId) : `Resolved: ${proposalFor(group.ruleId)}`}</b>}</span>
                <PayDelta className="num decision-diff" current={item.before} resolved={item.after} size="sm" />
              </li>)}
            </ul>}
          </div>
        })}
      </section>
    })}
    {!review && <section aria-labelledby="summary-clients">
      <div className="payroll-summary-head"><h3 id="summary-clients">By Client</h3></div>
      <table className="sheet payroll-summary-clients">
        <thead><tr><th scope="col">Client</th><th scope="col" className="num">Workers</th><th scope="col" className="num">Time Entries</th><th scope="col" className="num sheet-hours">Hours</th><th scope="col" className="num">Gross</th></tr></thead>
        <tbody>{[...clients].sort((a, b) => b[1].resolved - a[1].resolved).map(([name, item]) => <tr key={name}>
          <td>{name}</td><td className="num">{item.workers.size.toLocaleString()}</td><td className="num">{item.entries.toLocaleString()}</td>
          <td className="num sheet-hours">{hours(item.minutes)}</td><td className="num"><PayDelta current={item.current} resolved={item.resolved} size="sm" /></td>
        </tr>)}</tbody>
      </table>
    </section>}
  </div>
}
