import { Tag } from '@/components/ui'
import type { ChatMessage } from '@/lib/onboarding'

function actionSummary(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null
  const action = value as Record<string, unknown>
  switch (action.type) {
    case 'set_calendar': return `Calendar: ${JSON.stringify(action.patch)}`
    case 'add_cohort': {
      const cohort = action.cohort as { name?: string } | undefined
      return `Added pay cycle: ${cohort?.name ?? ''}`
    }
    case 'add_rule': return `Added rule: ${action.sentence}`
    case 'go': return `Opened ${action.to}`
    case 'decide': return `${action.cycleId} · #${action.shiftId} · ${action.decision === 'applied' ? 'Applied' : 'Not an issue'}${action.reason ? ` · ${action.reason}` : ''}`
    case 'note': return String(action.text ?? '')
    default: return null
  }
}

export function Message({ message }: { message: ChatMessage }) {
  const user = message.role === 'user'
  return (
    <article className={`chat-message${user ? ' user' : ''}`} aria-label={user ? 'You' : 'Closeout Agent'}>
      <div className={user ? 'chat-bubble' : 'chat-agent-text'}>
        {message.text && <div className="chat-text">{message.text}</div>}
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
