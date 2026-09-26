import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { usePendingAction } from '@/lib/usePendingAction'
import { useEffect, useState, type CSSProperties } from 'react'
import { RULES } from '@/bench/engine.js'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Mail } from 'lucide-react'
import { EmailIssue } from '@/components/EmailIssue'
import { AutoApproveOffer } from '@/components/memory/AutoApproveOffer'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, PayDelta } from '@/components/ui'
import { replyBy, shortDate } from '@/lib/cycles'
import { bucketHue, kindLabel, rememberKind, type DeskCycle } from '@/lib/desk'
import { shiftHref } from '@/lib/navigation'
import { titleCase } from '@/lib/utils'
import { groupEmail } from '@/lib/issueEmail'
import { decide, groupId, useJourneyThreads } from '@/lib/journey'
import { getDataSnapshot } from '@/lib/data'
import { journeyShiftMinutes, journeyShiftPay } from '@/lib/journeyPay'
import { getOnboarding, useOnboarding } from '@/lib/onboarding'
import { actionFor, lawLabel, proposalFor, requiredByLaw, resolutionGroups, STATES, type ResolutionGroup, type ResolutionState } from '@/lib/resolution'
import './sheet.css'

const pill = (ruleId: string, count: number) => {
  const label = kindLabel(ruleId)
  const text = `${count.toLocaleString()} ${titleCase(label)}`
  return <span className="bucket-tag issue-tag" title={text} style={{ '--hue': bucketHue(ruleId) } as CSSProperties}>{text}</span>
}
// Big totals read better with separators: 24,801h 44m.
const hours = (minutes: number) => { const whole = Math.round(minutes), m = whole % 60; return `${Math.floor(whole / 60).toLocaleString()}h${m ? ` ${m}m` : ''}` }

const HEADINGS: Record<ResolutionState, { title: string; empty: string }> = {
  proposed: { title: 'Approve', empty: 'Nothing waiting on approval' },
  waiting: { title: 'Waiting for evidence', empty: 'No entries are waiting for evidence' },
  judgment: { title: 'Needs Judgment', empty: 'Nothing needs a business decision' },
  escalated: { title: 'Escalated', empty: 'Nothing has been escalated' },
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
  const pendingAction = usePendingAction()
  const [submittedCount, setSubmittedCount] = useState(0)
  const saving = pendingAction.inFlight ?? pendingAction.pending
  useEffect(() => {
    if (pendingAction.status !== 'success' || pendingAction.inFlight) return
    const timer = setTimeout(pendingAction.reset, 900)
    return () => clearTimeout(timer)
  }, [pendingAction])
  const undone = state.undone[cycle.id] ?? []
  const { threads } = useJourneyThreads(cycle.server ? cycle.id : '')
  const groups = resolutionGroups(cycle, state.resolutions, undone, threads, state.neverContact ?? [])
  const closed = cycle.statusTag === 'Paid' || new Date() > cycle.deadline
  const key = (group: ResolutionGroup) => `${group.state}:${group.ruleId}:${!!group.approved}`

  async function approve(group: ResolutionGroup) {
    const ids = group.cases.map((item) => item.shiftId)
    if (cycle.server) {
      const match = [...(cycle.groups ?? []), ...(cycle.extraGroups ?? [])].find((item) => item.ruleId === group.ruleId)
      await decide(cycle.id, { groupId: match ? groupId(match) : group.ruleId, decision: 'approved', shiftIds: ids })
      return
    }
    const latest = getOnboarding(), at = new Date().toISOString()
    const decisions = { ...latest.resolutions[cycle.id] }, times = { ...latest.decisionTimes }
    for (const id of ids) { decisions[id] = 'applied'; times[`${cycle.id}:${id}`] = at }
    update({ resolutions: { ...latest.resolutions, [cycle.id]: decisions }, decisionTimes: times })
    toast(`Approved ${ids.length.toLocaleString()} · ${kindLabel(group.ruleId)}`)
    if (RULES.some((rule) => rule.id === group.ruleId)) setLearning({ cycleId: cycle.id, ruleId: group.ruleId, count: ids.length })
  }

  async function resolve(items: ResolutionGroup[], decision: 'approved' | 'escalated') {
    if (saving) return
    setSubmittedCount(items.reduce((total, group) => total + group.cases.length, 0))
    await pendingAction.run(async () => {
      let count = 0
      await Promise.all(items.map(async group => {
        if (cycle.server) {
          // A chat action or another direct click may have decided a later group while we awaited this one.
          const latest = getDataSnapshot().payloads.find(item => item.cycle.id === cycle.id)
          const aliases = [...(latest?.groups ?? cycle.groups ?? []), ...(latest?.extraGroups ?? cycle.extraGroups ?? [])]
          const match = aliases.find(item => item.ruleId === group.ruleId)
          const decisions = latest?.decisions ?? cycle.decisions ?? []
          if (decisions.some(item => item.groupId === group.ruleId || item.groupId === String(match?.id))) return
        }
        if (decision === 'approved') {
          if (cycle.server) await approve(group)
          else void approve(group)
        }
        else if (cycle.server) {
          const match = [...(cycle.groups ?? []), ...(cycle.extraGroups ?? [])].find((item) => item.ruleId === group.ruleId)
          await decide(cycle.id, { groupId: match ? groupId(match) : group.ruleId, decision, shiftIds: group.cases.map((item) => item.shiftId) })
        }
        count += group.cases.length
      }))
      if (items.length > 1) setLearning(null)
      toast(count ? `${decision === 'approved' ? 'Approved' : 'Escalated'} ${count.toLocaleString()}` : 'Already decided; no changes applied')
    }, decision === 'approved' ? 'proposed' : 'judgment', { optimistic: true })
  }

  function undo(group: ResolutionGroup) {
    const latest = getOnboarding()
    update({ undone: { ...latest.undone, [cycle.id]: [...new Set([...(latest.undone[cycle.id] ?? []), group.ruleId])] } })
    toast(`Undid ${group.cases.length.toLocaleString()} ${kindLabel(group.ruleId)} fixes · they now wait for approval`)
  }

  /** A category's one action, shown in its header: it acts on every group in the category. */
  function action(resolution: ResolutionState, items: ResolutionGroup[], count: number) {
    if (!items.length && pendingAction.key !== resolution) return null
    // Approving is the pane's black button only when review is the next step.
    if (resolution === 'proposed') return <ActionButton action={pendingAction} actionKey="proposed" pendingLabel="Approving…" successLabel="Approved" className={!cycle.nextStep || cycle.nextStep.kind === 'review' ? 'primary' : undefined} onClick={() => void resolve(items, 'approved')}>Approve {(pendingAction.key === resolution && pendingAction.status !== 'idle' ? submittedCount : count).toLocaleString()}</ActionButton>
    if (resolution === 'fixed') {
      const undoable = items.filter((group) => !group.approved)
      return cycle.server || closed || !undoable.length ? null : <Btn onClick={() => undoable.forEach(undo)}>Undo All</Btn>
    }
    if (resolution === 'judgment') return <ActionButton action={pendingAction} actionKey="judgment" pendingLabel="Escalating…" successLabel="Escalated" onClick={() => void resolve(items, 'escalated')}>Escalate</ActionButton>
    return null
  }

  function line(group: ResolutionGroup) {
    const note = group.cases[0].note
    const detail = group.cases.length === 1 ? note : `${note.replace(/\.$/, '')}, and ${(group.cases.length - 1).toLocaleString()} more like it${note.endsWith('.') ? '.' : ''}`
    if (group.state === 'waiting') return group.asked ? `Asked ${group.asked} to confirm the hours worked · reply due ${shortDate(replyBy(cycle, state))}` : 'Not asked yet'
    if (group.state === 'judgment') return `${note.replace(/\.$/, '')}. Not a Payroll call.`
    if (group.state === 'escalated') return `Escalated · ${group.owner}`
    // D20: a pay-law correction is applied because the law requires it, never on the agent's own authority.
    if (group.state === 'fixed') return group.approved ? `${actionFor(group.ruleId)} · approved by you`
      : requiredByLaw(group.ruleId) ? `${lawLabel(group.ruleId)} · Required by law · applied` : `${actionFor(group.ruleId)} · by the agent`
    if (group.state === 'proposed') return `${proposalFor(group.ruleId)} · ${detail.replace(/\.$/, '')}`
    return detail
  }

  const clients = new Map<string, { workers: Set<string>; entries: number; minutes: number; current: number; resolved: number }>()
  for (const rs of cycle.run.shifts) {
    const current = clients.get(rs.shift.fac.name) ?? { workers: new Set(), entries: 0, minutes: 0, current: 0, resolved: 0 }
    current.workers.add(rs.shift.worker)
    current.entries += 1
    current.minutes += journeyShiftMinutes(rs)
    current.current += rs.naive
    current.resolved += journeyShiftPay(rs)
    clients.set(rs.shift.fac.name, current)
  }

  const learned = learning?.cycleId === cycle.id ? learning : null

  return <div id="payroll-review-list" className="payroll-summary scroll" role="region" tabIndex={-1} aria-label="Review issues">
    {/* Email all: the catch-all send of an issue's time entries, in a panel that slides out on the right. Single cases open the shift view's conversation. */}
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
      if (!items.length && pendingAction.key !== resolution) return null
      return <section key={resolution} aria-labelledby={`summary-${resolution}`}>
        <div className="payroll-summary-head">
          <h3 id={`summary-${resolution}`}>{HEADINGS[resolution].title} · {count.toLocaleString()}</h3>
          <span className="payroll-summary-head-end">
            {resolution === 'fixed' && count > 0 && !cycle.server && !closed && <span className="r-note">Undo the agent's fixes until Payroll closes {shortDate(cycle.deadline)}</span>}
            {action(resolution, items, count)}
            {pendingAction.key === resolution && <ActionFeedback action={pendingAction} />}
          </span>
        </div>
        {resolution === 'proposed' && learned && <AutoApproveOffer ruleId={learned.ruleId} count={learned.count}
          onAccept={() => { rememberKind(learned.ruleId); setLearning(null); toast(`Decision remembered for ${kindLabel(learned.ruleId)}`) }}
          onDismiss={() => setLearning(null)} />}
        {items.length === 0 ? <p className="r-note">{HEADINGS[resolution].empty}</p> : items.map((group) => {
          const expanded = open.includes(key(group))
          const toggle = () => setOpen(expanded ? open.filter((item) => item !== key(group)) : [...open, key(group)])
          return <div key={key(group)} className="decision" data-rule={group.ruleId}>
            {/* The whole row expands; its own buttons and links keep their clicks. The chevron stays the keyboard control. */}
            <div className="payroll-summary-row" data-prefetch-cycle={cycle.id} data-prefetch-shift={group.cases[0]?.shiftId} onClick={(event) => { if (!(event.target as Element).closest('button, a')) toggle() }}>
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
                data-prefetch-cycle={cycle.id} data-prefetch-shift={item.shiftId} onClick={(event) => { if (!(event.target as Element).closest('a, button')) navigate(shiftHref(cycle.id, item.shiftId, params, '/payroll')) }}>
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
