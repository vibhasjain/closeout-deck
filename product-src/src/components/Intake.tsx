import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { fmtHM } from '@/bench/engine.js'
import { VendorTile, vendorMethod } from '@/components/SourcesTable'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, Chip } from '@/components/ui'
import { titleCase } from '@/lib/utils'
import type { DeskCycle } from '@/lib/desk'
import { ago, dayTime, gapKey, initial, usually, type Gap, type Intake as IntakeData, type SourceIntake } from '@/lib/intake'
import { addNote, useOnboarding } from '@/lib/onboarding'
import { CLIENTS } from '@/lib/sample'
import { uploadFile } from '@/lib/data'
import { INGEST_RESULT_EVENT, postToChat } from '@/lib/chatBus'
import type { IngestEvent } from '@/lib/chat'
import './intake.css'

const REASONS = ['No-show', 'Shift cancelled', 'Other']
const md = (d: Date) => `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`
const supervisorAt = (cycle: DeskCycle, client: string) => cycle.sites?.find((item) => item.name === client)?.supervisor?.name ?? Object.values(CLIENTS).find((item) => item.name === client)?.supervisor ?? 'the site supervisor'
const threadKey = (cycleId: string, id: string) => `intake:${cycleId}:${id}`
interface UploadResult { id: string; name: string; rows: number | null; entries: number; status: string; mapping: string; gaps: string[]; sample: boolean }

/** Step 1 of a pay cycle: did the expected time arrive, client by client. */
export function Intake({ cycle, intake }: { cycle: DeskCycle; intake: IntakeData }) {
  const [state, update] = useOnboarding()
  const { toast } = useOverlay()
  const [closing, setClosing] = useState<{ id: string; chip: string; text: string } | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<{ source?: SourceIntake['source']; client?: string } | null>(null)
  const [uploadSet, setUploadSet] = useState<1 | 2>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<UploadResult[]>([])
  const now = new Date()
  const waiting = intake.clients.filter((client) => client.open > 0)
  const complete = intake.clients.filter((client) => client.open === 0)
  const missingSets = cycle.gaps?.filter((gap) => gap.kind === 'set_missing') ?? []
  useEffect(() => {
    const ingest = (event: Event) => {
      const result = (event as CustomEvent<IngestEvent>).detail
      setResults((old) => old.map((file) => file.id !== result.fileId ? file : { ...file, status: result.status,
        rows: result.rows ?? file.rows, entries: result.entries ?? file.entries, mapping: result.status === 'normalized' ? 'Mapped by Closeout Agent' : 'Closeout Agent needs your answer',
        gaps: [...(result.gaps?.map((gap) => gap.ask) ?? []), ...(result.unparsed ? [`${result.unparsed} rows need a closer look`] : []), ...(result.errors ?? [])] }))
    }
    window.addEventListener(INGEST_RESULT_EVENT, ingest)
    return () => window.removeEventListener(INGEST_RESULT_EVENT, ingest)
  }, [])

  /** The newest agent note on this gap, or the sample's first reminder for the late wall clock. */
  function activity(id: string, source?: SourceIntake): string | null {
    const note = state.threads[threadKey(cycle.id, id)]?.at(-1)
    if (note) return `${note.text} ${ago(new Date(note.at), now)} · no reply`
    const reminded = new Date(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate() + 7, 8)
    return source?.late && source.source.id === 'wallclock' && reminded <= now ? `Emailed the site ${dayTime(reminded)} · no reply` : null
  }

  function ask(gap: Gap, who: string) {
    addNote(threadKey(cycle.id, gap.id), 'agent', `Asked ${who}`)
    toast(`Asked ${who} about ${md(dayOf(gap.day))}`)
  }

  function closeGap(gap: Gap, reason: string) {
    update({ acceptedGaps: { ...state.acceptedGaps, [gapKey(cycle.id, gap.id)]: { reason, at: new Date().toISOString() } } })
    setClosing(null)
  }

  function reopen(id: string) {
    update({ acceptedGaps: Object.fromEntries(Object.entries(state.acceptedGaps).filter(([key]) => key !== gapKey(cycle.id, id))) })
  }

  const dayOf = (day: number) => new Date(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate() + day)

  function missingRow(gap: Gap) {
    if (cycle.server) return <li key={gap.id} className="intake-gap">
      <div className="intake-gap-text"><span>{initial(gap.worker)} · {md(dayOf(gap.day))}</span><span className="r-note">Client-approved time entry missing</span></div>
      <Btn disabled={busy} onClick={() => pickMissingSet(2, gap.client)}>Upload client-approved</Btn>
    </li>
    const who = gap.onSite ? supervisorAt(cycle, gap.client) : initial(gap.worker)
    const note = activity(gap.id)
    const form = closing?.id === gap.id ? closing : null
    const reason = form ? (form.chip === 'Other' ? form.text.trim() : [form.chip, form.text.trim()].filter(Boolean).join(' · ')) : ''
    return <li key={gap.id} className="intake-gap">
      <div className="intake-gap-text">
        <span>{initial(gap.worker)} · {md(dayOf(gap.day))} · No Time Entry</span>
        <span className="r-note">{gap.onSite ? `HyperTrack location shows ${fmtHM(gap.onSite)} on site` : 'Scheduled, no punches'}</span>
        {note && <span className="intake-agent">{note}</span>}
      </div>
      <div className="intake-gap-actions">
        <Btn onClick={() => ask(gap, who)}>{gap.onSite ? 'Ask Supervisor' : 'Ask Worker'}</Btn>
        <Btn aria-expanded={!!form} onClick={() => setClosing(form ? null : { id: gap.id, chip: '', text: '' })}>Mark No-Show</Btn>
      </div>
      {form && <form className="intake-reason" aria-label={`Why ${gap.worker} didn't work`}
        onSubmit={(event) => { event.preventDefault(); if (reason) closeGap(gap, reason) }}
        onKeyDown={(event) => { if (event.key === 'Escape') setClosing(null) }}>
        <div className="chip-row" role="group" aria-label="Reason">
          {REASONS.map((chip) => <Chip key={chip} active={form.chip === chip} aria-pressed={form.chip === chip}
            onClick={() => setClosing({ ...form, chip })}>{titleCase(chip)}</Chip>)}
        </div>
        <input className="q-input" value={form.text} autoFocus={form.chip === 'Other'} aria-label="Reason in your words"
          placeholder={form.chip === 'Other' ? 'Say why' : 'Add a note (optional)'} onChange={(event) => setClosing({ ...form, text: event.target.value })} />
        <Btn type="submit" className="primary" disabled={!reason}>Close Gap</Btn>
      </form>}
    </li>
  }

  function sourceRows(client: string, row: SourceIntake) {
    const note = activity(row.source.id, row)
    if (cycle.server && missingSets.some((gap) => cycle.sites?.find((site) => site.key === gap.key.split('|')[0])?.name === client)) return null
    return <>
      {row.pending > 0 && <li className="intake-gap">
        <div className="intake-gap-text">
          <span>{cycle.server ? `${row.pending} client-approved time entries pending.` : <>{row.late ? `No export since ${dayTime(row.lastReceived)}.` : `${row.pending} not in yet.`} Usually arrives {usually(row.source.sends ?? { at: 0 })}.</>}</span>
          {note && <span className="intake-agent">{note}</span>}
        </div>
        <div className="intake-gap-actions">
          {cycle.server ? <Btn disabled={busy} onClick={() => pickMissingSet(2, client)}>Upload client-approved</Btn> : <Btn onClick={() => { addNote(threadKey(cycle.id, row.source.id), 'agent', 'Asked the site'); toast(`Asked ${client}`) }}>Ask Site</Btn>}
        </div>
      </li>}
      {row.missing.map(missingRow)}
    </>
  }

  async function received(files: FileList | null) {
    if (!files?.length || !uploading) return
    const incoming = Array.from(files)
    const target = uploading
    setBusy(true); setError('')
    try {
      for (const file of incoming) {
        const response = await uploadFile(file, { set: target.source?.set === 2 ? 2 : target.source?.set === 1 ? 1 : target.source ? 2 : uploadSet,
          system: target.source?.name ?? 'Spreadsheet', site: target.client })
        const saved = response.file
        setResults((old) => [...old, { id: saved.id, name: saved.name, rows: saved.rows ?? saved.rowCount, entries: saved.entries ?? saved.entryCount ?? 0,
          status: saved.status, sample: saved.sample, mapping: saved.status === 'normalized' ? saved.mappingAuthor === 'library' ? 'Library mapping applied' : saved.mappingAuthor === 'agent' ? 'Closeout Agent mapping applied' : 'Saved mapping applied' : saved.status === 'needs_mapping' ? 'Closeout Agent is reading the layout' : 'Needs a CSV or spreadsheet export',
          gaps: [...saved.gaps.map((gap) => gap.ask), ...saved.unparsed.map((row) => `Row ${row.row}: ${row.reason}`)] }])
        const text = `Uploaded ${saved.name}${target.client ? ` for ${target.client}` : ''}`
        postToChat({ text, mode: saved.status === 'needs_mapping' ? 'ingest' : 'chat',
          context: saved.status === 'needs_mapping' ? { fileIds: [saved.id] } : { page: '/payroll', calendar: {}, selection: { fileIds: [saved.id], cycleId: cycle.id } },
          contextChip: `${target.client ?? target.source?.name ?? 'Time entries'} · ${saved.sample ? 'Sample · ' : ''}${saved.name}` })
        toast(`${saved.name} · ${(saved.entries ?? saved.entryCount ?? 0).toLocaleString()} time entries in`)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The upload failed. Try again.') }
    finally { setBusy(false); setUploading(null) }
  }

  function pickUpload(source?: SourceIntake['source'], client?: string) {
    setUploading({ source, client })
    upload.current?.click()
  }

  function pickMissingSet(set: 1 | 2, client?: string) {
    setUploadSet(set)
    setUploading({ client })
    upload.current?.click()
  }

  return <div className="intake scroll">
    <div className="intake-upload-bar">
      <div className="chip-row" role="group" aria-label="Time entry source">
        <Chip active={uploadSet === 1} aria-pressed={uploadSet === 1} onClick={() => setUploadSet(1)}>Worker-reported</Chip>
        <Chip active={uploadSet === 2} aria-pressed={uploadSet === 2} onClick={() => setUploadSet(2)}>Client-approved</Chip>
      </div>
      <Btn disabled={busy} onClick={() => pickUpload()}>{busy ? 'Uploading…' : 'Upload'}</Btn>
    </div>
    {error && <p role="alert" className="r-note">{error}</p>}
    {results.length > 0 && <ul className="intake-upload-results" aria-label="Upload results" aria-live="polite">{results.map((file) => <li key={file.id}>
      <div><b>{file.name}</b>{file.sample && <span className="tag">Sample</span>}</div>
      <p>{file.rows === null ? 'Rows awaiting mapping' : `${file.rows.toLocaleString()} rows in`} · {file.entries.toLocaleString()} time entries · {file.mapping}</p>
      {file.gaps.length ? <ul>{file.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul> : file.status === 'normalized' && <p className="r-note">No missing facts</p>}
    </li>)}</ul>}
    {missingSets.length > 0 && <ul className="intake-upload-results" aria-label="Missing time sources">{missingSets.map((gap) => {
      const [siteKey, set] = gap.key.split('|')
      const client = cycle.sites?.find((site) => site.key === siteKey)?.name
      return <li key={gap.id}><p>{gap.ask}</p><Btn disabled={busy} onClick={() => pickMissingSet(set === '1' ? 1 : 2, client)}>Upload {set === '1' ? 'worker-reported' : 'client-approved'}</Btn></li>
    })}</ul>}
    {/* Every client keeps its card; a client with everything in is the same card, ghosted. */}
    <section aria-label="Time exports by client">
      {waiting.map((client) => <div key={client.name} className="intake-client">
        <div className="intake-client-head"><b>{client.name}</b><span className="num">{(client.expected - client.received).toLocaleString()} {cycle.server ? 'Client-approved pending' : 'Pending'}</span></div>
        <ul className="intake-sources">{client.sources.filter((row) => row.pending || row.missing.length).map((row) => <li key={row.source.id} className="intake-source">
          <div className="intake-source-head"><VendorTile vendor={row.source} /><span>{row.source.name}</span>{(row.source.sample || cycle.sample) && <span className="tag">Sample</span>}<span className="r-note">{vendorMethod(row.source.method)}</span>{row.source.set !== 3 && <Btn disabled={busy} onClick={() => pickUpload(row.source, client.name)}>Upload</Btn>}</div>
          <ul className="intake-gaps">{sourceRows(client.name, row)}</ul>
        </li>)}</ul>
      </div>)}
      {complete.map((client) => <div key={client.name} className="intake-client intake-client-done">
        <div className="intake-client-head"><b>{client.name}</b><span className="num"><Check size={12} aria-hidden /> {cycle.server ? 'Client-approved in' : 'All In'}</span></div>
        <ul className="intake-sources">{client.sources.map((row) => <li key={row.source.id} className="intake-source">
          <div className="intake-source-head"><VendorTile vendor={row.source} /><span>{row.source.name}</span>{(row.source.sample || cycle.sample) && <span className="tag">Sample</span>}<span className="r-note">Last Received {dayTime(row.lastReceived)}</span>{row.source.set !== 3 && <Btn disabled={busy} onClick={() => pickUpload(row.source, client.name)}>Upload</Btn>}</div>
        </li>)}</ul>
      </div>)}
    </section>

    {intake.closed.length > 0 && <details className="intake-fold">
      <summary><ChevronRight size={14} aria-hidden />{intake.closed.length} closed as not worked</summary>
      <ul>{intake.closed.map((gap) => <li key={gap.id}>
        <span>{initial(gap.worker)} · {md(dayOf(gap.day))} · {gap.reason}</span>
        <Btn className="ghost" onClick={() => reopen(gap.id)}>Undo</Btn>
      </li>)}</ul>
    </details>}

    <input ref={upload} hidden type="file" accept=".csv,.xlsx,.xls,.pdf" aria-label="Upload a time export"
      onChange={(event) => { void received(event.target.files); event.target.value = '' }} />
  </div>
}
