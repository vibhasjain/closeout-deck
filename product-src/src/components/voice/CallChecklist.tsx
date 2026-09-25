import { Check, ChevronDown } from 'lucide-react'
import { ONBOARD_TOPICS, type Onboarding, type OnboardTopic } from '@/lib/onboarding'
import { goalProgress } from '@/lib/coverage'

const labels: Record<OnboardTopic, string> = {
  calendar: 'Your pay calendar',
  workerHours: 'How workers report time',
  clientHours: 'How clients approve time',
  whoseHours: 'Which hours to trust',
  rates: 'Pay and bill rates',
  complaints: 'What needs a closer look',
  authority: 'What I can do for you',
}
const groups = [
  { title: 'How you run Payroll', topics: ['calendar', 'workerHours', 'clientHours', 'whoseHours', 'rates'] as OnboardTopic[] },
  { title: 'Your rules', topics: ['complaints', 'authority'] as OnboardTopic[] },
]

function ChecklistItems({ onboarding }: { onboarding: Onboarding }) {
  const covered = new Set(onboarding.covered)
  const current = ONBOARD_TOPICS.find((topic) => !covered.has(topic))
  const firm = onboarding.firm
  const facts = [firm?.summary, firm?.states.length ? firm.states.join(' · ') : null].filter((fact): fact is string => !!fact)
  return <>
    <div className="call-topic-group call-firm-preread">
      <h3>About {firm?.name || 'your firm'}</h3>
      {facts.length ? <ul>{facts.map((fact) => <li className="call-topic is-covered" key={fact}><Check size={12} aria-hidden /><span className="call-topic-label">{fact}</span><span className="sr-only"> — read before the call</span></li>)}</ul>
        : <p className="call-preread-pending">We’ll fill in the details together.</p>}
    </div>
    {groups.map((group) => <div className="call-topic-group" key={group.title}>
      <h3>{group.title}</h3>
      <ul>{group.topics.map((topic) => {
        const complete = covered.has(topic)
        return <li key={topic} className={`call-topic${complete ? ' is-covered' : ''}${current === topic ? ' is-current' : ''}`} data-topic={topic} data-covered={complete} aria-current={current === topic ? 'step' : undefined}>
          {complete ? <Check size={12} aria-hidden /> : <span className="call-topic-dot" aria-hidden />}
          {complete ? <s className="call-topic-label">{labels[topic]}</s> : <span className="call-topic-label">{labels[topic]}</span>}
          {complete && <span className="sr-only"> — covered</span>}
        </li>
      })}</ul>
    </div>)}
  </>
}

export function CallChecklist({ onboarding }: { onboarding: Onboarding }) {
  const { done, total } = goalProgress(onboarding.covered)
  return <aside className="call-checklist" aria-label="What we're covering">
    <div className="call-checklist-desktop"><h2>What we're covering</h2><ChecklistItems onboarding={onboarding} /></div>
    <details className="call-checklist-mobile"><summary><span>{done} of {total} covered</span><ChevronDown size={16} aria-hidden /></summary><h2>What we're covering</h2><ChecklistItems onboarding={onboarding} /></details>
  </aside>
}
