import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { usePendingAction } from '@/lib/usePendingAction'
import { Skeleton, SkeletonRegion } from '@/components/Skeleton'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Mic, Phone, Square, Upload } from 'lucide-react'
import { AgentAvatar } from '@/components/chat/AgentAvatar'
import { PayrollCalendar } from '@/components/PayrollCalendar'
import { Btn } from '@/components/ui'
import { VOICE_ENABLED } from '@/lib/flags'
import type { QuestionCard } from '@/lib/chat'
import { getOnboarding } from '@/lib/onboarding'
import { useDictation } from '@/lib/useDictation'
import { uploadOnboardingFiles } from '@/lib/onboardingFlow'
import type { AgentActivity } from '@/lib/agentMotion'

type WaitingActivity = Extract<AgentActivity, 'processing' | 'thinking'>

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function TypedQuestion({ text, skip, onDone }: { text: string; skip: boolean; onDone(): void }) {
  const [count, setCount] = useState(() => skip || reducedMotion() ? text.length : 0)
  const callback = useRef(onDone)
  useEffect(() => { callback.current = onDone })
  useEffect(() => {
    if (skip || reducedMotion()) { callback.current(); return }
    // J&J StreamingText: the entire question types in 260ms, after a 60ms lead-in.
    const ticks = Math.round(260 / 16)
    let frame = 0
    let timer: number
    const tick = () => {
      frame += 1
      const visible = Math.min(text.length, Math.ceil(text.length * frame / ticks))
      setCount(visible)
      if (visible === text.length) callback.current()
      else timer = window.setTimeout(tick, 16)
    }
    timer = window.setTimeout(tick, 60)
    return () => window.clearTimeout(timer)
  }, [text, skip])
  return <h1 className="setup-typed-question" aria-label={text}><span className="setup-question-measure" aria-hidden>{text}</span><span aria-hidden>{text.slice(0, count)}<span className={`setup-caret${count === text.length ? ' is-done' : ''}`} /></span></h1>
}

/** The next question replaces the answered one immediately, in the same content slots. */
export function QuestionSkeleton({ activity = 'thinking' }: { activity?: WaitingActivity } = {}) {
  return <section className="setup-question setup-question-waiting" aria-busy="true" aria-label="Closeout Agent is preparing the next question">
    <AgentAvatar size={32} state={activity} />
    <div className="setup-question-placeholder" role="status" aria-busy="true" data-skeleton="question">
      <span className="sr-only skeleton-label">Loading</span>
      <div className="setup-question-lines"><Skeleton /><Skeleton /><Skeleton /></div>
      <Skeleton className="setup-input-placeholder" />
      <div className="setup-chip-placeholders"><Skeleton /><Skeleton /><Skeleton /></div>
    </div>
    <footer className="setup-controls">
      <Btn className="ghost" disabled><ChevronLeft size={14} aria-hidden />Back</Btn><span />
      <Btn className="setup-skip" disabled>Skip</Btn><Btn disabled>Next →</Btn>
    </footer>
  </section>
}

/** Input structure and wording come entirely from the agent's validated card. */
export function QuestionScreen({ question, card, initialAnswer = '', busy = false, activity = 'thinking', canBack, onBack, onAnswer, onCall }: {
  question: string; card: QuestionCard; initialAnswer?: string; busy?: boolean; activity?: WaitingActivity; canBack: boolean
  onBack(): void; onAnswer(answer: string): void; onCall?(): void
}) {
  const options = card.chips ?? (card.choice ? [card.choice.yours, card.choice.sample] : [])
  const answeredLines = initialAnswer.split('\n')
  const [draft, setDraft] = useState(() => answeredLines.filter((line) => !options.includes(line) && !line.startsWith('Pay calendar:')).join('\n'))
  const dictation = useDictation(draft, setDraft)
  const [selected, setSelected] = useState<string[]>(() => answeredLines.filter((line) => options.includes(line)))
  const [files, setFiles] = useState<string[]>([])
  const [typing, setTyping] = useState(() => !initialAnswer && !reducedMotion())
  const action = usePendingAction()
  const uploading = action.pending
  useEffect(() => {
    if (action.status !== 'success') return
    const timer = setTimeout(action.reset, 900)
    return () => clearTimeout(timer)
  }, [action.status, action.reset])
  const picker = useRef<HTMLInputElement>(null)
  const locked = busy || typing || uploading || dictation.finishing
  const answered = card.input === 'calendar' || !!(draft.trim() || selected.length || files.length)

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
    await action.run(async () => {
      const names = await uploadOnboardingFiles(incoming, undefined, card.topics.includes('workerHours') ? 1 : card.topics.includes('clientHours') ? 2 : undefined)
      setFiles((old) => [...new Set([...old, ...names])])
    }, 'upload')
  }

  function submit(dictated?: string) {
    if ((!answered && !dictated?.trim()) || locked) return
    const state = getOnboarding()
    const calendar = card.input === 'calendar' ? `Pay calendar: ${JSON.stringify({ frequency: state.frequency, periodEndDay: state.periodEndDay, payDay: state.payDay, payDatesOfMonth: state.payDatesOfMonth, cutoffDays: state.cutoffDays, deadlineDays: state.deadlineDays })}` : ''
    onAnswer([...selected, files.length ? `${files.length} ${files.length === 1 ? 'source' : 'sources'} attached` : '', calendar, (dictated ?? draft).trim()].filter(Boolean).join('\n'))
  }

  function submitAnswer() {
    if (dictation.active) void dictation.stop().then(text => submit(text)).catch(() => {})
    else submit()
  }

  if (busy) return <QuestionSkeleton activity={activity} />

  return <section className="setup-question" data-input={card.input}>
    <AgentAvatar size={32} state={dictation.finishing ? 'processing' : dictation.active ? 'listening' : 'idle'} />
    <TypedQuestion text={question} skip={!!initialAnswer} onDone={() => setTyping(false)} />
    <form data-typing={typing || undefined} onSubmit={(event) => { event.preventDefault(); submitAnswer() }}>
      <fieldset disabled={locked} className="setup-inputs">
        {card.input === 'choice' && card.choice && <div className="setup-choice">{[card.choice.yours, card.choice.sample].map((choice) =>
          <button type="button" key={choice} className={`setup-option${selected.includes(choice) ? ' selected' : ''}`} aria-pressed={selected.includes(choice)} onClick={() => pick(choice)}>{choice}</button>)}</div>}
        {card.input === 'calendar' && <div className="setup-calendar"><PayrollCalendar /></div>}
        {card.input === 'files' && <div className="setup-files">
          <input ref={picker} type="file" multiple hidden aria-label="Choose files" onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
          <ActionButton action={action} pendingLabel="Uploading…" successLabel="Uploaded" className="setup-drop" onClick={() => picker.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)) }}>
            <Upload size={18} aria-hidden /> {card.placeholder || 'Drop files here, or choose files'}
          </ActionButton>
          {uploading && <SkeletonRegion />}
          {files.length > 0 && <p className="setup-file-list"><Check size={13} aria-hidden />{files.length} {files.length === 1 ? 'source' : 'sources'} attached</p>}
        </div>}
        <div className="setup-textarea">
          <textarea aria-label="Your answer" placeholder={card.placeholder || 'Answer in your own words…'} value={draft} rows={3} readOnly={dictation.active || dictation.finishing} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submitAnswer() }
          }} />
          {VOICE_ENABLED && <div className="setup-voice">{onCall && <Btn aria-label="Call your Closeout Agent" onClick={() => { dictation.dismiss(); onCall() }}><Phone size={16} /></Btn>}<Btn className="setup-dictate" aria-label={dictation.finishing ? 'Finishing dictation' : dictation.active ? 'Stop dictation' : 'Dictate your answer'} aria-pressed={dictation.active} disabled={dictation.finishing} onClick={() => { if (dictation.active) void dictation.stop().catch(() => {}); else dictation.start() }}>{dictation.finishing || dictation.state === 'connecting' ? <span aria-hidden>…</span> : dictation.active ? <Square size={14} fill="currentColor" aria-hidden /> : <Mic size={16} aria-hidden />}</Btn></div>}
        </div>
        {(card.input === 'chips' || card.input === 'multi') && <div className="setup-chips">{card.chips?.map((chip, index) =>
          <button type="button" key={chip} className={`setup-chip${selected.includes(chip) ? ' selected' : ''}`} aria-pressed={selected.includes(chip)} onClick={() => pick(chip)}>
            <span className="setup-key">{index + 1}</span>{chip}{selected.includes(chip) && <Check size={13} aria-hidden />}
          </button>)}</div>}
      </fieldset>
      {dictation.status && <p className="setup-dictate-status" role="status">{dictation.status}</p>}
      {dictation.error && <div className="setup-error" role="alert"><p>{dictation.error}</p><Btn onClick={dictation.start}>Retry</Btn><Btn onClick={dictation.dismiss}>Keep typing</Btn></div>}
      <ActionFeedback action={action} className="setup-error" />
      <footer className="setup-controls">
        <Btn className="ghost" disabled={!canBack || locked} onClick={onBack}><ChevronLeft size={14} aria-hidden />Back</Btn>
        <span />
        <Btn className="setup-skip" disabled={locked} onClick={() => onAnswer('skip')}>Skip</Btn>
        <Btn type="submit" className={answered && !locked ? 'primary' : ''} disabled={!answered || locked}>Next →</Btn>
      </footer>
    </form>
  </section>
}
