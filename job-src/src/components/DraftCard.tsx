import { useState } from 'react'
import { BrainCircuit, Check, Copy, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui'
import { shortTime } from '@/lib/utils'
import { stripMarkdown } from '@/lib/stripMarkdown'
import type { Candidate, Draft } from '@/types'

export function DraftCard({
  candidate,
  draft,
  writable,
  sending,
  onSend,
}: {
  candidate: Candidate
  draft: Draft
  writable: boolean
  sending: boolean
  onSend: () => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const copy = async () => {
    await navigator.clipboard.writeText(draft.text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const send = async () => {
    setError('')
    try {
      await onSend()
    } catch {
      setError('Could not send. Try again.')
    }
  }

  return (
    <div className="ml-auto w-full max-w-[min(85%,46rem)]">
      <div className="rounded-lg border bg-card animate-fade-in">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="text-[10px] font-medium text-muted-foreground">
            Draft → {candidate.name} · {shortTime(draft.createdAt)}
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-pending">Pending</span>
        </div>

        <div className="px-4 py-3.5 text-[13.5px] leading-relaxed">
          <p className="mb-2 text-[12px] font-medium">{draft.subject}</p>
          <p className="whitespace-pre-wrap">{stripMarkdown(draft.text)}</p>
          {draft.rationale && (
            <div className="mt-3 flex items-start gap-2 px-2 text-[12.5px] text-muted-foreground">
              <BrainCircuit className="mt-0.5 size-3.5 shrink-0" />
              <span>{draft.rationale}</span>
            </div>
          )}
          {error && <p className="mt-3 px-2 text-[12.5px] text-nosource">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t px-3 py-1.5">
          <Button variant="ghost" size="xs" onClick={() => void copy()}>
            {copied ? <Check className="size-3 text-solid" /> : <Copy className="size-3" />}{' '}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {writable && (
            <Button size="sm" disabled={sending} onClick={() => void send()}>
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {sending ? 'Sending' : 'Send'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
