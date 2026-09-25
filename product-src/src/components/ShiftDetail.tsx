import { type JSX, type ReactNode } from 'react'
import { ArrowUpRight, FileClock, IdCard, MapPin } from 'lucide-react'
import { SOURCES } from '@/bench/vendors'
import { RULES, fmtT, money, type Rule, type RunShift } from '@/bench/engine.js'
import { PROV } from '@/bench/prov'
import { Btn, Kv, Lbl, PayDelta, Tag } from '@/components/ui'
import { useOverlay } from '@/components/shell/Overlay'
import { effectiveResolutions, provenance, type DeskCycle } from '@/lib/desk'
import { useOnboarding } from '@/lib/onboarding'

function openDocument(rule: Rule) {
  const source = PROV[rule.id]
  if (source?.url) {
    window.open(source.url, '_blank', 'noopener,noreferrer')
    return
  }
  const quote = (source?.verbatim ?? source?.summary ?? rule.sentence).replace(/<[^>]+>/g, '')
  const content = [source?.doc ?? rule.source.doc, quote, source?.dates, rule.source.cite].filter(Boolean).join('\n\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** A value prefixed by the mark of the system that reported it. */
function Via({ mark, title, children }: { mark: ReactNode; title: string; children: ReactNode }) {
  return <span className="kv-via" title={title}><span className="kv-via-mark" aria-label={title} role="img">{mark}</span><span>{children}</span></span>
}

/** A rule applied to this payment: what it says, in plain words, and where it comes from. */
export function FiredRule({ row, rule, onOpen }: { row: RunShift['rows'][number]; rule?: Rule; onOpen?: () => void }) {
  const prov = PROV[row.ruleId]
  return <div className="rule-applied">
    <p className="rule-applied-text">{rule?.sentence ?? row.note}</p>
    {onOpen && <Btn className="rule-applied-source" title={prov?.doc ?? rule?.source.doc} onClick={onOpen}><span className="btn-label">{prov?.doc ?? rule?.source.doc ?? 'Source'}</span><ArrowUpRight size={12} aria-hidden="true" className="btn-arrow" /></Btn>}
  </div>
}

export function RuleEvidence({ rule }: { rule: Rule }) {
  const source = PROV[rule.id]
  return <div className="src-entry">
    <Tag className="mono">{rule.id}</Tag>
    <p className="r-sent">{rule.sentence}</p>
    <h6>{source?.doc ?? rule.source.doc}</h6>
    <Lbl>{source?.verbatim ? 'Verbatim · as ingested' : 'Obligation summary · as compiled'}</Lbl>
    {source?.verbatim ? <div className="src-quote" dangerouslySetInnerHTML={{ __html: source.verbatim }} /> : <p className="src-quote">{source?.summary ?? rule.sentence}</p>}
    <Kv rows={[
      ['Effective', source?.dates],
      ...(rule.source.cite ? [['Citation', rule.source.cite] as [string, string]] : []),
    ]} />
    <div className="actions"><Btn className="src-link" onClick={() => openDocument(rule)}>Open Source Document ↗</Btn></div>
  </div>
}

interface ShiftDetailProps {
  cycle: DeskCycle
  rs: RunShift
  primaryRuleId?: string
  showHeading?: boolean
  showSourceAction?: boolean
  /** Rules applied to this payment, only the primary rule's when one is given. The shift page lists them in its own column. */
  showFired?: boolean
  /** Timekeeping only (setup): the rule first, then the times. No rate or payout. */
  timeOnly?: boolean
  /** Replaces the "Rule applied" label, e.g. with the finding's bucket tag. */
  ruleHead?: ReactNode
  onApply?(): void
}

export function ShiftDetail(props: ShiftDetailProps): JSX.Element {
  return <ShiftEvidence key={`${props.cycle.id}:${props.rs.shift.id}`} {...props} />
}


function ShiftEvidence({ cycle, rs, primaryRuleId, showHeading = true, showSourceAction = true, showFired = true, timeOnly = false, ruleHead, onApply }: ShiftDetailProps): JSX.Element {
  const { openDrawer } = useOverlay()
  const [state] = useOnboarding()
  const s = rs.shift
  const decision = effectiveResolutions(cycle, state.resolutions)[cycle.id]?.[s.id]
  const savedReason = state.reasons[`${cycle.id}:${s.id}`]
  const source = provenance(cycle, s, cycle.week.findIndex((shift) => shift.id === s.id))
  const fired = rs.rows.filter((row) => row.status === 'flag' || row.status === 'held' || row.status === 'applied')
  // Each timesheet row carries the mark of the system that reported it.
  const vendor = cycle.server ? undefined : SOURCES.find((candidate) => candidate.sites.includes(s.fac.name) && !candidate.builtin && candidate.id !== 'upload')
  const vendorName = vendor?.short ?? source.system
  const vendorMark = vendor?.tile ? <img src={vendor.tile} alt="" /> : <FileClock size={13} aria-hidden="true" />
  const delta = rs.pay - rs.naive
  const showRule = (rule: Rule) => openDrawer(<RuleEvidence rule={rule} />, rule.id, PROV[rule.id]?.doc ?? rule.source.doc)
  const primaryRule = RULES.find((rule) => rule.id === (primaryRuleId ?? fired[0]?.ruleId))
  const shown = primaryRuleId ? fired.filter((row) => row.ruleId === primaryRuleId) : fired
  const rules = <>
    {showFired && shown.length > 0 && <>{ruleHead ? <div className="rule-head">{ruleHead}</div> : <Lbl className={timeOnly ? undefined : 'mt-4'}>{shown.length === 1 ? 'Rule applied' : 'Rules applied'}</Lbl>}
    {shown.map((row, index) => {
      const rule = RULES.find((candidate) => candidate.id === row.ruleId)
      return <FiredRule key={`${row.ruleId}:${index}`} row={row} rule={rule} onOpen={rule ? () => showRule(rule) : undefined} />
    })}</>}
  </>


  return <div className="shift-evidence">
    <div className="shift-evidence-scroll">
    {(showHeading || source.sample || cycle.sample) && <div className="flex items-center gap-2">
      {showHeading && <div className="count">#{s.id} · {cycle.days[s.day]}</div>}
      {(source.sample || cycle.sample) && <Tag>Sample</Tag>}
    </div>}
    {timeOnly && rules}
    {timeOnly && <Lbl>Time entry</Lbl>}
    <Kv rows={[
      ['Worker', <span key="worker">{s.worker} · {s.role}</span>],
      ['Site', <span key="site">{s.fac.name}<span className="block">{s.fac.city}, {s.fac.state}</span></span>],
      ...(cycle.server ? [['Source', <span key="source">{source.file}{source.sheet ? ` · ${source.sheet}` : ''} · row {source.row}</span>] as [string, ReactNode]] : []),
      ['Scheduled', <Via key="sched" mark={vendorMark} title={`From ${vendorName}`}>{s.sched ? `${fmtT(s.sched[0])} to ${fmtT(s.sched[1])}` : null}</Via>],
      [source.hoursOnly ? 'Reported hours' : 'Punched', <Via key="punched" mark={vendorMark} title={`From ${vendorName}`}>{source.hoursOnly ? `${(rs.payableMin / 60).toLocaleString()}h · clock times not supplied` : <span>{s.punches.map((punch, index) => <span className="block num" key={index}>{fmtT(punch.in)} to {punch.out == null ? '—' : fmtT(punch.out)}</span>)}</span>}</Via>],
      ['Geofence', <Via key="geo" mark={<MapPin size={13} aria-hidden="true" />} title="HyperTrack location">{s.geo ? `${fmtT(s.geo[0])} to ${fmtT(s.geo[1])}` : s.fac.geofence ? 'No location evidence' : 'Not used at this site'}</Via>],
      ['Badge', <Via key="badge" mark={<IdCard size={13} aria-hidden="true" />} title="Door badge">{s.badgeIn != null || s.badgeOut != null ? `${s.badgeIn == null ? '—' : fmtT(s.badgeIn)} to ${s.badgeOut == null ? '—' : fmtT(s.badgeOut)}` : null}</Via>],
      ['Meal break', <Via key="meal" mark={vendorMark} title={`From ${vendorName}`}>{s.meal ? `${fmtT(s.meal[0])} to ${fmtT(s.meal[1])} · ${s.meal[1] - s.meal[0]} min` : s.mealMin != null ? `${s.mealMin} min · break times not supplied` : 'No meal punch'}</Via>],
      ...(timeOnly ? [] : [['Rate', <span className="block num" key="rate">{money(rs.rate)}/h</span>] as [string, ReactNode]]),
    ]} />
    {!timeOnly && rules}
    {decision === 'dismissed' && savedReason && <p className="r-note">Reason: {savedReason}</p>}
    </div>
    {!timeOnly && (Math.abs(delta) >= 0.005 || (!decision && onApply)) && <div className="shift-decide">
    <div className="shift-action-bar">
      <PayDelta current={rs.naive} resolved={rs.pay} size="lg" />
      {((!decision && onApply) || (showSourceAction && primaryRule)) && <div className="actions">
        {onApply && !decision && <Btn className="primary" onClick={onApply}>Approve</Btn>}
        {showSourceAction && primaryRule && <Btn onClick={() => showRule(primaryRule)}>Open Source Document ↗</Btn>}
      </div>}
    </div>
    </div>}
  </div>
}
