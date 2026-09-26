import { SkeletonRegion } from '@/components/Skeleton'
import { useRef, useState } from 'react'
import { Btn, Chip } from '@/components/ui'
import type { QuestionCard } from '@/lib/chat'
import { uploadFile } from '@/lib/data'
import { postToChat } from '@/lib/chatBus'
import './fact-question.css'

/** The same P6 card contract, presented inline for one missing fact at a time. */
export function FactQuestion({ card, onAnswer }: { card: QuestionCard; onAnswer(answer: string): void }) {
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const answer = [...selected, draft.trim()].filter(Boolean).join('\n')
  async function upload(file: File | undefined) {
    if (!file || uploading) return
    setUploading(true); setError('')
    try {
      const { file: saved } = await uploadFile(file, { set: card.topics.includes('workerHours') ? 1 : 2, system: 'Spreadsheet' })
      postToChat({ text: `Uploaded ${saved.name}`, mode: saved.status === 'needs_mapping' ? 'ingest' : 'chat',
        context: saved.status === 'needs_mapping' ? { fileIds: [saved.id] } : { page: '/payroll', calendar: {}, selection: { fileIds: [saved.id] } },
        contextChip: `${saved.sample ? 'Sample · ' : ''}${saved.name}` })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The upload failed. Try again.') }
    finally { setUploading(false) }
  }
  return <form className="chat-question" onSubmit={(event) => { event.preventDefault(); if (answer) onAnswer(answer) }}>
    {card.input === 'files' && <>
      <input ref={picker} hidden type="file" accept=".csv,.xlsx,.xls,.pdf" aria-label="Upload time entries" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
      {uploading ? <SkeletonRegion /> : <Btn onClick={() => picker.current?.click()}>{card.placeholder || 'Upload time entries'}</Btn>}
    </>}
    {!!card.chips?.length && <div className="chips">{card.chips.map((chip) => <Chip key={chip} active={selected.includes(chip)} aria-pressed={selected.includes(chip)}
      onClick={() => setSelected((old) => card.input === 'multi' ? old.includes(chip) ? old.filter((value) => value !== chip) : [...old, chip] : [chip])}>{chip}</Chip>)}</div>}
    <div className="chat-question-answer">
      <input className="q-input" disabled={uploading} aria-label="Your answer" placeholder={card.input === 'files' ? 'Or tell the Closeout Agent…' : card.placeholder || 'Answer in your own words…'} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Btn type="submit" disabled={!answer || uploading}>Answer</Btn>
    </div>
    {error && <p className="r-note" role="alert">{error}</p>}
  </form>
}
