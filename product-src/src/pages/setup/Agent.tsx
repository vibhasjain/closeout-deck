import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUp, Check as CheckIcon, FileSpreadsheet, Lock, ScrollText, Upload, X } from 'lucide-react'
import mark from '@/assets/hypertrack-sm.svg'
import { PayCycleForm } from '@/components/PayCycles'
import { PayrollCalendar } from '@/components/PayrollCalendar'
import { FindingAmount, FindingDetail } from '@/components/SampleResult'
import { useChatContext, useSetChatContext } from '@/components/chat/ChatPane'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, Chip, Spinner, Tag } from '@/components/ui'
import { CATALOG } from '@/bench/catalog.js'
import { APPROVED, BILLING, CATALOG_STATES, CLIENT_TIME, list, PAY_PERIODS, PAYOUTS, PAYROLL, RULEBOOK, SAMPLE_CONTRACT, sourcesLine, split, STAGES, TURNS, turnOf, typedPick, typedPicks, VMS, WORKER_CHANNELS } from '@/lib/agentOnboarding'
import { parseActions, stream, systemPrompt } from '@/lib/chat'
import { cycleLine } from '@/lib/cohorts'
import { recentCycles } from '@/lib/cycles'
import { HANDOFF_LINE, intakeHref } from '@/lib/intake'
import { isMonthly, useOnboarding, type CustomDeskRule, type Onboarding } from '@/lib/onboarding'
import { acceptProposal, clarify, compileRule, propose, withThreshold } from '@/lib/ruleIntake'
import type { Proposal } from '@/lib/rules'
import { buildSample, CLIENTS, findings, sampleCsvs, type Csv, type Finding } from '@/lib/sample'
import { ordinal } from '@/lib/utils'
import './agent.css'

const SAMPLE_DATA = buildSample()
const md = (d: Date) => `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`
const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' })
const flip = (items: string[], value: string) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
// The demo's two turns work through a checklist before they answer.
const FILES = STAGES.indexOf('See it work') + 1, MAGIC = FILES + 1, RULES = STAGES.indexOf('Your rules') + 1, CYCLES = 4
const FREQUENCY: Record<string, Onboarding['frequency']> = { Weekly: 'Weekly', 'Bi-weekly (every 2 weeks)': 'Biweekly', 'Semi-monthly (twice a month)': 'Semi-monthly', Monthly: 'Monthly' }
const ONLY = ['Not applicable', 'Not sure']
const UNKNOWN = ['Other', ...ONLY]
const DID: Record<number, (n: number, run: string) => string> = {
  3: (n, run) => `I added ${n} time entries ADP had but Bullhorn missed to ${run}`,
  4: (n, run) => `I added ${n} California meal premiums to ${run}`,
  5: (n, run) => `I repriced overtime for ${n} night workers to include the differential in ${run}`,
  6: (n, run) => `I moved ${n} overnight time entries back into their week and added the overtime to ${run}`,
}
const TRUST = ['I only need worker ID, hours and rates. Leave out SSNs.', 'Encrypted, and deleted on request',
  'Security review packet (SOC 2, DPA) on request', 'Nothing is sent to workers, clients or Payroll until you approve it']
const MAGIC_LINES = [`Matching ${SAMPLE_DATA.workers.toLocaleString()} workers across three systems`, 'Lining up Bullhorn time entries against UKG punches and ADP timecards',
  'Applying California and Texas wage rules', 'Pricing every difference']
const PREVIEW_ROWS = 100

type Phase = 'typing' | 'say' | 'think' | 'ready'
interface Aside { id: number; turn: number; question: string; reply: string; failed?: boolean }
/** `hidden` options wait behind More… but still answer a typed reply; `multi` ones toggle, then Continue moves on. */
interface Option { id?: string; label: string; active?: boolean; hidden?: boolean; multi?: boolean; pick(): void }
/** What happened on the rules turn: a document read into proposals, or a typed rule and its clarifying question. */
type RuleEvent = { id: number; kind: 'doc'; name: string; items: Proposal[]; reading: boolean }
  | { id: number; kind: 'typed'; text: string; rule: CustomDeskRule; ask: ReturnType<typeof clarify>; saved: boolean }
const RULE_COUNT = RULEBOOK.reduce((sum, group) => sum + group.rules.length, 0)

/** Cancel delayed navigation when setup is exited through the header or top navigation. */
function useSetupTimeout() {
  const timers = useRef(new Set<number>())
  useEffect(() => {
    const pending = timers.current
    return () => { pending.forEach((timer) => window.clearTimeout(timer)); pending.clear() }
  }, [])
  return useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => { timers.current.delete(timer); callback() }, delay)
    timers.current.add(timer)
  }, [])
}

/** Agent text that writes itself out word by word, or all at once when motion is reduced. */
function Say({ text, live, onDone }: { text: string; live: boolean; onDone?(): void }) {
  const words = text.split(' ')
  const [shown, setShown] = useState(() => live && !reduced() ? 0 : words.length)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    if (!live) return
    if (shown >= words.length) { done.current?.(); return }
    const timer = window.setTimeout(() => setShown((count) => count + 1), Math.min(Math.max(words.length * 28, 400), 800) / words.length)
    return () => window.clearTimeout(timer)
  }, [live, shown, words.length])
  return <p>{live ? words.slice(0, shown).join(' ') : text}</p>
}

/** A checklist that ticks off one line at a time, then folds to a summary that can be reopened. */
function Thinking({ checks, summary, pace, live, onDone }: { checks: string[]; summary: string; pace: number; live: boolean; onDone?(): void }) {
  const [shown, setShown] = useState(() => live && !reduced() ? 0 : checks.length)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    if (!live) return
    if (shown >= checks.length) { done.current?.(); return }
    const timer = window.setTimeout(() => setShown((count) => count + 1), pace)
    return () => window.clearTimeout(timer)
  }, [live, shown, checks.length, pace])
  const lines = <ol className="convo-checks">{checks.slice(0, live ? shown + 1 : checks.length).map((line, i) => <li key={line}>
    {!live || i < shown ? <CheckIcon size={13} aria-hidden /> : <Spinner />}{line}</li>)}</ol>
  return live && shown < checks.length ? <div className="convo-thinking">{lines}</div>
    : <details className="convo-thinking"><summary>{summary}</summary>{lines}</details>
}

/** The sample files in a popup: one tab per file, the name column pinned while the rest scrolls. */
function SampleFiles({ csvs, start, onSeen, onClose }: { csvs: Csv[]; start: number; onSeen(name: string): void; onClose(): void }) {
  const [index, setIndex] = useState(start)
  const csv = csvs[index]
  return <div className="demo-modal">
    <div className="demo-modal-head">
      <div><h2>{csv.name}</h2><p className="r-note">{csv.note}</p></div>
      <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X aria-hidden /></button>
    </div>
    <div className="chip-row demo-tabs" role="tablist" aria-label="Sample files">
      {csvs.map((file, i) => <Chip key={file.name} role="tab" active={i === index} aria-selected={i === index}
        onClick={() => { setIndex(i); onSeen(file.name) }}>{file.label} · {file.count}</Chip>)}
    </div>
    <div className="sample-table demo-table">
      <table className="sheet"><thead><tr>{csv.header.map((head) => <th key={head} scope="col">{head}</th>)}</tr></thead>
        <tbody>{csv.rows.slice(0, PREVIEW_ROWS).map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j}>{value}</td>)}</tr>)}</tbody></table>
    </div>
    <p className="r-note demo-foot">Showing {Math.min(PREVIEW_ROWS, csv.rows.length)} of {csv.rows.length.toLocaleString()} rows</p>
  </div>
}

export function Agent() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [state, update] = useOnboarding()
  const { openModal, close } = useOverlay()
  const [phase, setPhase] = useState<Phase>('ready')
  const [changing, setChanging] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [asides, setAsides] = useState<Aside[]>([])
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [more, setMore] = useState(false)
  const [viewed, setViewed] = useState<string[]>([])
  const [events, setEvents] = useState<RuleEvent[]>([])
  const [customRule, setCustomRule] = useState<string | null>(null)
  // The pay cycle form: undefined when closed, null to add one, or the id being edited.
  const [cycleForm, setCycleForm] = useState<string | null | undefined>()
  const [cycleName, setCycleName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const session = useRef<string | null>(null)
  const asked = useRef(0)
  const live = useRef<HTMLElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const schedule = useSetupTimeout()
  const step = turnOf(params.get('step'))
  const week = recentCycles(state, 2)[1]
  const dayLabel = (day: number) => md(new Date(week.start.getFullYear(), week.start.getMonth(), week.start.getDate() + day))
  const found = useMemo(() => findings(SAMPLE_DATA, dayLabel), [week.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const csvs = useMemo(() => sampleCsvs(SAMPLE_DATA, week), [week.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const { authority, discovery: d } = state
  const { fixed, stopped } = split(found, authority)
  const setD = (patch: Partial<Onboarding['discovery']>) => update({ discovery: { ...d, ...patch } })
  const due = { invoice: `Before invoicing · ${md(week.cutoff)}`, payroll: `Before Payroll · ${md(week.deadline)}`, anytime: 'Anytime' }
  const monthly = isMonthly(state.frequency)
  const paid = monthly ? `paid on the ${state.payDatesOfMonth.map(ordinal).join(' and ')}` : `paid ${state.payDay}`
  const calendar = monthly ? `${state.frequency}, ${paid}` : `${state.frequency}, weeks end ${state.periodEndDay}, ${paid}`
  const run = `${weekday(week.deadline)}'s run`
  const atStake = Math.round(found.reduce((sum, finding) => sum + finding.amount, 0) / 10) * 10
  const makes = [`Bullhorn time export · ${csvs[0].count}`, `${CLIENTS.A.name}'s UKG timeclock · ${csvs[1].count}`, `${CLIENTS.B.name}'s ADP timecards · ${csvs[2].rows.length.toLocaleString()} rows`]
  const context = useChatContext()
  const open = recentCycles(state, 1)[0]
  const intro = sourcesLine(d)
  const added = events.some((event) => event.kind === 'doc' ? event.items.some((item) => state.customRules.some((rule) => rule.id === item.id)) : event.saved)

  useSetChatContext({ page: '/setup/agent', step: `agent-${step}`, selection: { note: 'Everything on this page is a sample week, not the user\'s data. Replies here cannot save answers or settings, so never say you noted, saved or flagged anything.', discovery: d, authority,
    fixed: fixed.map((finding) => finding.title), stopped: stopped.map(({ finding, why }) => ({ title: finding.title, why })) } })

  // The newest turn starts near the top; once its answers appear they are brought into view.
  useEffect(() => {
    const smooth = reduced() ? 'auto' : 'smooth'
    if (phase === 'say') live.current?.scrollIntoView({ block: 'start', behavior: smooth })
    else end.current?.scrollIntoView({ block: 'nearest', behavior: smooth })
    // Someone answering in the composer keeps typing there; otherwise the first answer takes focus.
    const first = phase === 'ready' ? controls.current?.querySelector<HTMLElement>('button, input, select') : null
    if (first && !document.activeElement?.closest('.convo-composer')) first.focus({ preventScroll: true })
  }, [phase, step, asides.length, changing, events.length, cycleForm, state.cohorts.length])

  const go = (next: number) => setParams((previous) => { const params = new URLSearchParams(previous); params.set('step', String(next)); return params })
  const seen = (name: string) => setViewed((names) => names.includes(name) ? names : [...names, name])

  function reopen(n: number) {
    setChanging(false)
    setMore(false)
    setCustomRule(null)
    setCycleForm(undefined)
    setPhase('ready')
    go(n)
  }

  function advance(then?: () => void) {
    setChanging(false)
    setMore(false)
    setCustomRule(null)
    setCycleForm(undefined)
    setPhase('typing')
    schedule(() => { if (then) then(); else go(step + 1); setPhase('say') }, reduced() ? 0 : 500)
  }

  function finish() {
    update({ fileName: 'Sample week', entries: SAMPLE_DATA.entries.length })
    setLeaving(true)
    advance(() => {})
  }

  // Settings holds the connector grid and inbox address; RequireAuth only lets finished accounts in.
  function openSettings() {
    update({ forwarded: true })
    navigate('/settings')
  }

  function view(index: number) {
    seen(csvs[index].name)
    openModal(<SampleFiles csvs={csvs} start={index} onSeen={seen} onClose={close} />)
  }

  function evidence(finding: Finding) {
    openModal(<div className="demo-modal demo-evidence">
      <div className="demo-modal-head"><div><h2>Evidence</h2><p className="r-note">Each source side by side, from the sample files</p></div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={close}><X aria-hidden /></button></div>
      <FindingDetail finding={finding} dayLabel={dayLabel} />
    </div>)
  }

  async function ask(question: string) {
    if (!question.trim() || asking) return
    const id = ++asked.current
    const history: { role: 'user' | 'assistant'; text: string }[] = asides.filter((aside) => !aside.failed && aside.reply.trim()).slice(-10)
      .flatMap((aside) => [{ role: 'user', text: aside.question }, { role: 'assistant', text: aside.reply }])
    const edit = (patch: Partial<Aside>) => setAsides((previous) => previous.map((aside) => aside.id === id ? { ...aside, ...patch } : aside))
    setDraft('')
    setAsking(true)
    setAsides((previous) => [...previous, { id, turn: step, question, reply: '' }])
    let text = ''
    try {
      // ponytail: replies are read-only here; actions the agent proposes are dropped until setup can apply them safely.
      for await (const event of stream(question, systemPrompt(context), session.current, history)) {
        if (event.error) throw new Error(event.error)
        if (event.text) { text += event.text; edit({ reply: parseActions(text).text }) }
        if (event.done) { session.current = event.sessionId ?? session.current; break }
      }
      if (!text.trim()) throw new Error('empty')
    } catch {
      edit({ failed: true })
    } finally {
      setAsking(false)
    }
  }

  function addDocs(files: { name: string; text?: string }[]) {
    const { proposals, incoming } = propose(state, files)
    update({ proposals })
    setEvents((previous) => [...previous, { id: ++asked.current, kind: 'doc', name: files.map((file) => file.name).join(', '), items: incoming, reading: true }])
  }

  async function drop(files: FileList | null) {
    if (!files?.length) return
    // Plain text is read clause by clause; PDFs and Word files go through the name-based stand-in extractor.
    addDocs(await Promise.all(Array.from(files, async (file) => ({ name: file.name, ...(/\.(txt|csv)$/i.test(file.name) ? { text: await file.text() } : {}) }))))
  }

  function addTyped(text: string) {
    const rule = compileRule(text), ask = clarify(rule.sentence)
    if (!ask) update({ customRules: [...state.customRules, rule] })
    setEvents((previous) => [...previous, { id: ++asked.current, kind: 'typed', text, rule, ask, saved: !ask }])
  }

  function closeCustomRule() {
    setCustomRule(null)
    document.getElementById('custom-rule-toggle')?.focus()
  }

  function answerTyped(id: number, rule: CustomDeskRule, answer: string) {
    const done = withThreshold(rule, answer)
    update({ customRules: [...state.customRules, done] })
    setEvents((previous) => previous.map((event) => event.id === id && event.kind === 'typed' ? { ...event, rule: done, saved: true } : event))
  }

  function chooseFiles() {
    fileInput.current?.click()
  }

  function acceptAll(ids: string[]) {
    update(state.proposals.filter((proposal) => ids.includes(proposal.id))
      .reduce((book, proposal) => acceptProposal(book, proposal), { customRules: state.customRules, rules: state.rules, proposals: state.proposals }))
  }

  const row = (finding: Finding, said: string, why?: string) => <li key={finding.id}>
    <button type="button" className="agent-finding" aria-haspopup="dialog" onClick={() => evidence(finding)}>
      <span className="agent-finding-text">{said}{why && <span className="r-note">{why}</span>}</span>
      <FindingAmount label={finding.amountLabel || finding.hoursLabel} />
      <Tag>{due[finding.deadline]}</Tag>
    </button>
  </li>
  const chips = (options: string[], picked: string[], pick: (value: string) => void): Option[] =>
    options.map((label) => ({ label, active: picked.includes(label), pick: () => pick(label) }))
  // Long intake lists show five, anything picked, and the escape hatches, until More… is chosen.
  const shorten = (options: Option[]) => more || options.length <= 8 ? options
    : [...options.map((option, i) => i < 5 || option.active || UNKNOWN.includes(option.label) ? option : { ...option, hidden: true }), { label: 'More…', pick: () => setMore(true) }]
  const one = (options: string[], value: string, save: (value: string) => void, open = ['Other', 'Varies by client']) =>
    shorten(chips(options, [value], (label) => { save(label); if (!open.includes(label)) advance() }))
  const many = (options: string[], values: string[], save: (values: string[]) => void) =>
    shorten(chips(options, values, (label) => save(flip(values.filter((value) => ONLY.includes(label) === ONLY.includes(value)), label))).map((option) => ({ ...option, multi: true })))
  // Typed answers lead the picks, so the first one is primary, and move on: options they name, and names the list doesn't have.
  const own = (options: string[], values: string[], save: (values: string[]) => void, placeholder: string) => ({ placeholder, save: (text: string) => {
    const picked = [...new Set([...typedPicks(text, options), ...values])]
    save(picked.some((value) => !ONLY.includes(value)) ? picked.filter((value) => !ONLY.includes(value)) : picked)
    advance()
  } })
  const next = (answered: string | string[]) => ({ label: answered.length ? 'Continue' : 'Skip for now', run: () => advance() })
  const picks = (values: string[]) => values.join(', ') || 'Skip for now'
  const varies = d.period === 'Varies by client'
  const addCycle: Option = { label: 'Add another', pick: () => { setCycleName(''); setCycleForm(null) } }, oneCycle: Option = { label: 'No, just this one', pick: () => advance() }

  const rulebook = <div className="convo-card rulebook">
    {RULEBOOK.map((group) => <details key={group.title}>
      <summary><b>{group.title}</b><span className="num">{group.rules.length}</span></summary>
      <ul>{group.rules.map((rule) => <li key={rule.id}><ScrollText size={14} aria-hidden /><div>{rule.sentence}<span>{rule.cite}</span></div></li>)}</ul>
    </details>)}
    <p className="rulebook-more">Also in my catalog, ready to switch on: {CATALOG.length} rule packs, including {list(CATALOG_STATES.filter((name) => name !== 'California'))}</p>
  </div>

  const ruleEvents = events.map((event) => {
    if (event.kind === 'typed') return <div key={event.id} className="convo-aside">
      <p className="convo-user">{event.text}</p>
      <div className="convo-agent"><img className="convo-mark" src={mark} alt="" /><div className="convo-body">
        {event.saved ? <p>Added {event.rule.sentence} as a draft on the Rules tab</p> : <>
          <p>{event.ask?.question}</p>
          <div className="convo-chips">{event.ask?.options.map((option) => <Chip key={option} onClick={() => answerTyped(event.id, event.rule, option)}>{option}</Chip>)}</div>
        </>}
      </div></div>
    </div>
    const status = (item: Proposal) => state.proposals.some((p) => p.id === item.id) ? 'pending' : state.customRules.some((rule) => rule.id === item.id) ? 'accepted' : 'skipped'
    const pending = event.items.filter((item) => status(item) === 'pending'), accepted = event.items.filter((item) => status(item) === 'accepted')
    const who = event.items[0]?.scope
    // Rules start with the open week, or on their own effective date if that comes later.
    const effective = event.items.find((item) => accepted.includes(item))?.effective
    const from = effective && new Date(`${effective}T00:00`) > open.end ? `from ${md(new Date(`${effective}T00:00`))}, when they take effect` : `from the week ending ${md(open.end)}`
    return <div key={event.id} className="convo-aside">
      <p className="convo-user">{event.name === SAMPLE_CONTRACT.name ? 'Try a sample contract' : `Dropped ${event.name}`}</p>
      <div className="convo-agent"><img className="convo-mark" src={mark} alt="" /><div className="convo-body">
        <Thinking checks={[`Reading ${event.name}`, `Found ${event.items.length} ${event.items.length === 1 ? 'rule' : 'rules'}`, 'Checked them against the rulebook']}
          summary={`Read ${event.name} · ${event.items.length} ${event.items.length === 1 ? 'rule' : 'rules'}`} pace={450} live={event.reading}
          onDone={() => setEvents((previous) => previous.map((e) => e.id === event.id ? { ...e, reading: false } : e))} />
        {!event.reading && (event.items.length === 0 ? <p>These rules are already in your rulebook or waiting for review</p> : <>
          <ul className="convo-card proposals">{event.items.map((item) => <li key={item.id}>
            <span className="proposal-text">{item.text}<span>{[item.scope, item.cite, item.effective && `Effective ${item.effective}`].filter(Boolean).join(' · ')}</span></span>
            {status(item) === 'pending' ? <span className="proposal-actions">
              <Btn onClick={() => update(acceptProposal(state, item))}>Accept</Btn>
              <Btn onClick={() => update({ proposals: state.proposals.filter((p) => p.id !== item.id) })}>Skip</Btn>
            </span> : <Tag>{status(item) === 'accepted' ? 'Added' : 'Skipped'}</Tag>}
          </li>)}</ul>
          {pending.length > 1 && <Btn className="convo-accept-all" onClick={() => acceptAll(pending.map((item) => item.id))}>Accept all {pending.length}</Btn>}
          {pending.length === 0 && <p className="convo-in">{accepted.length
            ? `Added ${accepted.length} ${accepted.length === 1 ? 'rule' : 'rules'}${who ? ` for ${who}` : ''}. I'll apply them ${from}.`
            : 'Skipped them all. Nothing changed.'}</p>}
        </>)}
      </div></div>
    </div>
  })

  /** Each turn: what the agent says, what it shows once said, how the user answers, and the bubble that answer becomes. */
  const turns: { say: string; body?: ReactNode; thread?: ReactNode; options?: Option[]; primary?: { label: string; run(): void }; extra?: ReactNode; belowOptions?: ReactNode; said: string
    typed?: { placeholder: string; save(text: string): void } }[] = [
    { say: 'Hi, I\'m your Payroll Agent. A few quick questions about your Payroll, then what I\'d catch on a sample week. Estimates and not sure are fine, and no Payroll data is needed. About 3 minutes.',
      primary: { label: 'Let\'s start', run: () => advance() }, said: 'Let\'s start' },
    { say: 'What pay period covers most of your volume?',
      options: one([...PAY_PERIODS, 'Not sure'], d.period, (period) => update({ discovery: { ...d, period }, ...(FREQUENCY[period] ? { frequency: FREQUENCY[period] } : {}) }), []),
      said: d.period || 'Skip for now' },
    { say: varies ? 'Which calendar are most of your workers on?'
      : `Here's how I understand your pay calendar: ${monthly ? state.frequency.toLowerCase() : `${state.frequency.toLowerCase()}, weeks end ${state.periodEndDay}`}, hours due ${weekday(week.cutoff)}, Payroll closes ${weekday(week.deadline)}, ${paid}. Right?`,
      ...(changing || varies
        ? { extra: <div className="convo-card convo-calendar"><PayrollCalendar /></div>, primary: { label: 'Done', run: () => advance() } }
        : { options: [{ label: 'That\'s right', pick: () => advance() }, { label: 'Change', pick: () => setChanging(true) }] }), said: calendar },
    { say: 'Any other pay cycles?',
      thread: state.cohorts.length > 0 && <>
        {state.cohorts.map((cohort) => <button key={cohort.id} type="button" className="convo-user" title="Edit this pay cycle" disabled={leaving}
          onClick={() => { reopen(CYCLES); setCycleForm(cohort.id) }}>{cycleLine(cohort, true)}</button>)}
        <div className="convo-agent"><img className="convo-mark" src={mark} alt="" /><div className="convo-body"><p>Any others?</p></div></div>
      </>,
      ...(cycleForm !== undefined
        ? { extra: <div className="convo-card convo-calendar"><PayCycleForm key={cycleForm ?? `new-${cycleName}`} id={cycleForm} name={cycleName} onClose={() => setCycleForm(undefined)} /></div> }
        : { options: state.cohorts.length ? [addCycle, { label: 'That\'s all', pick: () => advance() }] : varies ? [addCycle, oneCycle] : [oneCycle, addCycle],
          typed: { placeholder: 'Or type who is on it, e.g. Clerical', save: (name: string) => { setCycleName(name); setCycleForm(null) } } }),
      said: state.cohorts.length ? 'That\'s all' : 'No, just this one' },
    { say: 'About how many worker payments go out in a typical pay period?', options: one([...PAYOUTS, 'Not sure'], d.payouts, (payouts) => setD({ payouts })),
      typed: { placeholder: 'Or type a number, e.g. 1,800', save: (payouts: string) => { setD({ payouts }); advance() } }, said: d.payouts || 'Skip for now' },
    { say: 'How do workers send you their time?',
      options: many(WORKER_CHANNELS, d.workerChannels, (workerChannels) => setD({ workerChannels })),
      typed: own(WORKER_CHANNELS, d.workerChannels, (workerChannels) => setD({ workerChannels }), 'Or type yours, e.g. Bullhorn T&A'),
      primary: next(d.workerChannels), said: picks(d.workerChannels) },
    { say: 'How do workers clock in at the client site?', options: many([...CLIENT_TIME, 'Other', 'Not applicable'], d.clientTime, (clientTime) => setD({ clientTime })),
      typed: own([...CLIENT_TIME, 'Other', 'Not applicable'], d.clientTime, (clientTime) => setD({ clientTime }), 'Or type the timeclock, e.g. Replicon'),
      primary: next(d.clientTime), said: picks(d.clientTime) },
    { say: 'How do clients send you approved time?', options: many(APPROVED, d.approved, (approved) => setD({ approved })),
      typed: own(APPROVED, d.approved, (approved) => setD({ approved }), 'Or type how, e.g. a shared Google Sheet'),
      primary: next(d.approved), said: picks(d.approved) },
    { say: intro ? `${intro} Here's a sample week like that.` : `Here's a sample week ending ${md(week.end)}, from three places time usually comes from.`,
      body: <>
        <ul className="demo-files">{csvs.map((csv, i) => <li key={csv.name} className="convo-card demo-file">
          <FileSpreadsheet size={18} aria-hidden />
          <span className="demo-file-name"><b>{csv.name}</b><span>{csv.label}</span></span>
          <span className="demo-file-count num">{csv.count}{viewed.includes(csv.name) && <span className="demo-viewed"><CheckIcon size={12} aria-hidden />Viewed</span>}</span>
          <Btn aria-haspopup="dialog" onClick={() => view(i)}>View</Btn>
        </li>)}</ul>
        <p>Open any of them. They look fine on their own. The problems only show up when you put them side by side.</p>
      </>,
      primary: { label: 'Show Me the Magic', run: () => advance() }, said: 'Show Me the Magic' },
    { say: 'Putting all three side by side',
      body: <>
        <p className="demo-headline"><b>{found.length} issues across 3 files</b> · ${atStake.toLocaleString()} at stake this week</p>
        <p>{fixed.length ? `${fixed.length === 1 ? 'This one' : `These ${fixed.length}`} I would fix on my own:` : 'I wouldn\'t fix any of these on my own'}</p>
        {fixed.length > 0 && <ul className="convo-card agent-findings">{fixed.map((finding) => row(finding, DID[finding.id]?.(finding.cases.length, run) ?? finding.action))}</ul>}
        <p>{fixed.length ? 'And these' : 'These'} {stopped.length} I would bring to you:</p>
        <ul className="convo-card agent-findings">{stopped.map(({ finding, why }) => row(finding, finding.summary, why))}</ul>
      </>,
      options: [{ label: 'Makes sense', pick: () => advance() }], said: 'Makes sense' },
    { say: 'Which system pays your workers?', options: one([...PAYROLL, 'Other', 'Not sure'], d.payroll, (payroll) => setD({ payroll })),
      ...(d.payroll === 'Other' ? { primary: next(d.payroll) } : {}),
      typed: { placeholder: 'Or type your Payroll system', save: (payroll: string) => { setD({ payroll }); advance() } }, said: d.payroll || 'Skip for now' },
    { say: 'Which system invoices clients?', options: one([...BILLING, 'Other', 'Not sure'], d.billing, (billing) => setD({ billing })),
      ...(d.billing === 'Other' ? { primary: next(d.billing) } : {}),
      typed: { placeholder: 'Or type your billing system', save: (billing: string) => { setD({ billing }); advance() } }, said: d.billing || 'Skip for now' },
    { say: 'Which VMS do you use?', options: many([...VMS, 'Other', 'Not applicable'], d.vms, (vms) => setD({ vms })),
      typed: own([...VMS, 'Other', 'Not applicable'], d.vms, (vms) => setD({ vms }), 'Or type your VMS'),
      primary: next(d.vms), said: picks(d.vms) },
    { say: `I checked the sample against ${RULE_COUNT} wage and hour rules: federal overtime plus California's, as Texas adds nothing beyond federal.`,
      body: <>{rulebook}<p>Every firm has rules of its own: client contracts, rate cards, union agreements, facility policies. Drop any you use, or just type one.</p>{ruleEvents}</>,
      extra: <>
        <button type="button" className="btn drop convo-drop" onClick={chooseFiles}
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void drop(event.dataTransfer.files) }}>
          <Upload size={16} aria-hidden />Drop a contract, rate card or policy<span className="r-note">PDF, DOCX, TXT or CSV</span></button>
      </>,
      options: [...(events.some((event) => event.kind === 'doc' && event.name === SAMPLE_CONTRACT.name) ? [] : [{ label: 'Try a sample contract', pick: () => addDocs([SAMPLE_CONTRACT]) }]),
        { id: 'custom-rule-toggle', label: 'Add a custom rule', pick: () => setCustomRule((text) => text ?? '') },
        { label: added ? 'That\'s all for now' : 'Skip for now', pick: () => advance() }],
      belowOptions: customRule !== null && <form className="convo-custom-rule" onSubmit={(event) => {
        event.preventDefault()
        const text = customRule.trim()
        if (text) addTyped(text)
        closeCustomRule()
      }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeCustomRule() } }}>
        <input className="convo-input" autoFocus value={customRule} onChange={(event) => setCustomRule(event.target.value)}
          placeholder="E.g. Flag any meal break under 30 minutes" aria-label="Custom rule" />
        <Btn type="submit">Add</Btn>
      </form>, said: added ? 'That\'s all for now' : 'Skip for now' },
    { say: `${added ? '' : 'You can add rules any time on the Rules tab. '}When you're ready, I can look at a real week. Nothing is needed today.`,
      body: <ul className="convo-card convo-trust">{TRUST.map((line) => <li key={line}><Lock size={12} aria-hidden />{line}</li>)}</ul>,
      options: [{ label: 'Connect read-only', pick: openSettings }, { label: 'Send one week of one client', pick: openSettings },
        { label: 'Start with the sample', pick: finish }], said: 'Start with the sample' },
  ]
  const current = turns[step - 1]
  const ready = phase === 'ready' && !asking && !leaving

  function submit() {
    const text = draft.trim()
    if (!text) return
    // Questions go to the agent. Anything else answers the open question: an answer it names, else the turn's typed answer.
    const answers = [...(current.options ?? []).filter((option) => option.label !== 'More…'), ...(current.primary ? [{ label: current.primary.label, pick: current.primary.run }] : [])]
    const answer = ready && !text.endsWith('?') ? answers[typedPick(text, answers.map((option) => option.label))] : undefined
    if (answer) {
      setDraft('')
      if (!answer.multi) answer.pick()
      else { if (!answer.active) answer.pick(); current.primary?.run() }
    } else if (current.typed && ready && !text.endsWith('?')) { setDraft(''); current.typed.save(text) }
    else void ask(text)
  }

  // Number keys pick an answer and Enter continues, unless a field or a popup has focus.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (!ready || event.metaKey || event.ctrlKey || event.altKey || target.closest('input, textarea, select, [role="dialog"]')) return
      const option = current.options?.filter((choice) => !choice.hidden)[Number(event.key) - 1]
      if (option) { event.preventDefault(); option.pick() }
      else if (event.key === 'Enter' && current.primary && !target.closest('button, summary, a')) { event.preventDefault(); current.primary.run() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const thinking = (n: number, live: boolean) => n === FILES
    ? <Thinking checks={makes} summary={`Made three sample files for the week ending ${md(week.end)}`} pace={350} live={live} onDone={() => setPhase('ready')} />
    : <Thinking checks={MAGIC_LINES} summary={`Checked ${SAMPLE_DATA.workers.toLocaleString()} workers across three systems`} pace={700} live={live} onDone={() => setPhase('ready')} />

  return <div className="convo">
    <header className="convo-head">
      {state.forwarded && <Btn className="ghost convo-exit" onClick={() => navigate('/settings')}><X size={14} aria-hidden />Exit setup</Btn>}
      <span>{step} of {TURNS}</span>
      <Btn className="ghost convo-skip" onClick={() => { update({ forwarded: true }); navigate('/timesheets') }}>Skip</Btn>
    </header>
    <div className="convo-progress" style={{ '--progress': step / TURNS } as CSSProperties}><span /></div>
    <div className="convo-scroll scroll">
      <div className="convo-column" aria-live="polite">
        {turns.slice(0, step).map((turn, index) => {
          const n = index + 1, now = n === step, demo = n === FILES || n === MAGIC
          const saying = now && phase === 'say' && !leaving, shown = !now || phase === 'ready' || phase === 'typing'
          return <section key={n} className={now ? 'convo-turn' : 'convo-turn past'} ref={now ? live : undefined}>
            <div className="convo-agent">
              <img className="convo-mark" src={mark} alt="" />
              <div className="convo-body">
                <Say text={turn.say} live={saying} onDone={() => setPhase(demo ? 'think' : 'ready')} />
                {demo && (!now || phase !== 'say') && thinking(n, now && phase === 'think')}
                {turn.body && shown && <div className={now ? 'convo-body convo-in' : 'convo-body'}>{turn.body}</div>}
              </div>
            </div>
            {asides.filter((aside) => aside.turn === n).map((aside) => <div key={aside.id} className="convo-aside">
              <p className="convo-user">{aside.question}</p>
              <div className="convo-agent">
                <img className="convo-mark" src={mark} alt="" />
                <div className="convo-body">{aside.failed ? <p className="convo-quiet">I can't answer free text right now; pick an option below</p>
                  : aside.reply ? aside.reply.split(/\n{2,}/).map((part, i) => <p key={i}>{part}</p>) : <span className="convo-dots" aria-label="Typing"><i /><i /><i /></span>}</div>
              </div>
            </div>)}
            {shown && turn.thread}
            {now && ready && <div ref={controls} className="convo-controls convo-in">
              {turn.extra}
              {turn.options && <div className="convo-chips">{turn.options.filter((option) => !option.hidden).map((option) => <Chip key={option.label} id={option.id} active={option.active} aria-pressed={option.active} onClick={option.pick}>{option.label}</Chip>)}</div>}
              {turn.belowOptions}
              {turn.primary && <Btn className="primary convo-primary" onClick={turn.primary.run}>{turn.primary.label}</Btn>}
            </div>}
            {(!now || phase === 'typing' || leaving) && <button type="button" className="convo-user" title="Change this answer" disabled={leaving}
              onClick={() => reopen(n)}>{turn.said}</button>}
            {now && phase === 'typing' && !leaving && <span className="convo-dots" aria-label="Typing"><i /><i /><i /></span>}
            {now && leaving && (phase === 'typing' ? <span className="convo-dots" aria-label="Typing"><i /><i /><i /></span>
              : <div className="convo-agent"><img className="convo-mark" src={mark} alt="" /><div className="convo-body">
                <Say text={HANDOFF_LINE} live={phase === 'say'}
                  onDone={() => schedule(() => { update({ forwarded: true }); navigate(intakeHref(week.id)) }, 800)} /></div></div>)}
          </section>
        })}
        <div ref={end} />
      </div>
    </div>
    <input ref={fileInput} hidden type="file" multiple accept=".pdf,.docx,.txt,.csv" aria-label="Choose contracts, rate cards or policies" onChange={(event) => { void drop(event.target.files); event.target.value = '' }} />
    {step !== RULES && <form className="convo-composer" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <input className="convo-input" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={leaving}
        placeholder={ready && current.typed ? current.typed.placeholder : 'Ask me anything, or answer in your own words'} aria-label="Ask the agent" />
      <button type="submit" className="convo-send" aria-label="Send" disabled={!draft.trim() || asking || leaving}><ArrowUp size={16} aria-hidden /></button>
    </form>}
  </div>
}
