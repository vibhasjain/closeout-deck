import { Btn } from '@/components/ui'
import type { QuestionCard } from '@/lib/chat'
import './first-closeout-choice.css'

/** Every choice is the agent's own card data, sent back into the same conversation. */
export function FirstCloseoutChoice({ card, onAnswer }: { card: QuestionCard; onAnswer?(answer: string): void }) {
  const options = card.choice ? Object.values(card.choice) : card.chips ?? []
  return <div className="first-closeout-choice" data-timesheet-set={card.set}>
    <div className="first-closeout-options">{options.map((label) => <Btn key={label} disabled={!onAnswer} onClick={() => onAnswer?.(card.set ? `Set ${card.set}: ${label}` : label)}>{label}</Btn>)}</div>
  </div>
}
