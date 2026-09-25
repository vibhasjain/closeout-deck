/* eslint-disable react-refresh/only-export-components -- Pure form derivations are shared with contract tests. */
import { useEffect, useState, type ChangeEvent } from 'react'
import type { Source } from '@/bench/vendors'
import { ConnectMethod } from '@/components/ConnectMethod'
import { JourneyThreadView } from '@/components/Thread'
import { Btn, Tag } from '@/components/ui'
import type { CyclePayload } from '@/lib/data'
import { gapId, gapKey } from '@/lib/intake'
import { journeyPayroll } from '@/lib/journeyPay'
import { useOnboarding, type Onboarding } from '@/lib/onboarding'
import {
  askGaps, createDispute, downloadBatch, getDisputes, refreshThreads, resolveDispute, sendPayroll, simulateDispute, useJourneyCycle, useJourneyThreads,
  type JourneyDispute, type JourneyFormName, type JourneyThread,
} from '@/lib/journey'
import './journey-forms.css'

type Prefill = Record<string, unknown>
type FormProps = { cycle: CyclePayload; prefill?: Prefill }
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
  const asked = new Set(threads.filter(thread => thread.cycleId === cycle.cycle.id).flatMap(thread => thread.counterparty.gapIds ?? []))
  const rows = new Map<string, GapRow>()
  for (const gap of cycle.intake.expected) {
    const id = gapId(gap)
    const reason = accepted[gapKey(cycle.cycle.id, id)]?.reason
    if (received.has(id) || rows.has(id) || (typeof reason === 'string' && reason.trim())) continue
    const kind = gap.onSite ? 'site' : 'worker'
    const site = cycle.sites.find(site => site.name === gap.client)
    const name = kind === 'site' ? site?.supervisor?.name ?? gap.client : gap.worker
    rows.set(id, { id, worker: gap.worker, site: gap.client, day: gap.day, kind, name,
      blocked: blocked.has(norm(name)) || (kind === 'site' && blocked.has(norm(gap.client))), ...(asked.has(id) ? { asked: true } : {}) })
  }
  return [...rows.values()]
}

/** The export excludes every held entry, including entries with a partial pay value. */
export function batchPreview(cycle: CyclePayload, disputes: JourneyDispute[] = []) {
  const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
  const aliases = new Map([...cycle.groups, ...cycle.extraGroups].filter(group => group.id != null).map(group => [String(group.id), group.ruleId]))
  const week = cycle.week.map(shift => ({ ...shift, fac: cycle.sites[shift.fac] }))
  const preview = journeyPayroll(week, cycle.results, (cycle.decisions ?? []).filter(decision => decision.cycleId === cycle.cycle.id), aliases)
  const workers = new Set(week.map(shift => shift.worker))
  let gross = preview.gross
  for (const dispute of disputes) if (dispute.status === 'adjusted' && dispute.adjustment?.next_cycle_id === cycle.cycle.id) {
    workers.add(dispute.worker); gross += cents(dispute.adjustment.amount)
  }
  return { workers: workers.size, gross: cents(gross), held: preview.held }
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

function FormHeader({ title, sample }: { title: string; sample: boolean }) {
  return <header className="journey-form-head"><h3>{title}</h3>{sample && <Tag>Sample</Tag>}</header>
}

export function FormCard({ form, cycleId, prefill }: { form: JourneyFormName; cycleId: string; prefill?: Prefill }) {
  const { cycle, loading, error } = useJourneyCycle(cycleId)
  if (!cycle) return <section className="journey-form" aria-label={`${form} form`}>
    <p className="r-note" role={error ? 'alert' : 'status'}>{error || (loading ? 'Loading cycle…' : 'Cycle unavailable.')}</p>
  </section>
  if (form === 'connect') return <ConnectForm key={`${cycleId}:connect`} cycle={cycle} prefill={prefill} />
  if (form === 'gaps') return <GapsForm key={`${cycleId}:gaps`} cycle={cycle} prefill={prefill} />
  if (form === 'send') return <SendForm key={`${cycleId}:send`} cycle={cycle} prefill={prefill} />
  return <DisputeForm key={`${cycleId}:dispute`} cycle={cycle} prefill={prefill} />
}

export function ConnectForm({ cycle, prefill }: FormProps) {
  const requestedSet = prefill?.set
  const set = requestedSet === 1 || requestedSet === 2 || requestedSet === 3 ? requestedSet
    : cycle.counts.set1 === 0 ? 1 : cycle.counts.set2 === 0 ? 2 : 3
  const existing = cycle.intake.sources.find(source => source.set === set)
  const system = text(prefill?.system) || existing?.name || (set === 3 ? 'HyperTrack location' : 'Time entries')
  const site = text(prefill?.site) || existing?.site || ''
  const vendor: Source = { id: existing?.id ?? `journey-set-${set}`, name: system, short: system, set,
    builtin: set === 3, group: 'Time & attendance', status: 'available', method: 'Simulated',
    sites: site ? [site] : [], pulls: [], lastSync: existing?.lastReceived ?? null }
  return <section className="journey-form journey-connect-form" aria-label="Connect time entries">
    <FormHeader title="Connect time entries" sample />
    <ConnectMethod key={`${vendor.id}:${set}`} vendor={vendor} inline />
  </section>
}

export function GapsForm({ cycle, prefill }: FormProps) {
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
        <input type="checkbox" aria-label={`Ask ${row.name}`} disabled={row.blocked || busy || (!selectedIds.has(row.id) && eligible.length >= 200)}
          checked={!row.blocked && selectedIds.has(row.id)} onChange={event => setSelection(event.target.checked ? [...eligible.map(item => item.id), row.id] : eligible.filter(item => item.id !== row.id).map(item => item.id))} />
        <span><strong>{row.worker}</strong><span className="r-note">{row.site} · Day {row.day + 1}</span><span className="r-note">Ask {row.name}</span></span>
        {row.blocked && <Tag>Never Contact</Tag>}
        {row.asked && <Tag>Asked · Still missing</Tag>}
      </label>)}
      {!rows.length && <p className="r-note">No missing time entries.</p>}
    </div>
    {unasked.length > 200 && <p className="r-note" role="status">Ask about up to 200 time entries at a time. {unasked.length - eligible.length} more remain.</p>}
    {result && <div className="journey-form-result" role="status">
      <p>{result.threads.length} {result.threads.length === 1 ? 'conversation' : 'conversations'} created <Tag>Not Sent · Demo</Tag></p>
      {result.threads.map(thread => <p className="r-note" key={thread.id}>Asked {thread.counterparty.name}</p>)}
      {!!result.skipped?.length && <p className="r-note">Skipped: {result.skipped.join(', ')} <Tag>Never Contact</Tag></p>}
    </div>}
    {(!result || eligible.length > 0) && <Btn className="primary" disabled={busy || !loaded || loading || !!threadError || !eligible.length} onClick={() => void submit()}>{busy ? 'Creating asks…' : `Ask ${people} ${people === 1 ? 'person' : 'people'}`}</Btn>}
    {(error || threadError) && <p className="r-note" role="alert">{error || threadError}{threadError && <> <button type="button" className="lnk" onClick={() => void refreshThreads(cycle.cycle.id)}>Retry conversations</button></>}</p>}
  </section>
}

export function SendForm({ cycle, prefill }: FormProps) {
  const [destination, setDestination] = useState(text(prefill?.destination))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SendResult | null>(null)
  const [submittedCycle, setSubmittedCycle] = useState<CyclePayload | null>(null)
  const [disputes, setDisputes] = useState<JourneyDispute[] | null>(null)
  const [disputeError, setDisputeError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    void getDisputes().then(result => { if (active) { setDisputes(result.disputes); setDisputeError('') } })
      .catch(cause => { if (active) setDisputeError(errorText(cause)) })
    return () => { active = false }
  }, [cycle, retry])
  const batch = result && result.status !== 422 ? result.batch : cycle.batch
  const preview = batch ?? batchPreview(cycle, disputes ?? [])
  const rejection = result?.status === 422 && submittedCycle === cycle ? result : null
  const canSend = (rejection?.nextStep?.kind ?? cycle.nextStep?.kind) === 'send'
  const blocked = rejection ? [rejection.reason, ...responseItems(rejection.open)] : openItemLabels(cycle)
  const csvUrl = result?.status === 201 ? result.csvUrl : undefined
  async function submit() {
    if (busy || batch || !disputes || disputeError) return
    setBusy(true); setError(''); setSubmittedCycle(cycle)
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
      <div><dt>Gross</dt><dd className="mono tabular-nums">{batch || disputes ? money(preview.gross) : 'Loading…'}</dd></div>
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
      <Btn className={canSend ? 'primary' : undefined} disabled={busy || !disputes || !!disputeError} onClick={() => void submit()}>{busy ? 'Creating payroll export…' : 'Send to Payroll'}</Btn>
    </>}
    {!batch && disputeError && <p className="r-note" role="alert">{disputeError} <button type="button" className="lnk" onClick={() => setRetry(value => value + 1)}>Retry preview</button></p>}
    {error && <p className="r-note" role="alert">{error}</p>}
  </section>
}

export function DisputeForm({ cycle, prefill }: FormProps) {
  const [worker, setWorker] = useState(text(prefill?.worker))
  const [description, setDescription] = useState(text(prefill?.description))
  const [source, setSource] = useState<'paste' | 'upload'>('paste')
  const [fileName, setFileName] = useState('')
  const [dispute, setDispute] = useState<JourneyDispute | null>(null)
  const [thread, setThread] = useState<JourneyThread | null>(null)
  const [hours, setHours] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function start(simulated: boolean) {
    if (!cycle.batch || busy || (!simulated && (!worker.trim() || !description.trim()))) return
    setBusy(true); setError('')
    try {
      const result = simulated ? await simulateDispute(cycle.cycle.id)
        : await createDispute({ cycleId: cycle.cycle.id, worker: worker.trim(), description: description.trim(), source })
      setDispute(result.dispute); setThread(result.thread)
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
    if (!dispute || busy || !note.trim() || (decision === 'adjust' && !validAdjustment)) return
    setBusy(true); setError('')
    try {
      const result = await resolveDispute(dispute.id, { decision, ...(decision === 'adjust' ? { ...(hours.trim() ? { hours: Number(hours) } : {}), ...(amount.trim() ? { amount: Number(amount) } : {}) } : {}), note: note.trim() })
      setDispute(result.dispute)
      if (result.thread) setThread(result.thread)
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  const validAdjustment = (Number(hours) > 0 || Number(amount) !== 0) && (!hours.trim() || (Number.isFinite(Number(hours)) && Number(hours) >= 0 && Number(hours) <= 100))
    && (!amount.trim() || (Number.isFinite(Number(amount)) && Number(amount) >= -10_000 && Number(amount) <= 10_000))
  return <section className="journey-form" aria-label="Payroll dispute">
    <FormHeader title="Payroll dispute" sample={cycle.sample || dispute?.source === 'simulated'} />
    {!cycle.batch ? <p className="r-note" role="status">Send this cycle to Payroll before opening a dispute.</p> : !dispute ? <>
      <input className="journey-form-input" aria-label="Worker" placeholder="Worker" value={worker} maxLength={200} disabled={busy} onChange={event => setWorker(event.target.value)} />
      <textarea className="journey-form-input" aria-label="Dispute description" placeholder="Paste the dispute or describe what happened…" value={description} maxLength={2000} rows={3} disabled={busy}
        onChange={event => { setDescription(event.target.value); setSource('paste'); setFileName('') }} />
      <div className="journey-dispute-source"><label className="journey-upload btn">Upload text<input type="file" accept="text/plain,text/markdown,text/csv,.txt,.md,.csv" aria-label="Upload dispute source" disabled={busy} onChange={event => void upload(event)} /></label>
        <span className="r-note">{fileName || 'Paste or upload a text source'}</span></div>
      <div className="journey-form-actions">
        <Btn className={worker.trim() && description.trim() ? 'primary' : undefined} disabled={busy || !worker.trim() || !description.trim()} onClick={() => void start(false)}>Open dispute</Btn>
        <Btn className={worker.trim() && description.trim() ? undefined : 'primary'} disabled={busy} onClick={() => void start(true)}>Simulate a dispute</Btn>
        <Tag>Demo</Tag>
      </div>
    </> : <>
      <div className="journey-form-result"><strong>{dispute.worker}</strong><p>{dispute.description}</p><Tag>{dispute.status === 'open' ? 'Open' : dispute.status === 'adjusted' ? 'Adjusted' : 'Rejected'}</Tag></div>
      {thread && <div className="journey-dispute-thread"><JourneyThreadView thread={thread} /></div>}
      {dispute.status === 'open' ? <>
        <div className="journey-adjustment"><input className="journey-form-input mono" type="number" min={0} max={100} step="any" aria-label="Adjustment hours" placeholder="Hours" value={hours} disabled={busy} onChange={event => setHours(event.target.value)} />
          <input className="journey-form-input mono" type="number" min={-10000} max={10000} step="any" aria-label="Adjustment amount" placeholder="Amount" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /></div>
        <input className="journey-form-input" aria-label="Resolution note" placeholder="Resolution note (required)" value={note} maxLength={2000} disabled={busy} onChange={event => setNote(event.target.value)} />
        <div className="journey-form-actions"><Btn className="primary" disabled={busy || !validAdjustment || !note.trim()} onClick={() => void resolve('adjust')}>Adjust</Btn><Btn disabled={busy || !note.trim()} onClick={() => void resolve('reject')}>Reject</Btn></div>
      </> : <p className="r-note" role="status">{dispute.status === 'adjusted' ? 'Adjustment recorded for the next cycle’s export.' : 'Dispute rejected.'}</p>}
    </>}
    {error && <p className="r-note" role="alert">{error}</p>}
  </section>
}
