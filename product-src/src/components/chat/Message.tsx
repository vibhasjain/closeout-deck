import { FirstCloseoutChoice } from './FirstCloseoutChoice'
import { Tag } from '@/components/ui'
import type { ChatMessage } from '@/lib/onboarding'
import { actionSummary } from '@/lib/chatActions'

export function Message({ message }: { message: ChatMessage }) {
  const user = message.role === 'user'
  return (
    <article className={`chat-message${user ? ' user' : ''}`} aria-label={user ? 'You' : 'Closeout Agent'}>
      <div className={user ? 'chat-bubble' : 'chat-agent-text'}>
        {message.text && <div className="chat-text">{message.text}</div>}
        {message.cards?.map((card, index) => card.kind === 'question' && card.input === 'choice' && card.choice ? <FirstCloseoutChoice key={index} choice={card.choice} /> : null)}
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
