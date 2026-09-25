import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Mic, Phone, Upload } from 'lucide-react'
import { ThinkingOrb } from 'thinking-orbs'
import { PayrollCalendar } from '@/components/PayrollCalendar'
import { Btn, Spinner } from '@/components/ui'
import { VOICE_ENABLED } from '@/lib/flags'
import type { QuestionCard } from '@/lib/chat'
import { getOnboarding } from '@/lib/onboarding'
import { uploadOnboardingFiles } from '@/lib/onboardingFlow'

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function TypedQuestion({ text, onDone }: { text: string; onDone(): void }) {
  const [count, setCount] = useState(() => reducedMotion() ? text.length : 0)
  const callback = useRef(onDone)
  useEffect(() => { callback.current = onDone })
  useEffect(() => {
    if (reducedMotion()) { callback.current(); return }
    const start = performance.now()
    const timer = window.setInterval(() => {
      const next = Math.min(text.length, Math.ceil((performance.now() - start) / 650 * text.length))
      setCount(next)
      if (next === text.length) { window.clearInterval(timer); callback.current() }
    }, 16)
    return () => window.clearInterval(timer)
  }, [text])
  return <h1 aria-label={text}><span aria-hidden>{text.slice(0, count)}{count < text.length && <span className="setup-caret" />}</span></h1>
}

/** Input structure and wording come entirely from the agent's validated card. */
export function QuestionScreen({ question, card, initialAnswer = '', busy = false, canBack, canForward = false, onBack, onForward, onAnswer }: {
  question: string; card: QuestionCard; initialAnswer?: string; busy?: boolean; canBack: boolean; canForward?: boolean
  onForward?(): void; onBack(): void; onAnswer(answer: string): void
}) {
  const options = card.chips ?? (card.choice ? [card.choice.yours, card.choice.sample] : [])
  const answeredLines = initialAnswer.split('\n')
  const [draft, setDraft] = useState(() => answeredLines.filter((line) => !options.includes(line)).join('\n'))
  const [selected, setSelected] = useState<string[]>(() => answeredLines.filter((line) => options.includes(line)))
  const [files, setFiles] = useState<string[]>([])
  const [calendarReady, setCalendarReady] = useState(false)
  const [typing, setTyping] = useState(() => !reducedMotion())
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const pendingFiles = useRef<File[]>([])
  const locked = busy || typing || uploading
  const answered = !!(draft.trim() || selected.length || files.length || calendarReady)

  function pick(value: string) {
    if (card.input === 'multi') setSelected((old) => old.includes(value) ? old.filter((item) => item !== value) : [...old, value])
    else setSelected([value])
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (locked || event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement)?.closest('input,textarea,select,[role="dialog"]')) return
      const option = card.chips?.[Number(event.key) - 1]
      if (option && (card.input === 'chips' || card.input === 'multi')) {
        event.preventDefault()
        setSelected((old) => card.input === 'multi' ? old.includes(option) ? old.filter((item) => item !== option) : [...old, option] : [option])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, locked])

  async function upload(incoming: File[]) {
    if (!incoming.length || locked) return
    pendingFiles.current = incoming
    setUploading(true); setUploadError('')
    try { const names = await uploadOnboardingFiles(incoming, undefined, card.topics.includes('workerHours') ? 1 : card.topics.includes('clientHours') ? 2 : undefined); setFiles((old) => [...new Set([...old, ...names])]) }
    catch (error) { setUploadError(error instanceof Error ? error.message : 'The upload failed. Try again.') }
    finally { setUploading(false) }
  }

  function submit() {
    if (!answered || locked) return
    const state = getOnboarding()
    const calendar = calendarReady ? `Pay calendar: ${JSON.stringify({ frequency: state.frequency, periodEndDay: state.periodEndDay, payDay: state.payDay, payDatesOfMonth: state.payDatesOfMonth, cutoffDays: state.cutoffDays, deadlineDays: state.deadlineDays })}` : ''
    onAnswer([...selected, files.length ? `Files: ${files.join(', ')}` : '', calendar, draft.trim()].filter(Boolean).join('\n'))
  }

  return <section className="setup-question">
    <ThinkingOrb size={32} theme="light" state={busy ? 'working' : 'breathing'} />
    <TypedQuestion text={question} onDone={() => setTyping(false)} />
    <form onSubmit={(event) => { event.preventDefault(); submit() }}>
      <fieldset disabled={locked} className="setup-inputs">
        {(card.input === 'chips' || card.input === 'multi') && <div className="setup-chips">{card.chips?.map((chip, index) =>
          <button type="button" key={chip} className={`setup-chip${selected.includes(chip) ? ' selected' : ''}`} aria-pressed={selected.includes(chip)} onClick={() => pick(chip)}>
            <span className="setup-key">{index + 1}</span>{chip}{selected.includes(chip) && <Check size={13} aria-hidden />}
          </button>)}</div>}
        {card.input === 'choice' && card.choice && <div className="setup-choice">{[card.choice.yours, card.choice.sample].map((choice) =>
          <button type="button" key={choice} className={`setup-option${selected.includes(choice) ? ' selected' : ''}`} aria-pressed={selected.includes(choice)} onClick={() => pick(choice)}>{choice}</button>)}</div>}
        {card.input === 'calendar' && <div className="setup-calendar" onChange={() => setCalendarReady(true)}>
          <PayrollCalendar />
          <Btn aria-pressed={calendarReady} onClick={() => setCalendarReady((value) => !value)}>{calendarReady && <Check size={14} aria-hidden />}Use this calendar</Btn>
        </div>}
        {card.input === 'files' && <div className="setup-files">
          <input ref={picker} type="file" multiple hidden aria-label="Choose files" onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
          <button className="setup-drop" type="button" onClick={() => picker.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)) }}>
            {uploading ? <Spinner /> : <Upload size={18} aria-hidden />} {card.placeholder || 'Drop files here, or choose files'}
          </button>
          {files.length > 0 && <ul className="setup-file-list">{files.map((file) => <li key={file}><Check size={13} aria-hidden />{file}</li>)}</ul>}
        </div>}
        <div className="setup-textarea">
          <textarea aria-label="Your answer" placeholder={card.placeholder || 'Answer in your own words…'} value={draft} rows={3} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit() }
          }} />
          {VOICE_ENABLED && <div className="setup-voice"><Btn aria-label="Dictate your answer"><Mic size={16} /></Btn><Btn aria-label="Call your Closeout Agent"><Phone size={16} /></Btn></div>}
        </div>
      </fieldset>
      {uploadError && <div className="setup-error" role="alert"><p>{uploadError}</p><Btn onClick={() => void upload(pendingFiles.current)}>Retry</Btn></div>}
      <footer className="setup-controls">
        <Btn className="ghost" disabled={!canBack || locked} onClick={onBack}><ChevronLeft size={14} aria-hidden />Back</Btn>
        <span />
        {canForward && <Btn disabled={locked} onClick={onForward}>Forward →</Btn>}
        <Btn className="setup-skip" disabled={locked} onClick={() => onAnswer('skip')}>Skip</Btn>
        <Btn type="submit" className={answered && !locked ? 'primary' : ''} disabled={!answered || locked}>Next →</Btn>
      </footer>
    </form>
  </section>
}
