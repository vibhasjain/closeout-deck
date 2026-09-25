import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FindingDetail } from '@/components/SampleResult'
import { FormCard } from '@/components/journey/FormCard'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, Tag } from '@/components/ui'
import { hydrate, type CyclePayload, type FindingGroup } from '@/lib/data'
import { decide, groupId, useJourneyCycle, useJourneyThreads, type JourneyThread } from '@/lib/journey'
import type { FindingEvidence } from '@/lib/issueEmail'
import { useOnboarding, type Onboarding } from '@/lib/onboarding'
import { resolutionGroups, type ResolutionGroup } from '@/lib/resolution'
import type { EvidenceRow } from '@/lib/sample'
import './task-findings.css'

export interface CarouselFinding { group: FindingGroup; resolution: ResolutionGroup; asked?: string }

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

/** The CSS has the same 320px cap and contains the scroll track inside the pane. */
// eslint-disable-next-line react-refresh/only-export-components
export function findingsLayout(viewportWidth: number, panePadding = 16, itemCount = 1) {
  const width = Math.max(0, viewportWidth - 2 * panePadding)
  const cardWidth = Math.min(320, width)
  const contentWidth = cardWidth * itemCount + Math.max(0, itemCount - 1) * 12
  const scrollWidth = Math.max(width, contentWidth)
  // The track owns its horizontal overflow; only its clipped viewport contributes to the page.
  const pageWidth = Math.min(width, scrollWidth) + 2 * panePadding
  return { width, cardWidth, contentWidth, scrollWidth, pageWidth, pageOverflow: pageWidth > viewportWidth, scrollSnap: 'x mandatory' as const }
}

// eslint-disable-next-line react-refresh/only-export-components
export function findingEvidence(payload: CyclePayload, item: CarouselFinding): FindingEvidence {
  const cases = item.resolution.cases.flatMap(entry => {
    const shift = payload.week.find(shift => shift.id === entry.shiftId)
    if (!shift) return []
    const rows: EvidenceRow[] = shift.punches.map(punch => {
      const meal = shift.meal && punch.out != null ? Math.max(0, Math.min(punch.out, shift.meal[1]) - Math.max(punch.in, shift.meal[0])) : shift.mealMin ?? 0
      const hours = punch.out == null || !shift.meal && !!shift.mealMin && shift.punches.length > 1 ? null : Math.max(0, punch.out - punch.in - meal) / 60
      return { source: shift.prov.system ?? 'Time entry', start: shift.prov.hoursOnly ? null : punch.in, end: shift.prov.hoursOnly ? null : punch.out,
        meal: shift.meal, hours, note: `${shift.prov.file} · row ${shift.prov.row}` }
    })
    if (shift.vms) rows.push({ source: 'Client-approved', start: null, end: null, meal: null, hours: shift.vms.min / 60 })
    if (shift.geo) rows.push({ source: 'HyperTrack location', start: shift.geo[0], end: shift.geo[1], meal: null, hours: (shift.geo[1] - shift.geo[0]) / 60 })
    return [{ worker: shift.worker, day: shift.day, rows }]
  })
  return { ...item.group, id: item.group.id ?? 0, cases }
}

export function FindingsCard({ cycleId }: { cycleId: string }) {
  const { cycle, loading, error } = useJourneyCycle(cycleId)
  const { threads } = useJourneyThreads(cycleId)
  const [state] = useOnboarding()
  const { openDrawer } = useOverlay()
  const navigate = useNavigate()
  const track = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  if (!cycle) return <div className="journey-findings" role={error ? 'alert' : 'status'}>{error ?? (loading ? 'Loading findings…' : 'Findings are not available.')}</div>
  const items = carouselFindings(cycle, state, threads)
  const index = Math.min(position, Math.max(0, items.length - 1))
  const count = items.length
  const days = hydrate(cycle, state).days

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
    <div className="journey-findings-head"><span>Issues{cycle.sample && <> · <Tag>Sample</Tag></>}</span><span className="tabular-nums" aria-live="polite">{items.length ? index + 1 : 0} of {items.length}</span></div>
    {items.length ? <>
      <div className="journey-carousel-viewport" data-at-start={index === 0} data-at-end={index === items.length - 1}>
        <div className="journey-carousel-track" ref={track} role="list" aria-label="Findings" onScroll={event => {
          const node = event.currentTarget, first = node.children[0] as HTMLElement | undefined
          if (first) setPosition(Math.round(node.scrollLeft / (first.offsetWidth + 12)))
        }}>
          {items.map(item => <article className="journey-finding" key={`${groupId(item.group)}:${item.resolution.state}`} role="listitem" data-state={item.resolution.state}>
            <Tag>{item.resolution.state === 'proposed' ? 'Proposed' : item.resolution.state === 'waiting' ? 'Waiting' : item.resolution.state === 'escalated' ? `Escalated · ${item.resolution.owner}` : 'Needs Judgment'}</Tag>
            <h4>{item.group.title}</h4><p>{item.group.summary}</p>
            <div className="journey-finding-data"><span className="tabular-nums">{item.resolution.cases.length.toLocaleString()} time entries</span>{item.group.amountLabel && <span className="tabular-nums">{item.group.amountLabel}</span>}</div>
            {item.resolution.state === 'waiting' && <p className="journey-asked">{item.asked ? `Asked ${item.asked}` : 'Not asked yet'}</p>}
            <div className="journey-finding-actions">
              {item.resolution.state === 'waiting' && !item.asked && <Btn onClick={() => openDrawer(<FormCard form="gaps" cycleId={cycleId} />, 'Missing time entries')}>Review gaps</Btn>}
              {item.resolution.state === 'proposed' && <Btn className="primary" disabled={pending !== null} onClick={() => void act(item, 'approved')}>{pending === groupId(item.group) ? 'Approving…' : `Approve ${item.resolution.cases.length.toLocaleString()}`}</Btn>}
              {item.resolution.state === 'judgment' && <Btn disabled={pending !== null} onClick={() => void act(item, 'escalated')}>{pending === groupId(item.group) ? 'Escalating…' : 'Escalate'}</Btn>}
              <Btn onClick={() => openDrawer(<FindingDetail finding={findingEvidence(cycle, item)} dayLabel={day => days[day] ?? ''} />, 'Evidence', cycle.sample ? 'Sample' : undefined)}>Evidence</Btn>
            </div>
          </article>)}
        </div>
      </div>
      <div className="journey-carousel-controls"><button type="button" className="icon-btn" aria-label="Previous finding" disabled={index === 0} onClick={() => move(index - 1)}><ChevronLeft size={15} aria-hidden /></button><button type="button" className="icon-btn" aria-label="Next finding" disabled={index === items.length - 1} onClick={() => move(index + 1)}><ChevronRight size={15} aria-hidden /></button></div>
    </> : <p className="r-note">No issues waiting for review.</p>}
    {failure && <p role="alert">{failure}</p>}
    <Btn className="journey-view-issues" onClick={() => navigate(`/payroll?${new URLSearchParams({ cycle: cycleId, step: 'review', filter: 'needs-review' })}`)}>View {count.toLocaleString()} issues</Btn>
  </section>
}
