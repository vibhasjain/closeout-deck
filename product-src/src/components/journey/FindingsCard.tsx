import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FindingDetail } from '@/components/SampleResult'
import { ApprovalCard, RollingDigits } from '@/components/beautiful/approval-card'
import { FormCard, gapRows } from '@/components/journey/FormCard'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, PayDelta, Tag } from '@/components/ui'
import { money } from '@/bench/engine.js'
import { getDataSnapshot, hydrate, type CyclePayload, type FileRecord, type FindingGroup } from '@/lib/data'
import { kindLabel } from '@/lib/desk'
import { shiftHref } from '@/lib/navigation'
import { decide, groupId, useJourneyCycle, useJourneyThreads, type JourneyThread } from '@/lib/journey'
import type { FindingEvidence } from '@/lib/issueEmail'
import { useOnboarding, type Onboarding } from '@/lib/onboarding'
import { resolutionGroups, type ResolutionGroup } from '@/lib/resolution'
import { findingCounts } from '@/lib/findingCounts'
import { useTweened } from '@/lib/useTweened'
import type { EvidenceRow } from '@/lib/sample'
import { FindingCountSummary } from './FindingCountSummary'
import './task-findings.css'

export interface CarouselFinding { group: FindingGroup; resolution: ResolutionGroup; asked?: string }

/** N5: the group's money is the pane's own (resolutionGroups, from journeyShiftPay), never the server's billing exposure label. */
// eslint-disable-next-line react-refresh/only-export-components
export function payChange(resolution: Pick<ResolutionGroup, 'current' | 'resolved'>): string {
  const delta = Math.round((resolution.resolved - resolution.current) * 100) / 100
  return `${delta < 0 ? '−' : '+'}${money(Math.abs(delta))} pay change`
}

/** N6: whether any of the group's time entries is an open gap someone could be asked about. */
// eslint-disable-next-line react-refresh/only-export-components
export function hasAskableGaps(payload: CyclePayload, resolution: ResolutionGroup, state: Onboarding, threads: JourneyThread[] = []): boolean {
  const open = new Set(gapRows(payload, state.neverContact ?? [], state.acceptedGaps, threads).filter(row => !row.blocked).map(row => row.id))
  const week = new Map(payload.week.map(shift => [shift.id, shift]))
  return resolution.cases.some(item => { const shift = week.get(item.shiftId); return !!shift && open.has(`${payload.sites[shift.fac]?.name}|${shift.worker}|${shift.day}`) })
}

/** The carousel uses the exact work-pane triage, including its persisted decisions. */
// eslint-disable-next-line react-refresh/only-export-components
export function carouselFindings(payload: CyclePayload, state: Onboarding, threads: JourneyThread[] = []): CarouselFinding[] {
  const cycle = hydrate(payload, state)
  const groups = [...payload.groups, ...payload.extraGroups]
  return resolutionGroups(cycle, state.resolutions, state.undone[cycle.id], threads, state.neverContact ?? []).filter(item => item.state !== 'fixed').flatMap(resolution => {
    const group = groups.find(group => group.ruleId === resolution.ruleId)
    if (!group) return []
    return [{ group, resolution, asked: resolution.asked }]
  })
}

/** J&J's 80% slides (8/9 on phones) retain a glimpse of the next finding. */
// eslint-disable-next-line react-refresh/only-export-components
export function findingsLayout(viewportWidth: number, panePadding = 16, itemCount = 1) {
  const width = Math.max(0, viewportWidth - 2 * panePadding)
  const cardWidth = Math.min(320, Math.max(0, width - 24) * (viewportWidth < 768 ? 8 / 9 : .8))
  const contentWidth = cardWidth * itemCount + Math.max(0, itemCount - 1) * 12
  const scrollWidth = Math.max(width, contentWidth)
  // The track owns its horizontal overflow; only its clipped viewport contributes to the page.
  const pageWidth = Math.min(width, scrollWidth) + 2 * panePadding
  return { width, cardWidth, contentWidth, scrollWidth, pageWidth, pageOverflow: pageWidth > viewportWidth, scrollSnap: 'x mandatory' as const }
}

function FindingCount({ value }: { value: number }) {
  return <span className="tabular-nums">{Math.round(useTweened(value)).toLocaleString()}</span>
}

/** The approval card's rolling step counter; screen readers get the settled text. */
function CarouselPosition({ current, total }: { current: number; total: number }) {
  const text = `${current} of ${total}`
  return <span className="tabular-nums" aria-live="polite"><span className="sr-only">{text}</span><span aria-hidden="true"><RollingDigits value={text} /></span></span>
}

// eslint-disable-next-line react-refresh/only-export-components
export function findingEvidence(payload: CyclePayload, item: CarouselFinding, files: readonly FileRecord[] = []): FindingEvidence {
  const cases = item.resolution.cases.flatMap(entry => {
    const shift = payload.week.find(shift => shift.id === entry.shiftId)
    if (!shift) return []
    const file = files.find(file => file.id === (shift.prov.fileId ?? shift.prov.file))
    const source = payload.intake.sources.find(source => source.id === file?.sourceId)
    // Wire provenance contains a file id; only the file catalogue can turn it into a human reference.
    const fileName = file?.name ?? (/^(?:f|file)_[a-z0-9]+$/i.test(shift.prov.file) ? 'Source file unavailable' : shift.prov.file)
    const date = new Date(`${payload.cycle.start}T00:00:00`)
    date.setDate(date.getDate() + shift.day)
    const reference = { file: fileName, sheet: shift.prov.sheet, row: shift.prov.row, date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    const note = [reference.file, reference.sheet, `row ${reference.row}`, reference.date].filter(Boolean).join(' · ')
    const rows: EvidenceRow[] = shift.punches.map(punch => {
      const meal = shift.meal && punch.out != null ? Math.max(0, Math.min(punch.out, shift.meal[1]) - Math.max(punch.in, shift.meal[0])) : shift.mealMin ?? 0
      const hours = punch.out == null || !shift.meal && !!shift.mealMin && shift.punches.length > 1 ? null : Math.max(0, punch.out - punch.in - meal) / 60
      return { source: source?.short ?? source?.name ?? shift.prov.system ?? 'Time entry', start: shift.prov.hoursOnly ? null : punch.in, end: shift.prov.hoursOnly ? null : punch.out,
        meal: shift.meal, hours, note, reference }
    })
    if (shift.vms) rows.push({ source: 'Client-approved', start: null, end: null, meal: null, hours: shift.vms.min / 60 })
    if (shift.geo) rows.push({ source: 'HyperTrack location', start: shift.geo[0], end: shift.geo[1], meal: null, hours: (shift.geo[1] - shift.geo[0]) / 60 })
    return [{ worker: shift.worker, day: shift.day, rows }]
  })
  // Rules outside the main reconciliation groups carry their rule id as the tag; show its name instead.
  return { ...item.group, tag: item.group.tag === item.group.ruleId ? kindLabel(item.group.ruleId) : item.group.tag, id: item.group.id ?? 0, cases, amountLabel: payChange(item.resolution) }
}

/** `live`: the newest actionable card in the agent pane (H3); only then does the item in view get a black Approve. */
export function FindingsCard({ cycleId, live = true }: { cycleId: string; live?: boolean }) {
  const { cycle, loading, empty, error } = useJourneyCycle(cycleId)
  const { threads } = useJourneyThreads(cycleId)
  const [state] = useOnboarding()
  const { openDrawer } = useOverlay()
  const navigate = useNavigate()
  const track = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  if (!cycle) return <div className="journey-findings" role={error ? 'alert' : 'status'}>{error ?? (loading ? 'Loading findings…' : empty ? 'No time entries yet' : 'Findings are not available.')}</div>
  const items = carouselFindings(cycle, state, threads)
  const askable = new Set(items.filter(item => item.resolution.state === 'waiting' && !item.asked && hasAskableGaps(cycle, item.resolution, state, threads)))
  const index = Math.min(position, Math.max(0, items.length - 1))
  const counts = findingCounts(items.map(item => item.resolution))
  const days = hydrate(cycle, state).days
  // One black button, and only when approving is the cycle's next step.
  const primary = live && (!cycle.nextStep || cycle.nextStep.kind === 'review')

  async function act(item: CarouselFinding, decision: 'approved' | 'escalated') {
    const id = groupId(item.group)
    setPending(id); setFailure(null)
    try { await decide(cycleId, { groupId: id, decision, shiftIds: item.resolution.cases.map(entry => entry.shiftId) }) }
    catch (error) { setFailure(error instanceof Error ? error.message : 'The decision could not be saved.') }
    finally { setPending(null) }
  }
  function move(next: number) {
    const target = track.current?.children[next] as HTMLElement | undefined
    if (!target || !track.current) return
    track.current.scrollTo({ left: target.offsetLeft - (track.current.children[0] as HTMLElement).offsetLeft,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    setPosition(next)
  }

  return <section className="journey-findings" aria-label="Closeout findings">
    <div className="journey-findings-head"><span>Issues{cycle.sample && <> · <Tag>Sample</Tag></>}</span><CarouselPosition current={items.length ? index + 1 : 0} total={items.length} /></div>
    <FindingCountSummary counts={counts} className="journey-findings-counts" />
    {items.length ? <>
      <div className="journey-carousel-band">
      <div className="journey-carousel-viewport" data-at-start={index === 0} data-at-end={index === items.length - 1}>
        <div className="journey-carousel-track" ref={track} role="list" aria-label="Findings" onScroll={event => {
          const node = event.currentTarget, first = node.children[0] as HTMLElement | undefined
          if (first) setPosition(Math.round(node.scrollLeft / (first.offsetWidth + 12)))
        }}>
          {items.map((item, at) => <ApprovalCard className="journey-finding" key={`${groupId(item.group)}:${item.resolution.state}`} role="listitem" data-state={item.resolution.state} data-active={at === index} inert={at !== index} footer={<div className="journey-finding-actions">
              {/* Only missing time uses the gaps form. Other entries open evidence, without promising an ask. */}
              {item.resolution.state === 'waiting' && !item.asked && (askable.has(item)
                ? <Btn onClick={() => openDrawer(<FormCard form="gaps" cycleId={cycleId} />, 'Missing time entries')}>Review gaps</Btn>
                : <Btn onClick={() => navigate(shiftHref(cycleId, item.resolution.cases[0].shiftId))}>View time entry</Btn>)}
              {item.resolution.state === 'proposed' && <Btn className={primary && at === index ? 'primary' : undefined} disabled={pending !== null} onClick={() => void act(item, 'approved')}>{pending === groupId(item.group) ? 'Approving…' : `Approve ${item.resolution.cases.length.toLocaleString()}`}</Btn>}
              {item.resolution.state === 'judgment' && <Btn disabled={pending !== null} onClick={() => void act(item, 'escalated')}>{pending === groupId(item.group) ? 'Escalating…' : 'Escalate'}</Btn>}
              <Btn onClick={() => openDrawer(<FindingDetail finding={findingEvidence(cycle, item, getDataSnapshot().files)} dayLabel={day => days[day] ?? ''} />, 'Evidence', cycle.sample ? 'Sample' : undefined)}>Evidence</Btn>
            </div>}>
            <Tag>{item.resolution.state === 'proposed' ? 'Proposed' : item.resolution.state === 'waiting' ? 'Waiting' : item.resolution.state === 'escalated' ? `Escalated · ${item.resolution.owner}` : 'Needs Judgment'}</Tag>
            <h4>{item.group.title}</h4><p>{item.group.summary}</p>
            <div className="journey-finding-data"><span className="tabular-nums"><FindingCount value={item.resolution.cases.length} /> time {item.resolution.cases.length === 1 ? 'entry' : 'entries'}</span><PayDelta current={item.resolution.current} resolved={item.resolution.resolved} size="sm" /></div>
            {item.resolution.state === 'waiting' && <p className="journey-asked">{item.asked ? `Asked ${item.asked}` : 'Not asked yet'}</p>}
          </ApprovalCard>)}
        </div>
      </div>
      <div className="journey-carousel-controls"><button type="button" className="icon-btn" aria-label="Previous finding" disabled={index === 0} onClick={() => move(index - 1)}><ChevronLeft size={15} aria-hidden /></button><button type="button" className="icon-btn" aria-label="Next finding" disabled={index === items.length - 1} onClick={() => move(index + 1)}><ChevronRight size={15} aria-hidden /></button></div>
      </div>
    </> : <p className="r-note">No issues waiting for review.</p>}
    {failure && <p role="alert">{failure}</p>}
    <Btn className="journey-view-issues" onClick={() => navigate(`/payroll?${new URLSearchParams({ cycle: cycleId, step: 'review', filter: 'needs-review' })}`)}>View all issues</Btn>
  </section>
}
