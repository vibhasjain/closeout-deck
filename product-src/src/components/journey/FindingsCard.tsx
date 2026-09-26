import { SkeletonRegion } from '@/components/Skeleton'
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FindingDetail } from '@/components/SampleResult'
import { gapRows } from '@/components/journey/FormCard'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, PayDelta, Spinner, Tag } from '@/components/ui'
import { money } from '@/bench/engine.js'
import { getDataSnapshot, hydrate, type CyclePayload, type FileRecord, type FindingGroup } from '@/lib/data'
import { kindLabel } from '@/lib/desk'
import { shiftHref } from '@/lib/navigation'
import { decide, groupId, useJourneyCycle, useJourneyThreads, type JourneyThread } from '@/lib/journey'
import type { FindingEvidence } from '@/lib/issueEmail'
import { useOnboarding, type Onboarding } from '@/lib/onboarding'
import { resolutionGroups, type ResolutionGroup } from '@/lib/resolution'
import { findingCounts } from '@/lib/findingCounts'
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
  return resolutionGroups(cycle, state.resolutions, state.undone[cycle.id], threads, state.neverContact ?? []).filter(item => item.state !== 'fixed' || item.approved).sort((a, b) => {
    // An approval keeps its place in the carousel, including after a refresh.
    const rank = { proposed: 0, fixed: 0, waiting: 1, judgment: 2, escalated: 3 }
    return rank[a.state] - rank[b.state] || b.cases.length - a.cases.length
      || groups.findIndex(group => group.ruleId === a.ruleId) - groups.findIndex(group => group.ruleId === b.ruleId)
  }).flatMap(resolution => {
    const group = groups.find(group => group.ruleId === resolution.ruleId)
    if (!group) return []
    return [{ group, resolution, asked: resolution.asked }]
  })
}

/** Each slide fills the clipped card body; the track alone owns horizontal overflow. */
// eslint-disable-next-line react-refresh/only-export-components
export function findingsLayout(viewportWidth: number, panePadding = 16, itemCount = 1) {
  const width = Math.min(560, Math.max(0, viewportWidth - 2 * panePadding))
  const contentWidth = width * itemCount
  const scrollWidth = Math.max(width, contentWidth)
  const pageWidth = width + 2 * panePadding
  return { width, cardWidth: width, contentWidth, scrollWidth, pageWidth, pageOverflow: pageWidth > viewportWidth, scrollSnap: 'x mandatory' as const }
}

/** Follow the active slide's natural height, including wrapping and asynchronously updated content. */
// eslint-disable-next-line react-refresh/only-export-components
export function observeFindingHeight(node: HTMLElement, position: number): (() => void) | undefined {
  const slide = node.children[Math.min(position, node.children.length - 1)] as HTMLElement | undefined
  if (!slide) return
  const measure = () => {
    const height = Math.ceil(slide.getBoundingClientRect().height)
    if (height > 0) node.style.height = `${height}px`
  }
  measure()
  if (typeof ResizeObserver === 'undefined') return
  const observer = new ResizeObserver(measure)
  observer.observe(slide)
  return () => observer.disconnect()
}

/** Small replacement seam for the shared pending-action button. Labels reserve the same width. */
function CardAction({ pending = false, done = false, pendingLabel = 'Approving…', doneLabel = 'Approved ✓', children, className, disabled, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean; done?: boolean; pendingLabel?: string; doneLabel?: string }) {
  const label = pending ? <><Spinner />{pendingLabel}</> : done ? doneLabel : children
  return <Btn {...props} className={className} disabled={disabled || pending || done} aria-busy={pending || undefined}>
    <span className="journey-action-label">
      <span>{label}</span>
      {props.onClick && pendingLabel && <span className="journey-action-measure" aria-hidden><Spinner />{pendingLabel}</span>}
      {props.onClick && doneLabel && <span className="journey-action-measure" aria-hidden>{doneLabel}</span>}
      <span className="journey-action-measure" aria-hidden>{children}</span>
    </span>
  </Btn>
}

/** Keep the visible position in sync with the selected slide and its disabled arrows. */
function CarouselPosition({ current, total }: { current: number; total: number }) {
  return <span className="tabular-nums" aria-live="polite">{current} of {total}</span>
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

/** `live`: only the newest actionable card gets the pane's black next-step button. */
export function FindingsCard({ cycleId, live = true }: { cycleId: string; live?: boolean }) {
  const { cycle, loading, empty, error } = useJourneyCycle(cycleId)
  const { threads } = useJourneyThreads(cycleId)
  const [state] = useOnboarding()
  const { openDrawer } = useOverlay()
  const navigate = useNavigate()
  const track = useRef<HTMLDivElement>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const requestVersion = useRef(0)
  const navigationVersion = useRef(0)
  const [position, setPosition] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => () => { clearTimeout(advanceTimer.current); requestVersion.current++ }, [cycleId])
  useLayoutEffect(() => {
    if (track.current) return observeFindingHeight(track.current, position)
  }, [cycle, position, state, threads])
  if (!cycle) return loading && !error ? <SkeletonRegion className="journey-findings" /> : <div className="journey-findings" role={error ? 'alert' : 'status'}>{error ?? (empty ? 'No time entries yet' : 'Findings are not available.')}</div>
  const items = carouselFindings(cycle, state, threads)
  const index = Math.min(position, Math.max(0, items.length - 1))
  const counts = findingCounts(items.map(item => item.resolution))
  const days = hydrate(cycle, state).days
  const primary = live && (!cycle.nextStep || cycle.nextStep.kind === 'review')

  function cancelAdvance() {
    clearTimeout(advanceTimer.current)
    navigationVersion.current++
  }
  function move(next: number, instant = false) {
    cancelAdvance()
    const node = track.current
    const target = node?.children[next] as HTMLElement | undefined
    if (!node || !target) return
    // Keep arrow-key navigation usable when the focused action's slide becomes inert.
    if (typeof document !== 'undefined' && node.contains(document.activeElement)) node.focus({ preventScroll: true })
    node.scrollTo({ left: target.offsetLeft - (node.children[0] as HTMLElement).offsetLeft,
      behavior: instant || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    setPosition(next)
  }
  async function act(item: CarouselFinding, decision: 'approved' | 'escalated') {
    const id = groupId(item.group), version = ++requestVersion.current
    const navigation = navigationVersion.current
    clearTimeout(advanceTimer.current)
    setPending(id); setFailure(null)
    try {
      const result = await decide(cycleId, { groupId: id, decision, shiftIds: item.resolution.cases.map(entry => entry.shiftId) })
      if (version !== requestVersion.current) return
      if (decision === 'approved' && navigation === navigationVersion.current) {
        // Partial pane approvals can merge into one group. Keep the approved issue in view.
        const approvedIndex = carouselFindings(result.cycle, state, threads).findIndex(entry => groupId(entry.group) === id && entry.resolution.approved)
        if (approvedIndex >= 0) move(approvedIndex, true)
        advanceTimer.current = setTimeout(() => {
          const slides = Array.from(track.current?.children ?? []) as HTMLElement[]
          const at = slides.findIndex(slide => slide.dataset.issue === id && slide.dataset.state === 'fixed')
          // Skip waiting evidence and completed decisions; wrap to an earlier undecided issue.
          const next = slides.map((_, offset) => (at + offset + 1) % slides.length)
            .find(candidate => ['proposed', 'judgment'].includes(slides[candidate].dataset.state ?? ''))
          if (next !== undefined) move(next)
        }, 800)
      }
    } catch (error) {
      if (version === requestVersion.current) setFailure(error instanceof Error ? error.message : 'The decision could not be saved.')
    } finally { if (version === requestVersion.current) setPending(null) }
  }

  return <section className="journey-findings" aria-label="Closeout findings" aria-roledescription="carousel" onKeyDown={event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    move(Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1))))
  }}>
    <header className="journey-findings-header">
      <div className="journey-findings-head">
        <h3>Issues{cycle.sample && <Tag>Sample</Tag>}</h3>
        <div className="journey-carousel-controls">
          <CarouselPosition current={items.length ? index + 1 : 0} total={items.length} />
          <button type="button" className="icon-btn" aria-label="Previous finding" disabled={index === 0} onClick={() => move(index - 1)}><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" className="icon-btn" aria-label="Next finding" disabled={!items.length || index === items.length - 1} onClick={() => move(index + 1)}><ChevronRight size={16} aria-hidden /></button>
        </div>
      </div>
      <FindingCountSummary counts={counts} className="journey-findings-counts" />
    </header>
    {items.length ? <div className="journey-carousel-track" ref={track} role="list" aria-label="Issues" tabIndex={0} onPointerDown={cancelAdvance} onWheel={cancelAdvance} onScroll={event => {
      const node = event.currentTarget
      if (node.clientWidth) setPosition(Math.max(0, Math.min(items.length - 1, Math.round(node.scrollLeft / node.clientWidth))))
    }}>
      {items.map((item, at) => {
        const approved = item.resolution.state === 'fixed' && item.resolution.approved
        const escalated = item.resolution.state === 'escalated'
        const deciding = pending === groupId(item.group)
        const status = approved ? 'Approved by you' : escalated ? `Escalated to ${item.resolution.owner ?? 'review owner'}` : item.asked
          ? `Asked ${item.asked}${threads.some(thread => thread.counterparty.name === item.asked && thread.messages.some(message => message.dir === 'out' && message.status === 'not_sent_demo')) ? ' · Not Sent · Demo' : ''}`
          : 'Not asked yet'
        return <article className="journey-finding" key={`${groupId(item.group)}:${item.resolution.cases.map(entry => entry.shiftId).join(',')}`} role="listitem" aria-label={`${at + 1} of ${items.length}: ${item.group.title}`} data-issue={groupId(item.group)} data-state={item.resolution.state} data-active={at === index} inert={at !== index}>
          <Tag>{approved ? 'Approved' : item.resolution.state === 'proposed' ? 'Proposed' : item.resolution.state === 'waiting' ? 'Waiting' : escalated ? 'Escalated' : 'Needs Judgment'}</Tag>
          <h4>{item.group.title}</h4>
          <p className="journey-finding-description">{item.group.summary}</p>
          <PayDelta current={item.resolution.current} resolved={item.resolution.resolved} timeEntries={item.resolution.cases.length} size="sm" align="start" />
          <p className="journey-finding-status" role={at === index ? 'status' : undefined}><span className="journey-status-dot" aria-hidden />{status}</p>
          <div className="journey-finding-actions">
            {item.resolution.state === 'waiting' && <CardAction pendingLabel="" doneLabel="" onClick={() => navigate(shiftHref(cycleId, item.resolution.cases[0].shiftId))}>View time entry</CardAction>}
            {(item.resolution.state === 'proposed' || approved) && <CardAction className={primary && at === index && !approved ? 'primary' : undefined} pending={deciding} done={approved} disabled={pending !== null} onClick={() => void act(item, 'approved')}>Approve {item.resolution.cases.length.toLocaleString()}</CardAction>}
            {(item.resolution.state === 'judgment' || escalated) && <CardAction className={primary && at === index && !escalated ? 'primary' : undefined} pending={deciding} done={escalated} pendingLabel="Escalating…" doneLabel="Escalated ✓" disabled={pending !== null} onClick={() => void act(item, 'escalated')}>Escalate</CardAction>}
            <CardAction pendingLabel="" doneLabel="" onClick={() => openDrawer(<FindingDetail finding={findingEvidence(cycle, item, getDataSnapshot().files)} dayLabel={day => days[day] ?? ''} />, 'Evidence', cycle.sample ? 'Sample' : undefined)}>Evidence</CardAction>
          </div>
        </article>
      })}
    </div> : <p className="r-note">No issues waiting for review.</p>}
    {failure && <p role="alert">{failure}</p>}
    <footer className="journey-findings-footer"><CardAction className="journey-view-issues" pendingLabel="" doneLabel="" onClick={() => navigate(`/payroll?${new URLSearchParams({ cycle: cycleId, step: 'review', filter: 'needs-review' })}`)}>View all {items.length} issues →</CardAction></footer>
  </section>
}
