import { FirstCloseoutChoice } from './FirstCloseoutChoice'
import { Tag } from '@/components/ui'
import type { ChatMessage } from '@/lib/onboarding'
import { actionSummary, skippedLine } from '@/lib/chatActions'
import { FactQuestion } from './FactQuestion'
import { TaskCard } from '@/components/journey/TaskCard'
import { FindingsCard } from '@/components/journey/FindingsCard'
import { FormCard } from '@/components/journey/FormCard'
import { CallCard } from './CallCard'
import { retryCallSave } from '@/lib/callRecovery'
import { RememberLine } from '@/components/memory/RememberLine'
import { isRememberReceipt } from '@/components/memory/chatMemory'
import { Check } from 'lucide-react'
import { StreamText } from '@/components/beautiful/stream-text'
import { traceLabel } from '@/lib/chat'
import './journey-chat.css'

/** `liveCard`: the index of the newest actionable card in the pane, if it is in this message; only it keeps a black button. */
export function Message({ message, onAnswer, liveCard = -1 }: { message: ChatMessage; onAnswer?(answer: string): void; liveCard?: number }) {
  const user = message.role === 'user'
  const skipped = message.skipped?.length ? skippedLine(message.skipped) : null
  return (
    <article className={`chat-message${user ? ' user' : ''}`} aria-label={user ? 'You' : 'Closeout Agent'}>
      <div className={user ? 'chat-bubble' : 'chat-agent-text'}>
        {message.contextChip && <span className="chat-context-chip">{message.contextChip}</span>}
        {!!message.traces?.length && <div className="chat-traces" role="group" aria-label="Agent trace">{[...new Set(message.traces.map(traceLabel))].map((trace, index) => <div key={index}><Check size={12} aria-hidden /><span>{trace}</span></div>)}</div>}
        {message.text && <div className="chat-text">{message.id === 'streaming' ? <StreamText text={message.text} /> : message.text}</div>}
        {message.cards?.map((card, index) => {
          if (card.kind === 'call') return <CallCard key={card.callId} card={card} live={message.callLive} transcript={message.callTranscript} saveError={message.callSaveError} onRetrySave={() => { void retryCallSave(card.callId).catch(() => {}) }} />
          if (card.kind === 'task') return <TaskCard key={index} cycleId={card.cycleId} messageId={message.id} onAnswer={onAnswer} />
          if (card.kind === 'findings') return <FindingsCard key={index} cycleId={card.cycleId} live={index === liveCard} />
          if (card.kind === 'form') return <FormCard key={index} {...card} live={index === liveCard} />
          if (card.kind === 'choice') return <div key={index}><p>{card.ask}</p><FirstCloseoutChoice card={{ kind: 'question', input: 'choice', topics: [], choice: { yours: card.yours, sample: card.sample }, set: card.set }} onAnswer={onAnswer} /></div>
          return card.kind !== 'question' ? null : card.input === 'choice' && card.choice
            ? <FirstCloseoutChoice key={index} card={card} onAnswer={onAnswer} /> : onAnswer ? <FactQuestion key={index} card={card} onAnswer={onAnswer} /> : null
        })}
        {skipped && <p className="chat-skipped" role="status">{skipped.text}{skipped.retry && onAnswer && <> <button type="button" className="lnk" onClick={() => onAnswer('Try saving that again')}>Tap to retry</button></>}</p>}
        {!!message.pendingActions?.length && <p role="status">Pending: {message.pendingActions.length} actions</p>}
        {message.actions?.map((action, index) => {
          if (isRememberReceipt(action)) return <RememberLine key={index} receipt={action} messageId={message.id} at={message.at} />
          const summary = actionSummary(action)
          return summary === null ? null : (
            <div key={index} className="chat-action">
              <Tag>Applied</Tag>
              <span>{summary}</span>
            </div>
          )
        })}
      </div>
    </article>
  )
}
