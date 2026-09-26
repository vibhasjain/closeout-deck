import { SkeletonRegion } from '@/components/Skeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Lock, Phone, ScrollText } from 'lucide-react'
import { AgentAvatar } from '@/components/chat/AgentAvatar'
import { Btn } from '@/components/ui'
import { QuestionScreen } from '@/components/setup/QuestionScreen'
import { ProfileCard } from '@/components/profile/ProfileCard'
import { writingRows } from '@/components/profile/profileSummary'
import { ProfileModal } from '@/components/profile/ProfileModal'
import { ProfileDialog } from '@/components/profile/ProfileDialog'
import { RulebookModal } from '@/components/profile/RulebookModal'
import { NeverContactInput } from '@/components/profile/NeverContactInput'
import { JourneyBar } from '@/components/setup/JourneyBar'
import { OnboardingAccount } from '@/components/setup/OnboardingAccount'
import { VOICE_ENABLED } from '@/lib/flags'
import { useVoiceCall } from '@/lib/useVoiceCall'
import { CallScreen } from '@/components/voice/CallScreen'
import { Message } from '@/components/chat/Message'
import { ONBOARD_TOPICS } from '@/lib/onboarding'
import { flushOnboarding, getOnboarding, updateOnboarding, useOnboarding, type Onboarding } from '@/lib/onboarding'
import { applyOnboardReply, finishOnboarding, readFirm, requestOnboarding, rollbackOnboardingAnswer } from '@/lib/onboardingFlow'
import { TRUST } from '@/lib/trust'
import { viewerSession } from '@/lib/viewerSession'
import './agent.css'

export function WritingProfile({ state, onDone }: { state: Onboarding; onDone(): void }) {
  const callback = useRef(onDone)
  useEffect(() => { callback.current = onDone })
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => callback.current(), reduced ? 0 : 600)
    return () => window.clearTimeout(timer)
  }, [])
  return <section className="setup-writing setup-split">
    <div className="setup-copy"><AgentAvatar size={32} working /><SkeletonRegion variant="profile" />{state.setupClosing && <p className="setup-closing">{state.setupClosing}</p>}</div>
    <div className="setup-writing-lists" role="status" aria-live="polite">
      {writingRows(state).map(({ title, rows }) => <div key={title}><h2>{title}</h2><ul>{rows.map((row) => <li className={row.complete ? 'done' : 'not-yet'} key={row.title}>{row.complete && <Check size={14} aria-hidden />}<span>{row.title}</span>{!row.complete && <small className="tag profile-not-yet">Not Yet</small>}</li>)}</ul></div>)}
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
  const voice = useVoiceCall('onboard')
  const thisCall = voice.snapshot?.callId ? state.chat.find(message => message.id === `call-${voice.snapshot?.callId}`) : undefined
  const showCallSummary = voice.snapshot?.status === 'ended' && !!thisCall
  const callsNeedingSave = state.chat.filter(message => message.callSaveError && message.cards?.some(card => card.kind === 'call') && (!showCallSummary || message.id !== thisCall?.id))
  const pending = useRef<AbortController | null>(null)
  const firmRead = useRef<AbortController | null>(null)
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
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The Closeout Agent could not be reached. Try again.')
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
    return () => { window.clearTimeout(timer); pending.current?.abort(); pending.current = null; firmRead.current?.abort() }
  }, [ask])

  function keepTyping() {
    voice.dismiss()
    const next = ONBOARD_TOPICS.find(topic => !getOnboarding().covered.includes(topic))
    void ask(next ? `Continue our conversation by typing. Ask about the next uncovered goal: ${next}. Keep the answers from our call.` : 'We finished our call. Review the covered goals and finish my Payroll profile.')
  }

  function submitFirm() {
    if (busy || !firmChoice || (firmChoice === 'yours' && !domain.trim())) return
    const website = firmChoice === 'sample' ? 'sample' : domain.trim().replace(/^https?:\/\//i, '').split('/')[0].toLowerCase()
    const fallback = { name: website === 'sample' ? 'Summit Staffing' : website, domain: website, summary: '', states: [], verticals: [], clientTypes: [], size: '', staffing: true }
    firmRead.current?.abort()
    const controller = new AbortController()
    firmRead.current = controller
    setError('')
    updateOnboarding({ firm: fallback, setupStep: 'trust' })
    // Consent and the conversation never wait for an optional website read.
    void readFirm(website, controller.signal).then((firm) => {
      const currentFirm = getOnboarding().firm
      if (!controller.signal.aborted && currentFirm?.domain === website) {
        // An answer given while the read was in flight takes precedence over pre-read facts.
        const edited = Object.fromEntries(Object.entries(currentFirm).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(fallback[key as keyof typeof fallback])))
        updateOnboarding({ firm: { ...firm, ...edited } })
      }
    }).catch(() => { /* The stored domain-only profile is enough for the agent to ask. */ })
  }

  function answer(value: string) {
    const saved = getOnboarding()
    if (!current) return
    if (historyIndex < saved.setupHistory.length - 1 && value.trim() === current.answer?.trim()) {
      setError(''); setHistoryIndex(saved.setupHistory.length - 1); return
    }
    if (historyIndex < saved.setupHistory.length - 1) rollbackOnboardingAnswer(historyIndex)
    const history = saved.setupHistory.slice(0, historyIndex + 1)
    history[historyIndex] = { ...current, answer: value }
    updateOnboarding({ setupHistory: history })
    const message = historyIndex < saved.setupHistory.length - 1 ? `I'm changing my answer to “${current.question}”: ${value}` : value
    void ask(message)
  }

  async function finish(contacts = names) {
    setBusy(true); setError('')
    try { await finishOnboarding(contacts); await flushOnboarding(); navigate('/payroll?agent=1') }
    catch (cause) { updateOnboarding({ setupStep: 'never-contact' }); setError(cause instanceof Error ? cause.message : 'Your profile could not be saved. Try again.') }
    finally { setBusy(false) }
  }

  const firmReady = !!firmChoice && (firmChoice === 'sample' || !!domain.trim()) && !busy
  const neverContactOpen = step === 'never-contact' || (step === 'ready' && busy)
  const ready = <section className="setup-split setup-ready">
    <div className="setup-copy">
      <AgentAvatar size={32} />
      <h1>Your Payroll profile is ready</h1>
      {state.setupClosing && <p className="setup-closing">{state.setupClosing}</p>}
      <div className="setup-review-actions"><Btn onClick={() => openModal('profile')}>Check out your Payroll profile</Btn><Btn onClick={() => openModal('rulebook')}>View your Rulebook</Btn></div>
      <Btn className={!modal && step === 'ready' && !busy ? 'primary setup-bottom' : 'setup-bottom'} data-setup-finish onClick={() => { modalOpener.current = document.activeElement as HTMLElement | null; setNames(getOnboarding().neverContact ?? []); go('never-contact') }}>Finish →</Btn>
    </div>
    <div className="setup-documents-pane"><div className="setup-profile-stack"><button type="button" className="setup-rulebook-cover" onClick={() => openModal('rulebook')} aria-label="Open your Rulebook"><ScrollText size={24} aria-hidden /><span>{state.firm?.name || 'Your firm'}'s Rulebook</span><small>Confidential</small></button><button type="button" className="setup-profile-cover" onClick={() => openModal('profile')} aria-label="Open your Payroll profile"><ProfileCard state={state} compact className="setup-tilted-profile" /></button></div></div>
  </section>

  return <div className="agent-setup" data-step={step} data-on-call={!!voice.snapshot && voice.snapshot.status !== 'ended' || undefined}>
    <JourneyBar state={state} />
    <OnboardingAccount />
    <div className="setup-stage" inert={modal !== null || neverContactOpen} aria-hidden={modal !== null || neverContactOpen || undefined}>
      {voice.snapshot && voice.snapshot.status !== 'ended' ? <CallScreen snapshot={voice.snapshot} onboarding={state} onMute={voice.mute} onEnd={() => { void voice.end().catch(() => {}) }} onRetry={() => { void (voice.snapshot?.errorKind === 'save' ? voice.retrySave() : voice.start()).catch(() => {}) }} onRetryTurn={voice.retryTurn} onKeepTyping={keepTyping} /> : <>
      {showCallSummary && thisCall && <section className="setup-call-summary"><h1>{thisCall.callSaveError || thisCall.callServerSaved === false ? 'Call ended' : 'Your call is saved'}</h1><Message message={thisCall} /><Btn className="primary" onClick={keepTyping}>{state.covered.length === ONBOARD_TOPICS.length ? 'Review my Payroll profile' : 'Keep typing'}</Btn></section>}
      {callsNeedingSave.length > 0 && <section className="setup-call-summary" aria-label="Call notes awaiting saving">{callsNeedingSave.map(message => <Message key={message.id} message={message} />)}</section>}
      {step === 'welcome' && <section className="setup-centered setup-welcome"><AgentAvatar size={64} /><h1>Welcome, {first}</h1><p>Set up your Closeout Agent for weekly Payroll. Start with your firm and permissions, then build your Payroll profile together.</p><Btn className="primary" onClick={() => go('basics')}>Get started →</Btn></section>}
      {step === 'basics' && <section className="setup-centered setup-basics"><h1>Choose your staffing firm</h1>
        <form onSubmit={(event) => { event.preventDefault(); void submitFirm() }}>
          <div className="setup-choice">
            <div className={`setup-option setup-website${firmChoice === 'yours' ? ' selected' : ''}`}><button type="button" disabled={busy} aria-pressed={firmChoice === 'yours'} onClick={() => setFirmChoice('yours')}>Your firm's website</button><input aria-label="Your firm's website" placeholder="acmestaffing.com" maxLength={253} value={domain} onFocus={() => setFirmChoice('yours')} onChange={(event) => { setDomain(event.target.value); setFirmChoice('yours') }} disabled={busy} /></div>
            <button className={`setup-option${firmChoice === 'sample' ? ' selected' : ''}`} type="button" disabled={busy} aria-pressed={firmChoice === 'sample'} onClick={() => setFirmChoice('sample')}>Use the sample firm</button>
          </div>
          {error && <div className="setup-error" role="alert"><p>{error}</p><Btn onClick={() => void submitFirm()}>Retry</Btn></div>}
          {busy && <SkeletonRegion className="setup-working" />}
          {firmChoice && <Btn type="submit" className={firmReady ? 'primary' : ''} disabled={!firmReady}>Continue →</Btn>}
        </form>
      </section>}
      {step === 'trust' && <section className="setup-centered"><AgentAvatar size={32} /><h1>Your data and permissions</h1><ul className="setup-trust">{TRUST.map((line) => <li key={line}><Lock size={14} aria-hidden />{line}</li>)}</ul><Btn className="primary" onClick={() => go('intro')}>I agree</Btn></section>}
      {step === 'intro' && !showCallSummary && <section className="setup-split setup-intro"><div className="setup-copy"><AgentAvatar size={32} /><h1>Build your Payroll profile</h1><p>Your Closeout Agent uses this profile before every pay run. The conversation will fill in the gaps about {state.firm?.name || 'your firm'}.</p>
        <div className="setup-bottom">{VOICE_ENABLED && <Btn className="primary" onClick={() => { void voice.start() }}><Phone size={15} aria-hidden />Jump on a call with your Closeout Agent</Btn>}<Btn className={VOICE_ENABLED ? '' : 'primary'} onClick={() => void ask('Start onboarding')}>Keep typing</Btn></div>
      </div><div className="setup-profile-preview"><ProfileCard state={state} /></div></section>}
      {step === 'conversation' && !showCallSummary && <div className="setup-conversation"><div>
        {error && <div className="setup-error" role="alert"><p>{error}</p><Btn disabled={busy} onClick={() => void ask(getOnboarding().setupRequest || 'Start onboarding')}>Retry</Btn>{!current && <div className="setup-controls"><Btn onClick={() => go('intro')}>Back</Btn><Btn disabled={busy} onClick={() => void ask('Skip this question and continue onboarding.')}>Skip</Btn></div>}</div>}
        {state.setupNotice && <p className="setup-notice" role="status">{state.setupNotice}</p>}
        {current ? <QuestionScreen key={`${historyIndex}:${current.question}`} question={current.question} card={current.card} initialAnswer={current.answer} busy={busy} onCall={() => { void voice.start() }} canBack={historyIndex > 0 || !!error} canForward={historyIndex < state.setupHistory.length - 1} onForward={() => { setError(''); setHistoryIndex(state.setupHistory.length - 1) }} onBack={() => { if (historyIndex === 0) go('intro'); else { setError(''); setHistoryIndex((index) => Math.max(0, index - 1)) } }} onAnswer={answer} />
          : !error && <section className="setup-centered"><AgentAvatar size={32} working /><SkeletonRegion variant="profile" /></section>}

        {busy && current && <SkeletonRegion className="setup-reply-status" />}
      </div><aside className="setup-conversation-profile" aria-label="Your live Payroll profile"><ProfileCard state={state} /></aside></div>}
      {step === 'writing' && <WritingProfile state={state} onDone={() => go('ready')} />}
      {(step === 'ready' || step === 'never-contact') && ready}
      </>}
    </div>
    {neverContactOpen && <ProfileDialog title="Anyone I should never contact?" description="Add anyone the Closeout Agent should never contact. All outreach requires your permission; this list can be changed any time." className="setup-contact-dialog" closeDisabled={busy} onClose={() => {
      go('ready'); window.requestAnimationFrame(() => (modalOpener.current ?? document.querySelector<HTMLElement>('[data-setup-finish]'))?.focus())
    }} footer={<><Btn className={busy ? '' : 'primary'} disabled={busy} onClick={() => void finish()}>{busy ? 'Saving…' : 'Save and continue'}</Btn><Btn disabled={busy} onClick={() => void finish(getOnboarding().neverContact ?? [])}>Skip for now</Btn></>}>
      <div className="profile-modal-body"><NeverContactInput value={names} onChange={setNames} disabled={busy} />{error && <div className="setup-error" role="alert"><p>{error}</p><Btn onClick={() => void finish()}>Retry</Btn></div>}</div>
    </ProfileDialog>}
    {modal === 'profile' && <ProfileModal onClose={closeModal} />}
    {modal === 'rulebook' && <RulebookModal onClose={closeModal} />}
  </div>
}
