import { useEffect, useState, type ReactNode } from 'react'
import { Download, X } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { RULES, money, type RunShift } from '@/bench/engine.js'
import { PROV } from '@/bench/prov'
import { AgentTrace, type TraceEntry } from '@/components/AgentTrace'
import { FiredRule, RuleEvidence, ShiftDetail } from '@/components/ShiftDetail'
import { exportShiftRows } from '@/lib/exportShift'
import { Thread } from '@/components/Thread'
import { useSetChatContext, useSetChatSuggestions } from '@/components/chat/ChatPane'
import { useOverlay } from '@/components/shell/Overlay'
import { PageTitle } from '@/components/shell/PageTitle'
import { Btn, Empty, Lbl, PayDelta, Tag } from '@/components/ui'
import { discrepancies, effectiveResolutions, provenance, rowResolution, shortShiftId, topstats, useDesk, type DeskCycle } from '@/lib/desk'
import { decide, groupId } from '@/lib/journey'
import { getDataSnapshot } from '@/lib/data'
import { journeyShiftPay } from '@/lib/journeyPay'
import { getOnboarding, useOnboarding } from '@/lib/onboarding'
import { shiftListHref } from '@/lib/navigation'
import { defaultThreadParty, threadFor } from '@/lib/threads'
import './shift-page.css'

const suggestions = ['Why is the amount what it is?', 'Where did this come from?', 'What changes if I apply it?', 'Make this a rule']

function RecordedTime({ at }: { at?: string }) {
  const date = new Date(at ?? '')
  if (!Number.isFinite(date.getTime())) return <span>Time not recorded</span>
  return <time dateTime={at} title={date.toLocaleString('en-US', { hour12: true })}>{date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })}</time>
}

function ShiftTrail({ cycle, rs, primaryRuleId }: { cycle: DeskCycle; rs: RunShift; primaryRuleId?: string }) {
  const [state] = useOnboarding()
  const { openDrawer } = useOverlay()
  const key = `${cycle.id}:${rs.shift.id}`
  const decision = effectiveResolutions(cycle, state.resolutions)[cycle.id]?.[rs.shift.id]
  const ids = new Set(rs.rows.filter((row) => row.status === 'flag' || row.status === 'held' || row.status === 'applied').map((row) => row.ruleId))
  const rules = RULES.filter((rule) => ids.has(rule.id)).sort((a, b) => Number(b.id === primaryRuleId) - Number(a.id === primaryRuleId))
  const serverDecisions = cycle.server ? (cycle.decisions ?? []).filter((item) => [...ids].some((ruleId) => item.groupId === ruleId
    || [...(cycle.groups ?? []), ...(cycle.extraGroups ?? [])].some((group) => group.ruleId === ruleId && groupId(group) === item.groupId))) : []
  const legacyParty = defaultThreadParty({ ...cycle, rememberedRuleIds: [] }, rs)
  const trail: TraceEntry[] = cycle.server ? serverDecisions.map((item) => ({ at: item.at, action: item.decision === 'escalated' ? 'status' : 'resolved',
    detail: `${item.decision === 'approved' ? 'Payroll adjustment approved' : item.decision === 'dismissed' ? `Issue dismissed · ${item.reason}` : 'Issue escalated'}${rs.held ? ' · Pay remains held' : ''}` })) : (['worker', 'facility'] as const).flatMap((party) => {
    const saved = state.mediation[`${key}:${party}`] ?? (party === legacyParty ? state.mediation[key] : undefined)
    return threadFor(cycle, rs, saved, party).trail
  }).filter((entry, index, all) => entry.action !== 'ingested'
    || all.findIndex((other) => other.action === 'ingested' && other.detail === entry.detail) === index)
  if (decision && !cycle.server) trail.push({
    at: state.decisionTimes[key] ?? '', action: 'resolved',
    detail: decision === 'applied' ? 'Payroll adjustment approved' : 'Payment kept at the current amount',
  })

  if (!trail.length && !decision && !rules.length) return null

  // One entry per rule: the engine can emit several rows for the same rule on one payment.
  const fired = rs.rows.filter((row, index, all) => (row.status === 'flag' || row.status === 'held' || row.status === 'applied')
    && all.findIndex((other) => other.ruleId === row.ruleId) === index)
    .sort((a, b) => Number(b.ruleId === primaryRuleId) - Number(a.ruleId === primaryRuleId))
  return <aside className="shift-page-column" aria-label="Time entry rules and trail">
    <div className="aux-head">Rules Applied</div>
    <div className="shift-page-body scroll">
    {fired.map((row, index) => {
      const rule = rules.find((candidate) => candidate.id === row.ruleId)
      return <FiredRule key={`${row.ruleId}:${index}`} row={row} rule={rule}
        onOpen={rule ? () => openDrawer(<RuleEvidence rule={rule} />, rule.id, PROV[rule.id]?.doc ?? rule.source.doc) : undefined} />
    })}
    {serverDecisions.map((item) => <section key={item.id} className="shift-audit-section" aria-label="Recorded decision">
      <Lbl>Decision</Lbl>
      <Tag>{item.decision === 'approved' ? 'Approved' : item.decision === 'dismissed' ? 'Dismissed' : 'Escalated'}{rs.held ? ' · Still held' : ''}</Tag>
      <p className="shift-audit-time"><RecordedTime at={item.at} /></p>
      {item.decision === 'approved' && <PayDelta current={rs.naive} resolved={journeyShiftPay(rs)} size="sm" />}
      {item.reason && <p className="r-note">{item.reason}</p>}
    </section>)}
    {decision && !cycle.server && <section className="shift-audit-section" aria-label="Recorded decision">
      <Lbl>Decision</Lbl>
        <Tag>{decision === 'applied' ? 'Applied' : 'Not an Issue'}</Tag>
        <p className="shift-audit-time"><RecordedTime at={state.decisionTimes[key]} /></p>
        {decision === 'applied' && <PayDelta current={rs.naive} resolved={rs.pay} size="sm" />}
        {decision === 'dismissed' && <p className="r-note">{state.reasons[key] || 'A reason was not recorded with this earlier decision'}</p>}
    </section>}
    {trail.length > 0 && <section className="shift-audit-section" aria-label="Trail">
      <Lbl>Trail</Lbl>
      <AgentTrace entries={trail} />
    </section>}
    </div>
  </aside>
}

/** The shift reads over the payments table rather than replacing it: a near-fullscreen
 *  surface on a scrim, so the queue behind keeps its scroll position and selected flag. */
function ShiftShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="shift-scrim open" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="shift-modal open" role="dialog" aria-modal="true" aria-label="Time entry">
      <button type="button" className="icon-btn shift-modal-close" aria-label="Close time entry" onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </button>
      {children}
    </section>
  </div>
}

export function ShiftPage() {
  const { shiftId = '' } = useParams<{ shiftId: string }>()
  const [params] = useSearchParams()
  const parent = '/payroll' as const
  const navigate = useNavigate()
  const { current, byId } = useDesk()
  const [state, update] = useOnboarding()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useOverlay()
  const cycle = byId(params.get('cycle') ?? '') ?? current
  const rs = cycle.run.shifts.find(({ shift }) => shift.id === shiftId)
  const flag = params.get('flag') ?? undefined
  const items = discrepancies(cycle, state.resolutions)
  const decisions = effectiveResolutions(cycle, state.resolutions)[cycle.id]
  const back = shiftListHref(cycle.id, params, parent)
  // Closing restores the originating table's selected cycle and controls.
  const close = () => navigate(back)
  const allPayments = shiftListHref(cycle.id, params, '/payroll', true)
  const primaryRuleId = flag ?? items.find((item) => item.shiftId === shiftId)?.ruleId
  const decision = decisions?.[shiftId]
  const pendingRules = [...new Set((rs?.rows ?? []).filter((row) => (row.status === 'flag' || row.status === 'held')
    && !rowResolution(cycle, shiftId, row.ruleId, state.resolutions)).map((row) => row.ruleId))]
  const canDecide = !!rs && !(cycle.server && rs.held) && !decision && (!cycle.server || pendingRules.length > 0) && items.some((item) => item.shiftId === shiftId)
  const groupCases = (ruleId: string) => cycle.run.shifts.filter((item) => item.rows.some((row) => row.ruleId === ruleId && (row.status === 'flag' || row.status === 'held'))).map((item) => item.shift.id)
  const approvalCount = pendingRules.reduce((count, ruleId) => count + groupCases(ruleId).length, 0)

  useSetChatSuggestions(suggestions)
  useSetChatContext({
    page: `${parent}/${shiftId}`, step: 'shift',
    cycle: { id: cycle.id, label: cycle.label, stats: topstats(cycle, state.resolutions) },
    selection: rs ? {
      scope: `shift:${rs.shift.id}`, shiftId: rs.shift.id, ruleId: primaryRuleId, worker: rs.shift.worker,
      site: rs.shift.fac.name, day: cycle.days[rs.shift.day], sheetPay: rs.naive, closeoutPay: journeyShiftPay(rs), held: rs.held,
      scheduled: rs.shift.sched, punches: rs.shift.punches, geofence: rs.shift.geo,
      badgeIn: rs.shift.badgeIn, badgeOut: rs.shift.badgeOut, meal: rs.shift.meal,
      source: provenance(cycle, rs.shift, cycle.week.findIndex(({ id }) => id === rs.shift.id)),
      fired: rs.rows.filter((row) => row.status === 'flag' || row.status === 'held' || row.status === 'applied'),
    } : undefined,
    discrepancies: items.filter((item) => item.shiftId === shiftId),
    rules: RULES.filter((rule) => rs?.rows.some((row) => row.ruleId === rule.id && row.status !== 'na')).map(({ id, sentence }) => ({ id, sentence })),
  })

  async function approve() {
    const latest = getOnboarding()
    if (!rs || saving || (cycle.server && rs.held) || effectiveResolutions(cycle, latest.resolutions)[cycle.id]?.[shiftId]) return
    if (cycle.server) {
      setSaving(true)
      setError(null)
      try {
        let approved = 0
        for (const ruleId of pendingRules) {
          const current = getDataSnapshot().payloads.find(item => item.cycle.id === cycle.id)
          const group = [...(current?.groups ?? cycle.groups ?? []), ...(current?.extraGroups ?? cycle.extraGroups ?? [])].find((item) => item.ruleId === ruleId)
          const id = group ? groupId(group) : ruleId
          if ((current?.decisions ?? cycle.decisions ?? []).some(item => item.groupId === id || item.groupId === String(group?.id))) continue
          await decide(cycle.id, { groupId: id, decision: 'approved', shiftIds: groupCases(ruleId) })
          approved += groupCases(ruleId).length
        }
        toast(approved ? `Approved ${approved.toLocaleString()} issues` : 'Already decided; no changes applied')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'The decision could not be saved.') }
      finally { setSaving(false) }
      return
    }
    const key = `${cycle.id}:${shiftId}`
    update({
      resolutions: { ...latest.resolutions, [cycle.id]: { ...latest.resolutions[cycle.id], [shiftId]: 'applied' } },
      decisionTimes: { ...latest.decisionTimes, [key]: new Date().toISOString() },
    })
    toast(`Applied · #${shortShiftId(shiftId)} · Resolved pay ${money(rs.pay)}`)
  }

  if (!rs) return <ShiftShell onClose={close}><section className="shift-page-missing scroll">
    <PageTitle title="Not found" label="this time entry" description="Open a time entry from the selected pay run to review its details." sub={`#${shortShiftId(shiftId)} is not in ${cycle.label}`} />
    <Empty>This is not in the selected pay cycle <Link className="lnk" to={allPayments}>Back to all payments</Link></Empty>
  </section></ShiftShell>

  return <ShiftShell onClose={close}><div className="shift-page">
    <section className="shift-page-column" aria-label="Time entry evidence">
      <PageTitle title={<>{rs.shift.worker} · {cycle.days[rs.shift.day]}</>} label="this time entry"
        description="Review the evidence, conversation, and decisions for this time entry."
        sub={rs.shift.fac.name}
        right={<>
          {(cycle.sample || cycle.week.find(shift => shift.id === rs.shift.id)?.sample) && <Tag>Sample</Tag>}
          <Btn className="icon-btn sm" aria-label="Export these rows"
            title="Export these rows" onClick={() => exportShiftRows(cycle, rs)}><Download size={14} aria-hidden="true" /></Btn>
        </>} />
      <div className="shift-page-body scroll">
        {error && <p role="alert">{error}</p>}
        {saving && <p className="r-note" role="status">Saving decisions…</p>}
        <ShiftDetail cycle={cycle} rs={rs} primaryRuleId={primaryRuleId} showHeading={false} showSourceAction={false} showFired={false}
          applyLabel={cycle.server ? `Approve ${approvalCount.toLocaleString()} issues` : undefined}
          onApply={canDecide && !saving ? () => void approve() : undefined}
 />
      </div>
    </section>
    <section className="shift-page-column shift-conversation" aria-label="Time entry conversation">
      <Thread cycle={cycle} rs={rs} />
    </section>
    <ShiftTrail cycle={cycle} rs={rs} primaryRuleId={primaryRuleId} />
  </div></ShiftShell>
}
