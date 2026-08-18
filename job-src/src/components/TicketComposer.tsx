import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'

const storageKey = (candidateId: string) => `job:composer:v1:${candidateId}`

function restore(candidateId: string): string {
  try {
    return localStorage.getItem(storageKey(candidateId)) ?? ''
  } catch {
    return ''
  }
}

export function TicketComposer({
  candidateId,
  busy,
  onSendChat,
}: {
  candidateId: string
  busy: boolean
  onSendChat: (text: string) => void
}) {
  const [agent, setAgent] = useState(() => restore(candidateId))

  useEffect(() => {
    try {
      if (!agent) localStorage.removeItem(storageKey(candidateId))
      else localStorage.setItem(storageKey(candidateId), agent)
    } catch {
      /* localStorage unavailable */
    }
  }, [agent, candidateId])

  const send = () => {
    const text = agent.trim()
    if (!text || busy) return
    onSendChat(text)
    setAgent('')
  }

  return (
    <div
      className="shrink-0 border-t px-3 pt-2 md:px-4"
      style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
    >
      <p className="mb-1 text-[10px] text-internal">Goes to the agent, not the candidate.</p>
      <div className="flex items-end gap-1.5">
        <Textarea
          rows={1}
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Discuss with agent"
          className="min-h-9 text-[13px]"
        />
        <Button
          size="icon"
          variant="outline"
          onClick={send}
          disabled={busy || !agent.trim()}
          aria-label="Talk to our agent"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}
