import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Lock, Phone, ScrollText } from 'lucide-react'
import { ThinkingOrb } from 'thinking-orbs'
import { Btn, Spinner } from '@/components/ui'
import { QuestionScreen } from '@/components/setup/QuestionScreen'
import { ProfileCard } from '@/components/profile/ProfileCard'
import { ProfileModal } from '@/components/profile/ProfileModal'
import { ProfileDialog } from '@/components/profile/ProfileDialog'
import { RulebookModal } from '@/components/profile/RulebookModal'
import { NeverContactInput } from '@/components/profile/NeverContactInput'
import { sectionProgress } from '@/lib/coverage'
import { VOICE_ENABLED } from '@/lib/flags'
import { flushOnboarding, getOnboarding, updateOnboarding, useOnboarding, type Onboarding } from '@/lib/onboarding'
import { applyOnboardReply, finishOnboarding, readFirm, requestOnboarding } from '@/lib/onboardingFlow'
import { TRUST } from '@/lib/trust'
import { viewerSession } from '@/lib/viewerSession'
import './agent.css'

const PROFILE_CHECKS = ['The essentials', 'Pay calendar', 'Where time comes from', 'Whose hours we pay']
const RULEBOOK_CHECKS = ['State rules', 'Client contracts', 'What I fix on my own', 'Pay complaints']

export function WritingProfile({ onDone }: { onDone(): void }) {
  const [done, setDone] = useState(0)
  const callback = useRef(onDone)
  useEffect(() => { callback.current = onDone })
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timers = Array.from({ length: 9 }, (_, i) => window.setTimeout(() => setDone(i + 1), reduced ? 0 : (i + 1) * 250))
    timers.push(window.setTimeout(() => callback.current(), reduced ? 100 : 2500))
    return () => timers.forEach(window.clearTimeout)
  }, [])
  return <section className="setup-writing setup-split">
    <div className="setup-copy"><ThinkingOrb size={32} theme="light" state="working" /><h1>Writing your Payroll profile and Rulebook…</h1></div>
    <div className="setup-writing-lists" aria-live="polite">
      {[['Profile', PROFILE_CHECKS], ['Rulebook', RULEBOOK_CHECKS]] .map(([title, rows], column) => <div key={String(title)}><h2>{title}</h2><ul>{(rows as string[]).map((row, i) => <li className={done > column * 4 + i ? 'done' : ''} key={row}>{done > column * 4 + i ? <Check size={14} aria-hidden /> : <Spinner />}<span>{row}</span></li>)}</ul></div>)}
      <div className={`setup-final-check${done > 8 ? ' done' : ''}`} hidden={done < 8}>{done > 8 ? <Check size={14} aria-hidden /> : <Spinner />}<span>Final checks</span></div>
    </div>
  </section>
}

export function Agent() {
  const [state] = useOnboarding()
  const navigate = useNavigate()
  const [domain, setDomain] = useState(state.firm?.domain ?? '')
  const [firmChoice, setFirmChoice] = useState<'yours' | 'sample' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [historyIndex, setHistoryIndex] = useState(() => Math.max(0, state.setupHistory.length - 1))
  const [modal, setModal] = useState<'profile' | 'rulebook' | null>(null)
  const [names, setNames] = useState(state.neverContact ?? [])
  const pending = useRef<AbortController | null>(null)
  const modalOpener = useRef<HTMLElement | null>(null)
  function openModal(kind: 'profile' | 'rulebook') { modalOpener.current = document.activeElement as HTMLElement | null; setModal(kind) }
  function closeModal() { setModal(null); window.requestAnimationFrame(() => modalOpener.current?.focus()) }
  const step = state.setupStep
  const current = state.setupHistory[historyIndex]
  const first = viewerSession()?.name?.trim().split(/\s+/)[0] || 'there'
  const go = (setupStep: Onboarding['setupStep']) => { setError(''); updateOnboarding({ setupStep }) }

  const ask = useCallback(async (message: string) => {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true); setError('')
    updateOnboarding({ setupStep: 'conversation', setupRequest: message })
    try {
      const reply = await requestOnboarding(message, controller.signal)
      if (controller.signal.aborted) return
      applyOnboardReply(reply)
      setHistoryIndex(Math.max(0, getOnboarding().setupHistory.length - 1))
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'I couldn’t reach the Closeout Agent. Try again.')
    } finally {
      if (pending.current === controller) pending.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [])

  // Recover an interrupted request on reload. The last validated card stays in the store.
  useEffect(() => {
    const saved = getOnboarding()
    const timer = window.setTimeout(() => {
      if (saved.setupStep === 'conversation' && (saved.setupRequest || !saved.setupHistory.length)) void ask(saved.setupRequest || 'Start onboarding')
    }, 0)
    return () => { window.clearTimeout(timer); pending.current?.abort(); pending.current = null }
  }, [ask])

  async function submitFirm() {
    if (busy || !firmChoice || (firmChoice === 'yours' && !domain.trim())) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true); setError('')
    try {
      const firm = await readFirm(firmChoice === 'sample' ? 'sample' : domain.trim(), controller.signal)
      if (!controller.signal.aborted) updateOnboarding({ firm, setupStep: 'trust' })
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'I couldn’t read that firm. Try again.')
    } finally {
      if (pending.current === controller) pending.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function answer(value: string) {
    const saved = getOnboarding()
    const history = saved.setupHistory.slice(0, historyIndex + 1)
    if (!current) return
    history[historyIndex] = { ...current, answer: value }
    updateOnboarding({ setupHistory: history })
    const message = historyIndex < saved.setupHistory.length - 1 ? `I'm changing my answer to “${current.question}”: ${value}` : value
    void ask(message)
  }

  async function finish(contacts = names) {
    setBusy(true); setError('')
    try { finishOnboarding(contacts); await flushOnboarding(); navigate('/payroll') }
    catch (cause) { updateOnboarding({ setupStep: 'never-contact' }); setError(cause instanceof Error ? cause.message : 'Your profile could not be saved. Try again.') }
    finally { setBusy(false) }
  }

  const firmReady = !!firmChoice && (firmChoice === 'sample' || !!domain.trim()) && !busy
  const neverContactOpen = step === 'never-contact' || (step === 'ready' && busy)
  const ready = <section className="setup-split">
    <div className="setup-copy">
      <ThinkingOrb size={32} theme="light" state="breathing" />
      <h1>Your Payroll profile is ready</h1>
      <p>This is how I understand your Payroll. I wrote it up from everything you told me, so take a look and change anything that's wrong. Your Rulebook is what I check before every pay run; only your team sees it.</p>
      <div className="setup-review-actions"><Btn onClick={() => openModal('profile')}>Check out your Payroll profile</Btn><Btn onClick={() => openModal('rulebook')}>View your Rulebook</Btn></div>
      <Btn className={!modal && step === 'ready' && !busy ? 'primary setup-bottom' : 'setup-bottom'} data-setup-finish onClick={() => { modalOpener.current = document.activeElement as HTMLElement | null; setNames(getOnboarding().neverContact ?? []); go('never-contact') }}>Finish →</Btn>
    </div>
    <div className="setup-profile-stack"><div className="setup-rulebook-cover"><ScrollText size={24} aria-hidden /><span>{state.firm?.name || 'Your firm'}'s Rulebook</span><small>Confidential</small></div><ProfileCard state={state} className="setup-tilted-profile" /></div>
  </section>

  return <div className="agent-setup">
    <header className="setup-sections" aria-label="Onboarding progress">{sectionProgress(state).map((section) => <div key={section.id} className="setup-section">
      <div className="setup-section-line" role="progressbar" aria-label={section.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(section.progress * 100)}><span style={{ transform: `scaleX(${section.progress})` }} /></div>
      <span>{section.progress === 1 && <Check size={12} aria-hidden />}{section.label}</span>
    </div>)}</header>
    <div className="setup-stage" hidden={modal !== null || neverContactOpen}>
      {step === 'welcome' && <section className="setup-centered setup-welcome"><ThinkingOrb size={64} theme="light" state="breathing" /><h1>Hey {first}! I'm your Closeout Agent.</h1><p>I'll work alongside your team on Payroll every week. Let's get the admin out of the way first; it'll only take a minute.</p><Btn className="primary" onClick={() => go('basics')}>Get started →</Btn></section>}
      {step === 'basics' && <section className="setup-centered setup-basics"><h1>Which staffing firm are we setting up?</h1>
        <form onSubmit={(event) => { event.preventDefault(); void submitFirm() }}>
          <div className="setup-choice">
            <div className={`setup-option setup-website${firmChoice === 'yours' ? ' selected' : ''}`}><button type="button" disabled={busy} aria-pressed={firmChoice === 'yours'} onClick={() => setFirmChoice('yours')}>Your firm's website</button><input aria-label="Your firm's website" placeholder="acmestaffing.com" value={domain} onFocus={() => setFirmChoice('yours')} onChange={(event) => { setDomain(event.target.value); setFirmChoice('yours') }} disabled={busy} /></div>
            <button className={`setup-option${firmChoice === 'sample' ? ' selected' : ''}`} type="button" disabled={busy} aria-pressed={firmChoice === 'sample'} onClick={() => setFirmChoice('sample')}>Use the sample firm</button>
          </div>
          {error && <div className="setup-error" role="alert"><p>{error}</p><Btn onClick={() => void submitFirm()}>Retry</Btn></div>}
          {busy && <p className="setup-working" role="status"><Spinner />Reading up on your firm…</p>}
          {firmChoice && <Btn type="submit" className={firmReady ? 'primary' : ''} disabled={!firmReady}>Continue →</Btn>}
        </form>
      </section>}
      {step === 'trust' && <section className="setup-centered"><ThinkingOrb size={32} theme="light" state="breathing" /><h1>A little trust goes a long way.</h1><ul className="setup-trust">{TRUST.map((line) => <li key={line}><Lock size={14} aria-hidden />{line}</li>)}</ul><Btn className="primary" onClick={() => go('intro')}>I agree</Btn></section>}
      {step === 'intro' && <section className="setup-split"><div className="setup-copy"><ThinkingOrb size={32} theme="light" state="breathing" /><h1>Let's build your Payroll profile</h1><p>This is what I read before every pay run. I read up on {state.firm?.name || 'your firm'} and filled in what I could; a few questions fill the gaps. A quick call is fastest, or keep typing.</p>
        <div className="setup-bottom">{VOICE_ENABLED && <Btn className="primary"><Phone size={15} aria-hidden />Jump on a call with your Closeout Agent</Btn>}<Btn className={VOICE_ENABLED ? '' : 'primary'} onClick={() => void ask('Start onboarding')}>Keep typing</Btn></div>
      </div><div className="setup-profile-preview"><ProfileCard state={state} /></div></section>}
      {step === 'conversation' && <div className="setup-conversation"><div>
        {error ? <section className="setup-centered"><ThinkingOrb size={32} theme="light" state="breathing" /><div className="setup-error" role="alert"><p>{error}</p><Btn onClick={() => void ask(getOnboarding().setupRequest || 'Start onboarding')}>Retry</Btn></div></section>
          : current ? <QuestionScreen key={`${historyIndex}:${current.question}`} question={current.question} card={current.card} initialAnswer={current.answer} busy={busy} canBack={historyIndex > 0} onBack={() => setHistoryIndex((index) => Math.max(0, index - 1))} onAnswer={answer} />
            : <section className="setup-centered"><ThinkingOrb size={32} theme="light" state="working" /><p role="status">Your Closeout Agent is reading your profile…</p></section>}
        {busy && current && <p className="setup-reply-status" role="status"><Spinner />Your Closeout Agent is thinking…</p>}
      </div><aside className="setup-conversation-profile" aria-label="Your live Payroll profile"><ProfileCard state={state} /></aside></div>}
      {step === 'writing' && <WritingProfile onDone={() => go('ready')} />}
      {(step === 'ready' || step === 'never-contact') && ready}
    </div>
    {neverContactOpen && <ProfileDialog title="Anyone I should never contact?" description="I text site supervisors and workers to confirm time. Name anyone I should never reach out to; you can change it any time." className="setup-contact-dialog" closeDisabled={busy} onClose={() => {
      go('ready'); window.requestAnimationFrame(() => (modalOpener.current ?? document.querySelector<HTMLElement>('[data-setup-finish]'))?.focus())
    }} footer={<><Btn className={busy ? '' : 'primary'} disabled={busy} onClick={() => void finish()}>{busy ? 'Saving…' : 'Save and continue'}</Btn><Btn disabled={busy} onClick={() => void finish(getOnboarding().neverContact ?? [])}>Skip for now</Btn></>}>
      <div className="profile-modal-body"><NeverContactInput value={names} onChange={setNames} disabled={busy} />{error && <div className="setup-error" role="alert"><p>{error}</p><Btn onClick={() => void finish()}>Retry</Btn></div>}</div>
    </ProfileDialog>}
    {modal === 'profile' && <ProfileModal onClose={closeModal} />}
    {modal === 'rulebook' && <RulebookModal onClose={closeModal} />}
  </div>
}
