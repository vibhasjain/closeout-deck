import { FirstCloseoutChoice } from './FirstCloseoutChoice'
import { Tag } from '@/components/ui'
import type { ChatMessage } from '@/lib/onboarding'
import { actionSummary } from '@/lib/chatActions'
import { FactQuestion } from './FactQuestion'

export function Message({ message, onAnswer }: { message: ChatMessage; onAnswer?(answer: string): void }) {
  const user = message.role === 'user'
  return (
    <article className={`chat-message${user ? ' user' : ''}`} aria-label={user ? 'You' : 'Closeout Agent'}>
      <div className={user ? 'chat-bubble' : 'chat-agent-text'}>
        {message.contextChip && <span className="chat-context-chip">{message.contextChip}</span>}
        {message.text && <div className="chat-text">{message.text}</div>}
        {message.cards?.map((card, index) => card.kind !== 'question' ? null : card.input === 'choice' && card.choice
          ? <FirstCloseoutChoice key={index} card={card} onAnswer={onAnswer} /> : onAnswer ? <FactQuestion key={index} card={card} onAnswer={onAnswer} /> : null)}
        {!!message.skipped?.length && <p className="chat-skipped" role="status">Skipped: {message.skipped.join('; ')}.</p>}
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
