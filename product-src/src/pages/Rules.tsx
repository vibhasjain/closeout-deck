import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { RULES } from '@/bench/engine.js'
import { BucketTag } from '@/components/BucketTag'
import { RuleDetail } from '@/components/RuleDetail'
import { useSetChatContext, useSetChatSuggestions } from '@/components/chat/ChatPane'
import { useAux } from '@/components/shell/Aux'
import { useOverlay } from '@/components/shell/Overlay'
import { Btn, Lbl, Toolbar } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { titleCase } from '@/lib/utils'
import { kindLabel, topstats, useDesk } from '@/lib/desk'
import { useOnboarding, type CustomDeskRule } from '@/lib/onboarding'
import { formatRuleDate, formatRuleSource, formatRuleText, getRuleActivity, type Proposal, type RuleActivity } from '@/lib/rules'
import { acceptProposal, clarify, compileRule, propose, withThreshold } from '@/lib/ruleIntake'
import './rules.css'

function activateRow(event: KeyboardEvent<HTMLTableRowElement>, select: () => void) {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
  event.preventDefault()
  select()
}

interface TableRule extends RuleActivity {
  id: string
  sentence: string
  search: string
}

function RuleComposer({ onSave, onCancel }: { onSave(rule: CustomDeskRule): void; onCancel(): void }) {
  const [sentence, setSentence] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [compiled, setCompiled] = useState<CustomDeskRule | null>(null)
  const [answer, setAnswer] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const ask = compiled && clarify(compiled.sentence)

  function compile() {
    if (compiling || !sentence.trim()) return
    setCompiling(true)
    timer.current = setTimeout(() => {
      setCompiled(compileRule(sentence))
      setCompiling(false)
    }, 900)
  }

  return <DialogContent className="sm:max-w-lg">
    <DialogHeader><DialogTitle>Add a Rule</DialogTitle></DialogHeader>
    {compiled ? <>
      <div className="rule-compiled">
        <p className="r-sent">{formatRuleText(compiled.sentence)}</p>
        {ask && <div className="ask">
          <span className="wq">{ask.question}</span>
          <div>{ask.options.map((option) => <button type="button" key={option} className={`wopt${answer === option ? ' active' : ''}`} aria-pressed={answer === option} onClick={() => setAnswer(option)}>{titleCase(option)}</button>)}</div>
        </div>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => { setCompiled(null); setAnswer('') }}>Edit Sentence</Button>
        <Button disabled={!!ask && !answer} onClick={() => onSave(withThreshold(compiled, answer))}>Add Rule</Button>
      </DialogFooter>
    </> : <>
      <Textarea autoFocus className="min-h-32" aria-label="Write the rule" placeholder="Flag a meal break shorter than 30 minutes" value={sentence} disabled={compiling} onChange={(event) => setSentence(event.target.value)} />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button disabled={!sentence.trim() || compiling} onClick={compile}>{compiling ? 'Compiling…' : 'Compile'}</Button>
      </DialogFooter>
    </>}
  </DialogContent>
}

export function Rules() {
  const [state, update] = useOnboarding()
  const { current, cycles } = useDesk()
  const { toast } = useOverlay()
  const [composing, setComposing] = useState(false)
  const [params, setParams] = useSearchParams()
  const [searchOpen, setSearchOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const query = params.get('q') ?? ''
  const requested = params.get('rule') ?? ''
  const allRules: TableRule[] = [
    ...RULES.map((rule): TableRule => ({ ...rule, ...getRuleActivity(rule.id, cycles, state), sentence: formatRuleText(rule.sentence), search: `${rule.source.doc} ${rule.source.cite ?? ''}` })),
    ...state.customRules.map((rule): TableRule => ({ ...rule, ...getRuleActivity(rule.id, cycles, state), sentence: formatRuleText(rule.sentence), search: rule.source.doc })),
  ]
  const matches = (rule: TableRule) => `${rule.sentence} ${kindLabel(rule.id)} ${rule.search}`.toLowerCase().includes(query.trim().toLowerCase())
  // Rules sit together by bucket, the one classification a rule has.
  const rows = allRules.filter(matches).sort((a, b) => kindLabel(a.id).localeCompare(kindLabel(b.id)))
  const proposals = state.proposals.filter((proposal) => !state.customRules.some((rule) => rule.id === proposal.id)
    && `${proposal.id} ${proposal.text} ${proposal.source} ${proposal.cite ?? ''} ${proposal.scope ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const defaultId = rows.find((rule) => rule.id === 'CA-MB-01')?.id ?? rows[0]?.id
  const selected = rows.some((rule) => rule.id === requested) || proposals.some((rule) => rule.id === requested)
    ? requested : defaultId ?? proposals[0]?.id ?? ''

  // The initial selection is shareable too; filters and row selection have one URL source of truth.
  useEffect(() => {
    if (requested !== selected) setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (selected) next.set('rule', selected); else next.delete('rule')
      return next
    }, { replace: true })
  }, [requested, selected, setParams])

  function selectRule(id: string) {
    setParams((previous) => { const next = new URLSearchParams(previous); next.set('rule', id); return next })
  }
  function filter(key: 'q', value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set(key, value); else next.delete(key)
      next.delete('rule')
      return next
    }, { replace: true })
  }
  function ingest(files: FileList | null) {
    if (!files?.length) return
    const { proposals, incoming } = propose(state, Array.from(files, (file) => ({ name: file.name })))
    update({ proposals })
    toast(incoming.length ? `${incoming.length} proposed rules ready to review` : 'These rules are already in your rulebook or waiting for review')
  }
  function accept(proposal: Proposal) {
    update(acceptProposal(state, proposal))
    setParams((previous) => {
      const next = new URLSearchParams({ rule: proposal.id })
      if (previous.get('agent') === '1') next.set('agent', '1')
      return next
    })
    toast('Rule accepted')
  }
  function saveRule(rule: CustomDeskRule) {
    update({ customRules: [...state.customRules, rule] })
    setParams((previous) => {
      const next = new URLSearchParams({ rule: rule.id })
      if (previous.get('agent') === '1') next.set('agent', '1')
      return next
    })
    setComposing(false)
    toast('Rule added')
  }

  useSetChatSuggestions(['Which rules fired this cycle?', 'Where did this rule come from?', 'Add a rule for my contract'])
  useSetChatContext({ page: 'Rules', cycle: { id: current.id, label: current.label, stats: topstats(current, state.resolutions) }, selection: selected ? { ruleId: selected, sentence: allRules.find((rule) => rule.id === selected)?.sentence ?? proposals.find((rule) => rule.id === selected)?.text } : undefined, rules: allRules.map(({ id, sentence }) => ({ id, sentence })) })
  useAux(selected ? <RuleDetail ruleId={selected} /> : null)

  return <div className={`rules-page${dragging ? ' dragging' : ''}`}
    onDragEnter={(event) => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }}
    onDragOver={(event) => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }}
    onDragLeave={() => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (!dragDepth.current) setDragging(false)
    }}
    onDrop={(event) => {
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      ingest(event.dataTransfer.files)
    }}>
    <Toolbar className="rules-toolbar">
      {searchOpen || query ? <input autoFocus className="q-input rules-search" type="search" aria-label="Search rules" placeholder="Search rules…" value={query} onChange={(event) => filter('q', event.target.value)} onBlur={() => { if (!query) setSearchOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') { filter('q', ''); setSearchOpen(false) } }} /> : <button type="button" className="icon-btn sm dim" aria-label="Search rules" onClick={() => setSearchOpen(true)}><Search size={14} /></button>}
      <div className="flex-1" />
      <Dialog open={composing} onOpenChange={setComposing}>
        <Btn onClick={() => setComposing(true)}>Add Rule</Btn>
        {composing && <RuleComposer onSave={saveRule} onCancel={() => setComposing(false)} />}
      </Dialog>
      <Btn onClick={() => fileInput.current?.click()}>Add Contracts</Btn>
    </Toolbar>
    <input ref={fileInput} hidden type="file" multiple aria-label="Choose contracts, CBAs or handbooks" onChange={(event) => { ingest(event.target.files); event.target.value = '' }} />
    {(rows.length > 0 || proposals.length > 0) && <div className="sheet-wrap scroll rules-table-wrap">
      {proposals.length > 0 && <section className="rule-proposals" aria-label="Rules to review">
        <Lbl>Rules to review</Lbl>
        <ul>{proposals.map((proposal) => <li key={proposal.id} data-proposal={proposal.id}>
          <BucketTag ruleId={proposal.id} />
          <button type="button" className="r-sent rule-proposal-text" aria-pressed={selected === proposal.id} onClick={() => selectRule(proposal.id)}>{formatRuleText(proposal.text)}</button>
          <span className="rule-document">{formatRuleSource(proposal.source)}{proposal.cite ? ` · ${proposal.cite}` : ''}</span>
          {proposal.conflict && <p className="r-note">{formatRuleText(proposal.conflict)}</p>}
          <div className="rule-proposal-actions">
            <Btn onClick={() => accept(proposal)}>Accept</Btn>
            <Btn onClick={() => update({ proposals: state.proposals.filter((rule) => rule.id !== proposal.id) })}>Skip</Btn>
          </div>
        </li>)}</ul>
      </section>}
      {rows.length > 0 && <table className="sheet rules-sheet" aria-label="Rulebook">
        <colgroup><col className="rule-bucket-col" /><col /><col className="rule-date-col" /><col className="rule-last-used-col" /><col className="rule-uses-col" /></colgroup>
        <thead><tr><th scope="col">Bucket</th><th scope="col">Rule</th><th scope="col">Created</th><th scope="col">Last Used</th><th scope="col" className="num">Uses</th></tr></thead>
        <tbody>
          {rows.map((rule) => <tr key={rule.id} data-rule={rule.id} className={selected === rule.id ? 'sel' : undefined} tabIndex={0} aria-selected={selected === rule.id} onKeyDown={(event) => activateRow(event, () => selectRule(rule.id))} onClick={() => selectRule(rule.id)}>
            <td><BucketTag ruleId={rule.id} /></td>
            <td><span className="rule-sentence">{rule.sentence}</span></td>
            <td><time dateTime={rule.created}>{formatRuleDate(rule.created)}</time></td>
            <td>{rule.lastUsed ? <time dateTime={rule.lastUsed}>{formatRuleDate(rule.lastUsed)}</time> : null}</td>
            <td className="num rule-uses">{rule.uses.toLocaleString('en-US')}</td>
          </tr>)}
        </tbody>
      </table>}
    </div>}
  </div>
}
