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
  onSendChat: (text: string) => Promise<void>
}) {
  const [agent, setAgent] = useState(() => restore(candidateId))
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      if (!agent) localStorage.removeItem(storageKey(candidateId))
      else localStorage.setItem(storageKey(candidateId), agent)
    } catch {
      /* localStorage unavailable */
    }
  }, [agent, candidateId])

  const send = async () => {
    const text = agent.trim()
    if (!text || busy) return
    setError('')
    try {
      await onSendChat(text)
      setAgent('')
    } catch {
      setError('Could not send. Try again.')
    }
  }

  return (
    // On phones the Agent Keyboard pill (44px tall, 10px off the bottom) floats
    // over this row, so lift it clear whenever that widget is on the page.
    <div
      className="shrink-0 border-t px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2 max-md:[body:has(#agent-keyboard-host)_&]:pb-[calc(3.875rem+env(safe-area-inset-bottom))] md:px-4"
    >
      <div className="flex items-end gap-1.5">
        <Textarea
          rows={1}
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Discuss with agent"
          className="min-h-9 text-[13px]"
        />
        <Button
          size="icon"
          variant="outline"
          onClick={() => void send()}
          disabled={busy || !agent.trim()}
          aria-label="Talk to our agent"
        >
          <Send className="size-4" />
        </Button>
      </div>
      {error && <p className="mt-1 text-[12.5px] text-nosource">{error}</p>}
    </div>
  )
}
