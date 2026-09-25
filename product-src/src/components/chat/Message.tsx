import { FirstCloseoutChoice } from './FirstCloseoutChoice'
import { Tag } from '@/components/ui'
import type { ChatMessage } from '@/lib/onboarding'
import { actionSummary } from '@/lib/chatActions'
import { FactQuestion } from './FactQuestion'
import { TaskCard } from '@/components/journey/TaskCard'
import { FindingsCard } from '@/components/journey/FindingsCard'
import { FormCard } from '@/components/journey/FormCard'
import './journey-chat.css'

export function Message({ message, onAnswer }: { message: ChatMessage; onAnswer?(answer: string): void }) {
  const user = message.role === 'user'
  return (
    <article className={`chat-message${user ? ' user' : ''}`} aria-label={user ? 'You' : 'Closeout Agent'}>
      <div className={user ? 'chat-bubble' : 'chat-agent-text'}>
        {message.contextChip && <span className="chat-context-chip">{message.contextChip}</span>}
        {!!message.traces?.length && <div className="chat-traces" role="group" aria-label="Agent trace">{message.traces.map((trace, index) => <div key={index}>✓ {trace}</div>)}</div>}
        {message.text && <div className="chat-text">{message.text}</div>}
        {message.cards?.map((card, index) => {
          if (card.kind === 'task') return <TaskCard key={index} cycleId={card.cycleId} onAnswer={onAnswer} />
          if (card.kind === 'findings') return <FindingsCard key={index} cycleId={card.cycleId} />
          if (card.kind === 'form') return <FormCard key={index} {...card} />
          if (card.kind === 'choice') return <div key={index}><p>{card.ask}</p><FirstCloseoutChoice card={{ kind: 'question', input: 'choice', topics: [], choice: { yours: card.yours, sample: card.sample }, set: card.set }} onAnswer={onAnswer} /></div>
          return card.kind !== 'question' ? null : card.input === 'choice' && card.choice
            ? <FirstCloseoutChoice key={index} card={card} onAnswer={onAnswer} /> : onAnswer ? <FactQuestion key={index} card={card} onAnswer={onAnswer} /> : null
        })}
        {!!message.skipped?.length && <p className="chat-skipped" role="status">Skipped: {message.skipped.join('; ')}.</p>}
        {!!message.pendingActions?.length && <p role="status">Pending: {message.pendingActions.length} actions</p>}
        {message.actions?.map((action, index) => {
          const summary = actionSummary(action)
          return summary === null ? null : (
            <div key={index} className="chat-action">
              <Tag tone="blue">Applied</Tag>
              <span>{summary}</span>
            </div>
          )
        })}
      </div>
    </article>
  )
}
