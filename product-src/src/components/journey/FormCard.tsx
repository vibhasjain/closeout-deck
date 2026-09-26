/* eslint-disable react-refresh/only-export-components -- Pure form derivations are shared with contract tests. */
import { useEffect, useState, type ChangeEvent } from 'react'
import type { Source } from '@/bench/vendors'
import { ConnectMethod } from '@/components/ConnectMethod'
import { JourneyThreadView } from '@/components/Thread'
import { Btn, Chip, Tag } from '@/components/ui'
import { postToChat } from '@/lib/chatBus'
import { cycleLabel } from '@/lib/cycles'
import { hydrate, type CyclePayload, type CycleSummary } from '@/lib/data'
import { gapId, gapKey } from '@/lib/intake'
import { journeyAdjustments, journeyPayroll } from '@/lib/journeyPay'
import { getOnboarding, useOnboarding, type Onboarding } from '@/lib/onboarding'
import { resolutionGroups } from '@/lib/resolution'
import {
  askGaps, createDispute, downloadBatch, getDisputes, getThreads, refreshThreads, resolveDispute, sendPayroll, simulateDispute, useJourneyCycle, useJourneyThreads,
  type JourneyDispute, type JourneyFormName, type JourneyThread,
} from '@/lib/journey'
import './journey-forms.css'

type Prefill = Record<string, unknown>
/** `live`: this is the newest actionable card in the agent pane; superseded cards keep outline buttons (H3). */
type FormProps = { cycle: CyclePayload; prefill?: Prefill; live?: boolean }
type AskResult = Awaited<ReturnType<typeof askGaps>>
type SendResult = Awaited<ReturnType<typeof sendPayroll>>
const text = (value: unknown) => typeof value === 'string' ? value : ''
const money = (amount: number) => amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'This could not be saved. Try again.'

export interface GapRow { id: string; worker: string; site: string; day: number; kind: 'site' | 'worker'; name: string; blocked: boolean; asked?: boolean }

/** Mirror server summarize/openGaps/counterpartyFor; location-backed gaps ask the site. */
export function gapRows(cycle: CyclePayload, neverContact: readonly string[], accepted: Onboarding['acceptedGaps'] = {}, threads: JourneyThread[] = []): GapRow[] {
  const norm = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const blocked = new Set(neverContact.map(norm).filter(Boolean))
  const received = new Set(cycle.intake.received)
  const asked = new Set(threads.filter(thread => thread.cycleId === cycle.cycle.id
    && !blocked.has(norm(thread.counterparty.name))
    && thread.messages.some(message => message.dir === 'out' && message.status !== 'draft' && message.text.trim()))
    .flatMap(thread => thread.counterparty.gapIds ?? []))
  const rows = new Map<string, GapRow>()
  for (const gap of cycle.intake.expected) {
    const id = gapId(gap)
    const reason = accepted[gapKey(cycle.cycle.id, id)]?.reason
    if (received.has(id) || rows.has(id) || (typeof reason === 'string' && reason.trim())) continue
    const kind = gap.onSite ? 'site' : 'worker'
    const site = cycle.sites.find(site => site.name === gap.client)
    const name = kind === 'site' ? site?.supervisor?.name ?? gap.client : gap.worker
    rows.set(id, { id, worker: gap.worker, site: gap.client, day: gap.day, kind, name,
      blocked: blocked.has(norm(name)) || (kind === 'site' && blocked.has(norm(gap.client))),
      ...(asked.has(id) && !blocked.has(norm(name)) && !(kind === 'site' && blocked.has(norm(gap.client))) ? { asked: true } : {}) })
  }
  return [...rows.values()]
}

/** The export excludes every held entry, including entries with a partial pay value. */
export function batchPreview(cycle: CyclePayload, disputes: JourneyDispute[] = []) {
  const aliases = new Map([...cycle.groups, ...cycle.extraGroups].filter(group => group.id != null).map(group => [String(group.id), group.ruleId]))
  const week = cycle.week.map(shift => ({ ...shift, fac: cycle.sites[shift.fac] }))
  // New detail responses carry the same scoped snapshot used by the ledger and export.
  // Only older payloads need the separate dispute-history fallback.
  const adjustments = cycle.adjustments ?? journeyAdjustments(cycle.cycle.id, disputes)
  const { workers, gross, held } = journeyPayroll(week, cycle.results, (cycle.decisions ?? []).filter(decision => decision.cycleId === cycle.cycle.id), aliases, adjustments)
  return { workers, gross, held }
}

export function openItemLabels(cycle: CyclePayload): string[] {
  const next = cycle.nextStep
  if (!next || next.kind === 'send' || next.kind === 'done') return []
  const labels = [
    next.counts.missingSets ? `${next.counts.missingSets} missing ${next.counts.missingSets === 1 ? 'set' : 'sets'}` : '',
    next.counts.gaps ? `${next.counts.gaps} ${next.counts.gaps === 1 ? 'gap' : 'gaps'} in time entries` : '',
    next.counts.openGroups ? `${next.counts.openGroups} ${next.counts.openGroups === 1 ? 'issue' : 'issues'} to review` : '',
  ].filter(Boolean)
  return labels.length ? labels : [next.detail || next.label]
}

function responseItems(items: Extract<SendResult, { status: 422 }>['open']): string[] {
  if (!items) return []
  return [...items.missingSets.map(set => `Missing set ${set}`), ...items.gaps.map(gap => `Missing time: ${gap.split('|').join(' · ')}`), ...items.groups.map(group => `Review ${group}`)]
}

/** N13: a card from an earlier step or a superseded card stays usable in outline, with a quiet note; never black. */
function StaleNote({ live, current, cycle }: { live: boolean; current: boolean; cycle: CyclePayload }) {
  if (live && current) return null
  return <p className="r-note journey-form-stale">{!current && cycle.nextStep ? `This cycle has moved on: the next step is ${cycle.nextStep.label}.` : 'A newer card below has the current step.'}</p>
}

const localDate = (date: string) => new Date(`${date}T00:00:00`)
const payloadLabel = (cycle: CyclePayload) => cycleLabel({ ...cycle.cycle, start: localDate(cycle.cycle.start), end: localDate(cycle.cycle.end),
  cutoff: localDate(cycle.cycle.cutoff), deadline: localDate(cycle.cycle.deadline), payDate: localDate(cycle.cycle.payDate) })

function FormHeader({ title, sample }: { title: string; sample: boolean }) {
  return <header className="journey-form-head"><h3>{title}</h3>{sample && <Tag>Sample</Tag>}</header>
}

export function FormCard({ form, cycleId, prefill, live = true }: { form: JourneyFormName; cycleId: string; prefill?: Prefill; live?: boolean }) {
  const { cycle, row, loading, empty, error } = useJourneyCycle(cycleId)
  if (form === 'connect') return <ConnectForm key={`${cycleId}:connect`} cycle={cycle} row={row} prefill={prefill} cycleId={cycleId} />
  if (!cycle || (!cycle.runAt && form !== 'dispute')) return <section className="journey-form" aria-label={`${form} form`}>
    <p className="r-note" role={error ? 'alert' : 'status'}>{error || (loading ? 'Loading cycle…' : empty || cycle ? 'No time entries yet. Get timesheets first.' : 'Cycle unavailable.')}</p>
  </section>
  if (form === 'gaps') return <GapsForm key={`${cycleId}:gaps`} cycle={cycle} prefill={prefill} live={live} />
  if (form === 'send') return <SendForm key={`${cycleId}:send`} cycle={cycle} prefill={prefill} live={live} />
  return <DisputeForm key={`${cycleId}:dispute`} cycle={cycle} prefill={prefill} live={live} />
}

/** Every set has time entries and no client is missing one: nothing is missing, so the user picks what to load again. */
export function allSetsIn(cycle?: CyclePayload, row?: CycleSummary): boolean {
  const counts = cycle?.counts ?? row?.counts
  return !!counts?.set1 && !!counts.set2 && !!counts.set3 && !cycle?.gaps.some(gap => gap.kind === 'set_missing')
}

/** Which set the connect card loads: the asked set, else an empty set, else a client missing one set (D2), else client-approved. Never location once every set is in (D2v). */
export function connectTarget(cycle?: CyclePayload, row?: CycleSummary, prefill?: Prefill): { set: 1 | 2 | 3; site: string } {
  const requested = prefill?.set, counts = cycle?.counts ?? row?.counts
  const missing = cycle?.gaps.find(gap => gap.kind === 'set_missing')
  const [siteKey, missingSet] = missing?.key.split('|') ?? []
  const set = requested === 1 || requested === 2 || (requested === 3 && !allSetsIn(cycle, row)) ? requested
    : !counts?.set1 ? 1 : !counts.set2 ? 2 : !counts.set3 ? 3 : missingSet === '1' ? 1 : 2
  const gapSite = missing && Number(missingSet) === set ? cycle?.sites.find(site => site.key === siteKey)?.name ?? '' : ''
  return { set, site: text(prefill?.site) || gapSite }
}

export function ConnectForm({ cycle, row, prefill, cycleId }: { cycle?: CyclePayload; row?: CycleSummary; prefill?: Prefill; cycleId?: string }) {
  // A used card keeps the set it loaded, so it confirms that load instead of jumping to the next missing set.
  const [pinned, setPinned] = useState<ReturnType<typeof connectTarget> | null>(null)
  const [picked, setPicked] = useState<1 | 2 | 3 | null>(null)
  const all = allSetsIn(cycle, row)
  const target = pinned ?? (picked ? { set: picked, site: '' } : connectTarget(cycle, row, prefill)), set = target.set
  const existing = cycle?.intake.sources.find(source => source.set === set && (!target.site || source.site === target.site))
  // ponytail: the simulated connector loads the sample, so its default vendors are the sample's (never a generic "Time entries").
  const system = text(prefill?.system) || existing?.name
    || (set === 3 ? 'HyperTrack location' : set === 1 ? 'Bullhorn' : /lonestar/i.test(target.site) ? 'ADP' : 'UKG')
  const site = target.site || existing?.site || ''
  const vendor: Source = { id: existing?.id ?? `journey-set-${set}`, name: system, short: system, set,
    builtin: set === 3, group: 'Time & attendance', status: 'available', method: 'Simulated',
    sites: site ? [site] : [], pulls: [], lastSync: existing?.lastReceived ?? null }
  return <section className="journey-form journey-connect-form" aria-label="Connect time entries">
    <FormHeader title="Connect time entries" sample />
    {all && !pinned && <>
      <p className="r-note">All three sets are in for this cycle. Pick one to load again.</p>
      <div className="chips" role="group" aria-label="Time entry set">{([[1, 'Worker-reported'], [2, 'Client-approved'], [3, 'Location']] as const).map(([value, label]) =>
        <Chip key={value} active={set === value} aria-pressed={set === value} onClick={() => setPicked(value)}>{label}</Chip>)}</div>
    </>}
    <ConnectMethod key={`${set}:${site}`} vendor={vendor} inline setPicker={!all} cycleId={cycleId ?? cycle?.cycle.id ?? row?.id} onConnect={() => setPinned(target)} />
  </section>
}

export function GapsForm({ cycle, prefill, live = true }: FormProps) {
  const [state] = useOnboarding()
  const { threads, loaded, loading, error: threadError } = useJourneyThreads(cycle.cycle.id)
  const [selection, setSelection] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AskResult | null>(null)
  const rows = gapRows(cycle, [...(state.neverContact ?? []), ...(result?.skipped ?? [])], state.acceptedGaps, [...threads, ...(result?.threads ?? [])])
  const available = rows.filter(row => !row.blocked)
  // A simulated ask records outreach only. Keep the gap visible until reconciled or explicitly closed,
  // and default the next batch to entries that have not already been asked about.
  const unasked = available.filter(row => !row.asked)
  const selectedIds = new Set(selection ?? unasked.slice(0, 200).map(row => row.id))
  const eligible = available.filter(row => selectedIds.has(row.id))
  const people = new Set(eligible.map(row => `${row.kind}|${row.name}`)).size
  // D18: the asked state comes from persisted threads, so it survives a reload.
  const asked = [...new Map([...threads.filter(thread => rows.some(row => row.asked && thread.counterparty.gapIds?.includes(row.id))), ...(result?.threads ?? [])]
    .map(thread => [thread.id, thread])).values()]
  // N6: with nobody left to ask, say why instead of offering "Ask 0 people".
  const nobody = !available.length ? (rows.length ? 'Everyone left to ask is on your never-contact list.' : 'No time entries are missing client-approved hours, so there is nobody to ask.')
    : !unasked.length ? 'Everyone with missing time has been asked. Replies land in each conversation.' : ''
  const current = !cycle.nextStep || cycle.nextStep.kind === 'chase_missing'
  async function submit() {
    if (busy || !loaded || loading || threadError || !eligible.length || eligible.length > 200) return
    setBusy(true); setError('')
    try {
      const next = await askGaps(cycle.cycle.id, { gapIds: eligible.map(row => row.id), ...(text(prefill?.message) ? { message: text(prefill?.message) } : {}) })
      setResult(previous => ({ threads: [...new Map([...(previous?.threads ?? []), ...next.threads].map(thread => [thread.id, thread])).values()], skipped: [...new Set([...(previous?.skipped ?? []), ...next.skipped])] }))
      setSelection(null)
    }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  return <section className="journey-form" aria-label="Chase missing time">
    <FormHeader title="Chase missing time" sample={cycle.sample} />
    <div className="journey-gap-list">
      {rows.map(row => <label className={`journey-gap-row${row.blocked ? ' is-disabled' : ''}`} key={row.id}>
        <input type="checkbox" aria-label={`Ask ${row.name} about ${row.worker} · ${row.site} · Day ${row.day + 1}`} disabled={row.blocked || busy || (!selectedIds.has(row.id) && eligible.length >= 200)}
          checked={!row.blocked && selectedIds.has(row.id)} onChange={event => setSelection(event.target.checked ? [...eligible.map(item => item.id), row.id] : eligible.filter(item => item.id !== row.id).map(item => item.id))} />
        <span><strong>{row.worker}</strong><span className="r-note">{row.site} · Day {row.day + 1}</span><span className="r-note">Ask {row.name}</span></span>
        {row.blocked && <Tag>Never Contact</Tag>}
        {row.asked && <Tag>Asked · Still missing</Tag>}
      </label>)}
    </div>
    {nobody && <p className="r-note" role="status">{nobody}</p>}
    {unasked.length > 200 && <p className="r-note" role="status">Ask about up to 200 time entries at a time. {unasked.length - eligible.length} more remain.</p>}
    {(asked.length > 0 || !!result?.skipped.length) && <div className="journey-form-result" role="status">
      {asked.length > 0 && <p>{asked.length} {asked.length === 1 ? 'conversation' : 'conversations'} created <Tag>Not Sent · Demo</Tag></p>}
      {asked.slice(0, 5).map(thread => <p className="r-note" key={thread.id}>Asked {thread.counterparty.name}</p>)}
      {asked.length > 5 && <p className="r-note">and {(asked.length - 5).toLocaleString()} more</p>}
      {!!result?.skipped.length && <p className="r-note">Skipped: {result.skipped.join(', ')} <Tag>Never Contact</Tag></p>}
    </div>}
    {(unasked.length > 0 || eligible.length > 0) && <>
      <StaleNote live={live} current={current} cycle={cycle} />
      <Btn className={live && current ? 'primary' : undefined} disabled={busy || !loaded || loading || !!threadError || !eligible.length} onClick={() => void submit()}>{busy ? 'Creating asks…' : `Ask ${people} ${people === 1 ? 'person' : 'people'}`}</Btn>
    </>}
    {(error || threadError) && <p className="r-note" role="alert">{error || threadError}{threadError && <> <button type="button" className="lnk" onClick={() => void refreshThreads(cycle.cycle.id)}>Retry conversations</button></>}</p>}
  </section>
}

/** N7: entries still waiting for evidence are paid as reported (never less without evidence); held entries are not paid at all. */
export function waitingPaidAsReported(cycle: CyclePayload, state: Onboarding): number {
  const desk = hydrate(cycle, state)
  const held = new Set(desk.run.shifts.filter(row => row.held).map(row => row.shift.id))
  return new Set(resolutionGroups(desk, state.resolutions, state.undone[cycle.cycle.id]).filter(group => group.state === 'waiting')
    .flatMap(group => group.cases.map(item => item.shiftId)).filter(id => !held.has(id))).size
}

export function SendForm({ cycle, prefill, live = true }: FormProps) {
  const [state] = useOnboarding()
  const [destination, setDestination] = useState(text(prefill?.destination))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SendResult | null>(null)
  const [submittedCycle, setSubmittedCycle] = useState<string | null>(null)
  const [disputes, setDisputes] = useState<JourneyDispute[] | null>(null)
  const [disputeError, setDisputeError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (cycle.adjustments !== undefined || cycle.batch) return
    let active = true
    void getDisputes().then(result => { if (active) { setDisputes(result.disputes); setDisputeError('') } })
      .catch(cause => { if (active) setDisputeError(errorText(cause)) })
    return () => { active = false }
  }, [cycle, retry])
  const batch = result && result.status !== 422 ? result.batch : cycle.batch
  const preview = batch ?? batchPreview(cycle, disputes ?? [])
  const previewReady = cycle.adjustments !== undefined || disputes !== null
  const previewError = cycle.adjustments !== undefined ? '' : disputeError
  // sendPayroll refreshes the shared store before returning; payload identity is never stable.
  const rejection = result?.status === 422 && submittedCycle === cycle.cycle.id
    && (!result.nextStep || result.nextStep.kind === cycle.nextStep?.kind) ? result : null
  const canSend = (rejection?.nextStep?.kind ?? cycle.nextStep?.kind) === 'send'
  const blocked = rejection ? [rejection.reason, ...responseItems(rejection.open)] : openItemLabels(cycle)
  const csvUrl = result?.status === 201 ? result.csvUrl : undefined
  const waiting = batch ? 0 : waitingPaidAsReported(cycle, state)
  async function submit() {
    if (busy || batch || !previewReady || previewError) return
    setBusy(true); setError(''); setSubmittedCycle(cycle.cycle.id)
    try { setResult(await sendPayroll(cycle.cycle.id, destination.trim() ? { destination: destination.trim() } : {})) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  async function download() {
    if (!batch) return
    setBusy(true); setError('')
    try { await downloadBatch(batch.id, csvUrl) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  return <section className="journey-form" aria-label="Send to Payroll">
    <FormHeader title="Send to Payroll" sample={cycle.sample} />
    <dl className="journey-batch-preview">
      <div><dt>Workers</dt><dd className="mono tabular-nums">{preview.workers}</dd></div>
      <div><dt>Gross</dt><dd className="mono tabular-nums">{batch || previewReady ? money(preview.gross) : 'Loading…'}</dd></div>
      <div><dt>Held entries excluded</dt><dd className="mono tabular-nums">{preview.held}</dd></div>
    </dl>
    {batch ? <div className="journey-form-result" role="status">
      {result?.status === 409 && <p>This batch already exists.</p>}
      <p>Sent to {batch.destination} · <Tag>Demo</Tag></p>
      <a className="lnk" href={csvUrl || `#batch-${encodeURIComponent(batch.id)}`} download onClick={event => { event.preventDefault(); if (!busy) void download() }}>Download CSV</a>
    </div> : <>
      <input className="journey-form-input" aria-label="Payroll destination" placeholder="Payroll destination (from profile)" value={destination} maxLength={80} disabled={busy} onChange={event => setDestination(event.target.value)} />
      {!!blocked.length && <ul className="journey-open-items" aria-label="Open items">{[...new Set(blocked)].map(item => <li key={item}>{item}</li>)}</ul>}
      {!cycle.nextStep && <p className="r-note">Waiting for the cycle's next step.</p>}
      {waiting > 0 && <p className="r-note journey-send-waiting">{waiting.toLocaleString()} time {waiting === 1 ? 'entry' : 'entries'} still waiting for evidence {waiting === 1 ? 'is' : 'are'} paid as reported; any correction lands as an adjustment next pay run.</p>}
      {canSend && !live && <StaleNote live={live} current cycle={cycle} />}
      <Btn className={canSend && live ? 'primary' : undefined} disabled={busy || !previewReady || !!previewError} onClick={() => void submit()}>{busy ? 'Creating payroll export…' : 'Send to Payroll'}</Btn>
    </>}
    {!batch && previewError && <p className="r-note" role="alert">{previewError} <button type="button" className="lnk" onClick={() => setRetry(value => value + 1)}>Retry preview</button></p>}
    {error && <p className="r-note" role="alert">{error}</p>}
  </section>
}

/** Cards may express the recommendation in minutes; the form and API use hours. */
export function disputePrefill(prefill?: Prefill) {
  const numeric = (value: unknown, min: number, max: number) => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined
    const number = Number(value)
    return Number.isFinite(number) && number >= min && number <= max ? number : undefined
  }
  const minutes = numeric(prefill?.minutes, 0, 6000)
  const hours = numeric(prefill?.hours, 0, 100) ?? (minutes === undefined ? undefined : minutes / 60)
  const amount = numeric(prefill?.amount, -10_000, 10_000)
  return { hours: hours === undefined ? '' : String(hours), amount: amount === undefined ? '' : String(amount), note: text(prefill?.note).slice(0, 2000) }
}

export function DisputeForm({ cycle, prefill, live = true }: FormProps) {
  const recommendation = disputePrefill(prefill)
  const [worker, setWorker] = useState(text(prefill?.worker))
  const [description, setDescription] = useState(text(prefill?.description))
  const [source, setSource] = useState<'paste' | 'upload'>('paste')
  const [fileName, setFileName] = useState('')
  const [record, setRecord] = useState<{ key: string; dispute: JourneyDispute | null; thread: JourneyThread | null } | null>(null)
  const [hours, setHours] = useState(recommendation.hours)
  const [amount, setAmount] = useState(recommendation.amount)
  const [note, setNote] = useState(recommendation.note)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadFailure, setLoadFailure] = useState<{ key: string; message: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const cycleId = cycle.cycle.id
  const batchId = cycle.batch?.id
  const requestedWorker = text(prefill?.worker).trim()
  const requestedDescription = text(prefill?.description)
  const requestedDispute = text(prefill?.disputeId)
  const requestedHours = recommendation.hours, requestedAmount = recommendation.amount, requestedNote = recommendation.note
  const lookupKey = JSON.stringify([cycleId, batchId, requestedWorker, requestedDescription, requestedDispute, requestedHours, requestedAmount, requestedNote])
  const loaded = record?.key === lookupKey
  const dispute = loaded ? record.dispute : null
  const thread = loaded ? record.thread : null
  const loadError = loadFailure?.key === lookupKey ? loadFailure.message : ''
  useEffect(() => {
    if (!batchId) return
    let active = true
    void Promise.all([getDisputes(), getThreads(cycleId)]).then(([history, conversations]) => {
      if (!active) return
      const existing = history.disputes.filter(item => item.cycleId === cycleId && (!requestedDispute || item.id === requestedDispute) && (!requestedWorker || item.worker === requestedWorker))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0]
      setRecord({ key: lookupKey, dispute: existing ?? null, thread: existing ? conversations.threads.find(item => item.disputeId === existing.id) ?? null : null })
      setWorker(requestedWorker); setDescription(requestedDescription)
      setHours(requestedHours); setAmount(requestedAmount); setNote(requestedNote)
      setLoadFailure(null)
    }).catch(cause => { if (active) setLoadFailure({ key: lookupKey, message: errorText(cause) }) })
    return () => { active = false }
  }, [cycleId, batchId, requestedWorker, requestedDescription, requestedDispute, requestedHours, requestedAmount, requestedNote, lookupKey, retry])
  async function start(simulated: boolean) {
    if (!cycle.batch || !loaded || loadError || dispute || busy || (!simulated && (!worker.trim() || !description.trim()))) return
    setBusy(true); setError('')
    try {
      const result = simulated ? await simulateDispute(cycle.cycle.id)
        : await createDispute({ cycleId: cycle.cycle.id, worker: worker.trim(), description: description.trim(), source })
      setRecord(previous => previous?.key === lookupKey ? { key: lookupKey, dispute: result.dispute, thread: result.thread } : previous)
      // The agent only speaks when someone writes: this turn asks for its recommendation now, like a next-step row.
      const label = payloadLabel(cycle), calendar = getOnboarding()
      postToChat({ text: `Dispute from ${result.dispute.worker} for ${label}: recommend adjust or reject`, contextChip: `Dispute from ${result.dispute.worker} · ${label}`,
        context: { page: '/payroll', calendar: { frequency: calendar.frequency, periodEndDay: calendar.periodEndDay, payDay: calendar.payDay, payDatesOfMonth: calendar.payDatesOfMonth, cutoffDays: calendar.cutoffDays, deadlineDays: calendar.deadlineDays },
          cycle: { id: cycle.cycle.id, label, stats: 'Sent to Payroll' }, selection: { disputeId: result.dispute.id, threadId: result.thread.id, worker: result.dispute.worker } } })
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 8_000) { setError('Use a text source of 2,000 characters or fewer, or paste the relevant passage.'); return }
    setBusy(true); setError('')
    try {
      const contents = await file.text()
      if (!contents.trim() || contents.includes('\u0000')) throw new Error('Use a readable text file, or paste the relevant passage.')
      if (contents.length > 2000) throw new Error('Use a text source of 2,000 characters or fewer, or paste the relevant passage.')
      setDescription(contents); setFileName(file.name); setSource('upload')
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  async function resolve(decision: 'adjust' | 'reject') {
    if (!loaded || loadError || !dispute || busy || !note.trim() || (decision === 'adjust' && !validAdjustment)) return
    setBusy(true); setError('')
    try {
      const result = await resolveDispute(dispute.id, { decision, ...(decision === 'adjust' ? { ...(hours.trim() ? { hours: Number(hours) } : {}), ...(amount.trim() ? { amount: Number(amount) } : {}) } : {}), note: note.trim() })
      setRecord(previous => previous?.key === lookupKey ? { ...previous, dispute: result.dispute, thread: result.thread ?? previous.thread } : previous)
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  const validAdjustment = (Number(hours) > 0 || Number(amount) !== 0) && (!hours.trim() || (Number.isFinite(Number(hours)) && Number(hours) >= 0 && Number(hours) <= 100))
    && (!amount.trim() || (Number.isFinite(Number(amount)) && Number(amount) >= -10_000 && Number(amount) <= 10_000))
  return <section className="journey-form" aria-label="Payroll dispute">
    <FormHeader title="Payroll dispute" sample={cycle.sample || dispute?.source === 'simulated'} />
    {!cycle.batch ? <p className="r-note" role="status">Send this cycle to Payroll before opening a dispute.</p> : loadError ?
      <p className="r-note" role="alert">{loadError} <button type="button" className="lnk" onClick={() => setRetry(value => value + 1)}>Retry disputes</button></p>
      : !loaded ? <p className="r-note" role="status">Loading disputes…</p> : !dispute ? <>
      <input className="journey-form-input" aria-label="Worker" placeholder="Worker" value={worker} maxLength={200} disabled={busy} onChange={event => setWorker(event.target.value)} />
      <textarea className="journey-form-input" aria-label="Dispute description" placeholder="Paste the dispute or describe what happened…" value={description} maxLength={2000} rows={3} disabled={busy}
        onChange={event => { setDescription(event.target.value); setSource('paste'); setFileName('') }} />
      <div className="journey-dispute-source"><label className="journey-upload btn">Upload text<input type="file" accept="text/plain,text/markdown,text/csv,.txt,.md,.csv" aria-label="Upload dispute source" disabled={busy} onChange={event => void upload(event)} /></label>
        <span className="r-note">{fileName || 'Paste or upload a text source'}</span></div>
      <div className="journey-form-actions">
        <Btn className={live && worker.trim() && description.trim() ? 'primary' : undefined} disabled={busy || !worker.trim() || !description.trim()} onClick={() => void start(false)}>Open dispute</Btn>
        <Btn className={live && !(worker.trim() && description.trim()) ? 'primary' : undefined} disabled={busy} onClick={() => void start(true)}>Simulate a dispute</Btn>
        <Tag>Demo</Tag>
      </div>
    </> : <>
      <div className="journey-form-result"><strong>{dispute.worker}</strong><p>{dispute.description}</p><Tag>{dispute.status === 'open' ? 'Open' : dispute.status === 'adjusted' ? 'Adjusted' : 'Rejected'}</Tag></div>
      {thread && <div className="journey-dispute-thread"><JourneyThreadView thread={thread} /></div>}
      {dispute.status === 'open' ? <>
        <div className="journey-adjustment"><input className="journey-form-input mono" type="number" min={0} max={100} step="any" aria-label="Adjustment hours" placeholder="Hours" value={hours} disabled={busy} onChange={event => setHours(event.target.value)} />
          <input className="journey-form-input mono" type="number" min={-10000} max={10000} step="any" aria-label="Adjustment amount" placeholder="Amount" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /></div>
        <input className="journey-form-input" aria-label="Resolution note" placeholder="Resolution note (required)" value={note} maxLength={2000} disabled={busy} onChange={event => setNote(event.target.value)} />
        <div className="journey-form-actions"><Btn className={live ? 'primary' : undefined} disabled={busy || !validAdjustment || !note.trim()} onClick={() => void resolve('adjust')}>Adjust</Btn><Btn disabled={busy || !note.trim()} onClick={() => void resolve('reject')}>Reject</Btn></div>
      </> : <p className="r-note" role="status">{dispute.status === 'adjusted' ? 'Adjustment recorded for the next cycle’s export.' : 'Dispute rejected.'}</p>}
    </>}
    {error && <p className="r-note" role="alert">{error}</p>}
  </section>
}
