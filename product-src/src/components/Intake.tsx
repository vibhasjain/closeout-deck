import { useRef, useState } from 'react'
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
import './intake.css'

const REASONS = ['No-show', 'Shift cancelled', 'Other']
const md = (d: Date) => `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`
const supervisorAt = (client: string) => Object.values(CLIENTS).find((item) => item.name === client)?.supervisor ?? 'the site supervisor'
const threadKey = (cycleId: string, id: string) => `intake:${cycleId}:${id}`

/** Step 1 of a pay cycle: did the expected time arrive, client by client. */
export function Intake({ cycle, intake }: { cycle: DeskCycle; intake: IntakeData }) {
  const [state, update] = useOnboarding()
  const { toast } = useOverlay()
  const [closing, setClosing] = useState<{ id: string; chip: string; text: string } | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<SourceIntake | null>(null)
  const now = new Date()
  const waiting = intake.clients.filter((client) => client.open > 0)
  const complete = intake.clients.filter((client) => client.open === 0)

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
    const who = gap.onSite ? supervisorAt(gap.client) : initial(gap.worker)
    const note = activity(gap.id)
    const form = closing?.id === gap.id ? closing : null
    const reason = form ? (form.chip === 'Other' ? form.text.trim() : [form.chip, form.text.trim()].filter(Boolean).join(' · ')) : ''
    return <li key={gap.id} className="intake-gap">
      <div className="intake-gap-text">
        <span>{initial(gap.worker)} · {md(dayOf(gap.day))} · no time entry</span>
        <span className="r-note">{gap.onSite ? `HyperTrack location shows ${fmtHM(gap.onSite)} on site` : 'Scheduled, no punches'}</span>
        {note && <span className="intake-agent">{note}</span>}
      </div>
      <div className="intake-gap-actions">
        <Btn onClick={() => ask(gap, who)}>{gap.onSite ? 'Ask Supervisor' : 'Ask Worker'}</Btn>
        <Btn aria-expanded={!!form} onClick={() => setClosing(form ? null : { id: gap.id, chip: '', text: '' })}>Not Worked</Btn>
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
    return <>
      {row.pending > 0 && <li className="intake-gap">
        <div className="intake-gap-text">
          <span>{row.late ? `No export since ${dayTime(row.lastReceived)}.` : `${row.pending} not in yet.`} Usually arrives {usually(row.source.sends ?? { at: 0 })}.</span>
          {note && <span className="intake-agent">{note}</span>}
        </div>
        <div className="intake-gap-actions">
          <Btn onClick={() => { addNote(threadKey(cycle.id, row.source.id), 'agent', 'Nudged the site'); toast(`Nudged ${client}`) }}>Nudge Site</Btn>
          <Btn onClick={() => { setUploading(row); upload.current?.click() }}>Upload</Btn>
        </div>
      </li>}
      {row.missing.map(missingRow)}
    </>
  }

  function received(files: FileList | null) {
    if (!files?.length || !uploading) return
    const names = Array.from(files, (file) => file.name)
    update({ uploads: { ...state.uploads, [gapKey(cycle.id, uploading.source.id)]: { files: names, entries: uploading.pending } } })
    toast(`${names.join(', ')} · ${uploading.pending} time entries in`)
    setUploading(null)
  }

  return <div className="intake scroll">
    {waiting.length > 0 ? <section aria-label="Still waiting on">
      {waiting.map((client) => <div key={client.name} className="intake-client">
        <div className="intake-client-head"><b>{client.name}</b><span className="num">{(client.expected - client.received).toLocaleString()} Pending</span></div>
        <ul className="intake-sources">{client.sources.filter((row) => row.pending || row.missing.length).map((row) => <li key={row.source.id} className="intake-source">
          <div className="intake-source-head"><VendorTile vendor={row.source} /><span>{row.source.name}</span><span className="r-note">{vendorMethod(row.source.method)}</span></div>
          <ul className="intake-gaps">{sourceRows(client.name, row)}</ul>
        </li>)}</ul>
      </div>)}
    </section> : <p className="intake-done"><Check size={14} aria-hidden />Everything's in</p>}

    {intake.closed.length > 0 && <details className="intake-fold">
      <summary><ChevronRight size={14} aria-hidden />{intake.closed.length} closed as not worked</summary>
      <ul>{intake.closed.map((gap) => <li key={gap.id}>
        <span>{initial(gap.worker)} · {md(dayOf(gap.day))} · {gap.reason}</span>
        <Btn className="ghost" onClick={() => reopen(gap.id)}>Undo</Btn>
      </li>)}</ul>
    </details>}

    {waiting.length > 0 && complete.length > 0 && <details className="intake-fold">
      <summary><ChevronRight size={14} aria-hidden /><Check size={14} aria-hidden className="intake-ok" />{complete.length} {complete.length === 1 ? 'client' : 'clients'} complete</summary>
      <ul>{complete.flatMap((client) => client.sources.map((row) => <li key={`${client.name}-${row.source.id}`}>
        <span><b>{client.name}</b> · {row.source.name}</span>
        <span className="r-note">Last received {dayTime(row.lastReceived)}</span>
      </li>))}</ul>
    </details>}

    <input ref={upload} hidden type="file" accept=".csv,.xlsx,.xls,.pdf" aria-label="Upload a time export"
      onChange={(event) => { received(event.target.files); event.target.value = '' }} />
  </div>
}
