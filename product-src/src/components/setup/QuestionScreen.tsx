import { SkeletonRegion } from '@/components/Skeleton'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Mic, Phone, Square, Upload } from 'lucide-react'
import { AgentAvatar } from '@/components/chat/AgentAvatar'
import { PayrollCalendar } from '@/components/PayrollCalendar'
import { Btn, Spinner } from '@/components/ui'
import { VOICE_ENABLED } from '@/lib/flags'
import type { QuestionCard } from '@/lib/chat'
import { getOnboarding } from '@/lib/onboarding'
import { useDictation } from '@/lib/useDictation'
import { uploadOnboardingFiles } from '@/lib/onboardingFlow'

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function TypedQuestion({ text, skip, onDone }: { text: string; skip: boolean; onDone(): void }) {
  const [count, setCount] = useState(() => skip || reducedMotion() ? text.length : 0)
  const callback = useRef(onDone)
  useEffect(() => { callback.current = onDone })
  useEffect(() => {
    if (skip || reducedMotion()) { callback.current(); return }
    // J&J StreamingText: the entire question types in 260ms, after a 60ms lead-in.
    const charsPerTick = Math.max(1, Math.ceil(text.length / Math.max(1, Math.round(260 / 16))))
    let visible = 0
    let timer: number
    const tick = () => {
      visible = Math.min(text.length, visible + charsPerTick)
      setCount(visible)
      if (visible === text.length) callback.current()
      else timer = window.setTimeout(tick, 16)
    }
    timer = window.setTimeout(tick, 60)
    return () => window.clearTimeout(timer)
  }, [text, skip])
  return <h1 className="setup-typed-question" aria-label={text}><span className="setup-question-measure" aria-hidden>{text}</span><span aria-hidden>{text.slice(0, count)}<span className={`setup-caret${count === text.length ? ' is-done' : ''}`} /></span></h1>
}

/** Input structure and wording come entirely from the agent's validated card. */
export function QuestionScreen({ question, card, initialAnswer = '', busy = false, canBack, canForward = false, onBack, onForward, onAnswer, onCall }: {
  question: string; card: QuestionCard; initialAnswer?: string; busy?: boolean; canBack: boolean; canForward?: boolean
  onForward?(): void; onBack(): void; onAnswer(answer: string): void; onCall?(): void
}) {
  const options = card.chips ?? (card.choice ? [card.choice.yours, card.choice.sample] : [])
  const answeredLines = initialAnswer.split('\n')
  const [draft, setDraft] = useState(() => answeredLines.filter((line) => !options.includes(line)).join('\n'))
  const dictation = useDictation(draft, setDraft)
  const [selected, setSelected] = useState<string[]>(() => answeredLines.filter((line) => options.includes(line)))
  const [files, setFiles] = useState<string[]>([])
  const [calendarReady, setCalendarReady] = useState(false)
  const [typing, setTyping] = useState(() => !initialAnswer && !reducedMotion())
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const pendingFiles = useRef<File[]>([])
  const locked = busy || typing || uploading || dictation.finishing
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

  function submit(dictated?: string) {
    if ((!answered && !dictated?.trim()) || locked) return
    const state = getOnboarding()
    const calendar = calendarReady ? `Pay calendar: ${JSON.stringify({ frequency: state.frequency, periodEndDay: state.periodEndDay, payDay: state.payDay, payDatesOfMonth: state.payDatesOfMonth, cutoffDays: state.cutoffDays, deadlineDays: state.deadlineDays })}` : ''
    onAnswer([...selected, files.length ? `Files: ${files.join(', ')}` : '', calendar, (dictated ?? draft).trim()].filter(Boolean).join('\n'))
  }

  function submitAnswer() {
    if (dictation.active) void dictation.stop().then(text => submit(text)).catch(() => {})
    else submit()
  }

  return <section className="setup-question">
    <AgentAvatar size={32} working={busy} />
    <TypedQuestion text={question} skip={!!initialAnswer} onDone={() => setTyping(false)} />
    <form data-typing={typing || undefined} onSubmit={(event) => { event.preventDefault(); submitAnswer() }}>
      <fieldset disabled={locked} className="setup-inputs">
        {card.input === 'choice' && card.choice && <div className="setup-choice">{[card.choice.yours, card.choice.sample].map((choice) =>
          <button type="button" key={choice} className={`setup-option${selected.includes(choice) ? ' selected' : ''}`} aria-pressed={selected.includes(choice)} onClick={() => pick(choice)}>{choice}</button>)}</div>}
        {card.input === 'calendar' && <div className="setup-calendar" onChange={() => setCalendarReady(true)}>
          <PayrollCalendar />
          <Btn aria-pressed={calendarReady} onClick={() => setCalendarReady((value) => !value)}>{calendarReady && <Check size={14} aria-hidden />}Use this calendar</Btn>
        </div>}
        {card.input === 'files' && <div className="setup-files">
          <input ref={picker} type="file" multiple hidden aria-label="Choose files" onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
          {uploading ? <SkeletonRegion /> : <button className="setup-drop" type="button" onClick={() => picker.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)) }}>
            <Upload size={18} aria-hidden /> {card.placeholder || 'Drop files here, or choose files'}
          </button>}
          {files.length > 0 && <ul className="setup-file-list">{files.map((file) => <li key={file}><Check size={13} aria-hidden />{file}</li>)}</ul>}
        </div>}
        <div className="setup-textarea">
          <textarea aria-label="Your answer" placeholder={card.placeholder || 'Answer in your own words…'} value={draft} rows={3} readOnly={dictation.active || dictation.finishing} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submitAnswer() }
          }} />
          {VOICE_ENABLED && <div className="setup-voice">{onCall && <Btn aria-label="Call your Closeout Agent" onClick={() => { dictation.dismiss(); onCall() }}><Phone size={16} /></Btn>}<Btn className="setup-dictate" aria-label={dictation.finishing ? 'Finishing dictation' : dictation.active ? 'Stop dictation' : 'Dictate your answer'} aria-pressed={dictation.active} disabled={dictation.finishing} onClick={() => { if (dictation.active) void dictation.stop().catch(() => {}); else dictation.start() }}>{dictation.finishing || dictation.state === 'connecting' ? <Spinner /> : dictation.active ? <Square size={14} fill="currentColor" aria-hidden /> : <Mic size={16} aria-hidden />}</Btn></div>}
        </div>
        {(card.input === 'chips' || card.input === 'multi') && <div className="setup-chips">{card.chips?.map((chip, index) =>
          <button type="button" key={chip} className={`setup-chip${selected.includes(chip) ? ' selected' : ''}`} aria-pressed={selected.includes(chip)} onClick={() => pick(chip)}>
            <span className="setup-key">{index + 1}</span>{chip}{selected.includes(chip) && <Check size={13} aria-hidden />}
          </button>)}</div>}
      </fieldset>
      {dictation.status && <p className="setup-dictate-status" role="status">{dictation.status}</p>}
      {dictation.error && <div className="setup-error" role="alert"><p>{dictation.error}</p><Btn onClick={dictation.start}>Retry</Btn><Btn onClick={dictation.dismiss}>Keep typing</Btn></div>}
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
