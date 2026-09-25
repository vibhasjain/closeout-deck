import { useRef, useState } from 'react'
import { Plus, Upload, X } from 'lucide-react'
import { RULES } from '@/bench/engine.js'
import { getOnboarding, useOnboarding, type Onboarding } from '@/lib/onboarding'
import { acceptProposal, compileRule, propose } from '@/lib/ruleIntake'
import { formatRuleText } from '@/lib/rules'
import { NeverContactInput } from './NeverContactInput'
import { ProfileDialog } from './ProfileDialog'

const sections = [
  { id: 'states', title: 'States' },
  { id: 'contracts', title: 'Clients and contracts' },
  { id: 'authority', title: 'What I fix on my own' },
  { id: 'refinements', title: 'Refinements' },
  { id: 'never-contact', title: 'Never contact' },
] as const
type RulebookSection = (typeof sections)[number]['id']
const stateCodes: Record<string, string> = { California: 'CA', 'New York': 'NY', Illinois: 'IL', Washington: 'WA', Pennsylvania: 'PA' }

/** Jurisdiction comes from the engine catalog, rather than a second set of rules. */
function JurisdictionRules({ states }: { states: string[] }) {
  const groups = [
    { title: 'Federal', rules: RULES.filter((rule) => rule.id.startsWith('FED-')) },
    ...states.map((name) => {
      const code = stateCodes[name] ?? name.toUpperCase()
      return { title: name, rules: RULES.filter((rule) => rule.bucket === 'State' && rule.id.startsWith(`${code}-`)
        || rule.id === 'CHI-FWW-01' && code === 'IL' || rule.id === 'REST-GAP-01' && ['NY', 'IL', 'WA', 'PA'].includes(code)) }
    }),
  ]
  return <div className="rulebook-jurisdictions">
    {states.length === 0 && <p className="profile-muted">Add the states where your team works to your Payroll profile.</p>}
    {groups.map(({ title, rules }) => <section key={title}><h4>{title}</h4>
      {rules.length ? <ul className="profile-rule-list">{rules.map((rule) => <li key={rule.id}><p>{formatRuleText(rule.sentence)}</p><span>{rule.source.doc}{rule.source.cite ? ` · ${rule.source.cite}` : ''}</span></li>)}</ul>
        : <p className="profile-muted">No state-specific rules in the current Rulebook.</p>}
    </section>)}
  </div>
}

function AuthorityEditor() {
  const [state, update] = useOnboarding()
  function save(patch: Partial<Onboarding['authority']>) {
    const current = getOnboarding()
    update({ authority: { ...current.authority, ...patch }, authorityConfigured: true, covered: current.covered.includes('authority') ? current.covered : [...current.covered, 'authority'] })
  }
  return <div className="profile-authority">
    <label className="profile-toggle"><span>Fix on my own</span><input type="checkbox" role="switch" checked={state.authority.autoFix} onChange={(event) => save({ autoFix: event.target.checked })} /></label>
    <div className="profile-authority-limits">
      <label><span>Per-entry limit ($)</span><input className="q-input" type="number" aria-label="Per-entry limit in dollars" placeholder="Per-entry limit ($)" min={0} max={10000} value={state.authority.limit} onChange={(event) => save({ limit: Math.max(0, Math.min(10000, Number(event.target.value))) })} /></label>
      <label><span>Weekly cap ($)</span><input className="q-input" type="number" aria-label="Weekly cap in dollars" placeholder="Weekly cap ($)" min={0} max={100000} value={state.authority.weeklyCap} onChange={(event) => save({ weeklyCap: Math.max(0, Math.min(100000, Number(event.target.value))) })} /></label>
    </div>
    <label className="profile-toggle"><span>Text site supervisors</span><input type="checkbox" role="switch" checked={state.authority.textSupervisors} onChange={(event) => save({ textSupervisors: event.target.checked })} /></label>
    <label className="profile-toggle"><span>Text workers</span><input type="checkbox" role="switch" checked={state.authority.textWorkers} onChange={(event) => save({ textWorkers: event.target.checked })} /></label>
  </div>
}

function ContractsEditor() {
  const [state, update] = useOnboarding()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function ingest(files: FileList | null) {
    if (!files?.length) return
    setLoading(true); setError('')
    try {
      const documents = await Promise.all(Array.from(files, async (file) => ({ name: file.name, text: file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name) ? await file.text() : undefined })))
      update({ proposals: propose(getOnboarding(), documents).proposals })
    } catch { setError('I could not read those contracts. Try adding them again.') }
    finally { setLoading(false) }
  }
  return <div className="profile-contracts">
    <input ref={fileInput} type="file" hidden multiple aria-label="Choose contracts, CBAs or handbooks" onChange={(event) => { void ingest(event.target.files); event.target.value = '' }} />
    <button type="button" className={`profile-contract-drop${dragging ? ' dragging' : ''}`} disabled={loading} onClick={() => fileInput.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void ingest(event.dataTransfer.files) }}>
      <Upload size={20} /><span>{loading ? 'Reading contracts…' : 'Drop contracts, CBAs or handbooks'}</span><span className="profile-muted">or choose files</span>
    </button>
    {error && <p role="alert">{error}</p>}
    {state.proposals.length > 0 && <ul className="profile-rule-list profile-proposal-list">{state.proposals.map((proposal) => <li key={proposal.id}>
      <span className="tag">Proposed</span><p>{formatRuleText(proposal.text)}</p><span>{proposal.source}{proposal.cite ? ` · ${proposal.cite}` : ''}</span>
      {proposal.conflict && <p>{proposal.conflict}</p>}
      <div className="profile-proposal-actions"><button type="button" className="btn" onClick={() => update(acceptProposal(getOnboarding(), proposal))}>Accept</button>
        <button type="button" className="btn" onClick={() => update({ proposals: getOnboarding().proposals.filter((item) => item.id !== proposal.id) })}>Skip</button></div>
    </li>)}</ul>}
    {state.rules.length > 0 && <ul className="profile-rule-list">{state.rules.map((rule) => <li key={rule.id}><p>{formatRuleText(rule.text)}</p><span>{rule.source}</span></li>)}</ul>}
  </div>
}

function RefinementsEditor() {
  const [state, update] = useOnboarding()
  const [sentence, setSentence] = useState('')
  function add() {
    if (!sentence.trim()) return
    update({ customRules: [...getOnboarding().customRules, compileRule(sentence)] })
    setSentence('')
  }
  return <div className="profile-refinements">
    <div className="profile-add-line"><textarea className="q-input profile-textarea" aria-label="Add a refinement" placeholder="Write a rule for how your team works…" maxLength={200} value={sentence} onChange={(event) => setSentence(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); add() } }} />
      <button type="button" className="btn profile-icon-button" aria-label="Compile and add refinement" disabled={!sentence.trim()} onClick={add}><Plus size={17} /></button></div>
    <ul className="profile-rule-list">{state.customRules.filter((rule) => !state.rules.some((contract) => contract.id === rule.id)).map((rule) => <li key={rule.id}>
      <div className="profile-rule-title"><p>{formatRuleText(rule.sentence)}</p><button type="button" className="profile-icon-button" aria-label={`Remove ${rule.sentence}`} onClick={() => update({ customRules: getOnboarding().customRules.filter((item) => item.id !== rule.id) })}><X size={15} /></button></div>
      {rule.draft && <span className="tag">Draft</span>}
    </li>)}</ul>
  </div>
}

export function RulebookModal({ onClose, initialSection = 'states' }: { onClose(): void; initialSection?: RulebookSection }) {
  const [state, update] = useOnboarding()
  const [active, setActive] = useState<RulebookSection>(initialSection)
  return <ProfileDialog title="Your Rulebook" description="What I check before every pay run. Only your team sees it." onClose={onClose} className="rulebook-modal">
    <div className="rulebook-modal-body">
      <nav className="rulebook-rail" aria-label="Rulebook sections">{sections.map((section) => <button key={section.id} type="button" aria-current={active === section.id ? 'page' : undefined} onClick={() => setActive(section.id)}>{section.title}</button>)}</nav>
      <div className="rulebook-content">
        <h3>{sections.find((section) => section.id === active)?.title}</h3>
        {active === 'states' && <JurisdictionRules states={state.firm?.states ?? []} />}
        {active === 'contracts' && <ContractsEditor />}
        {active === 'authority' && <AuthorityEditor />}
        {active === 'refinements' && <RefinementsEditor />}
        {active === 'never-contact' && <NeverContactInput value={state.neverContact ?? []} onChange={(neverContact) => update({ neverContact })} />}
      </div>
    </div>
  </ProfileDialog>
}
