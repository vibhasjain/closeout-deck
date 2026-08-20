import { BrainCircuit } from 'lucide-react'
import { CopyButton } from '@/components/ui'
import { shortTime } from '@/lib/utils'
import { stripMarkdown } from '@/lib/stripMarkdown'
import type { Candidate, Draft } from '@/types'

export function DraftCard({
  candidate,
  draft,
}: {
  candidate: Candidate
  draft: Draft
}) {
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
          <p className="whitespace-pre-wrap break-words">{stripMarkdown(draft.text)}</p>
          {draft.rationale && (
            <div className="mt-3 flex items-start gap-2 px-2 text-[12.5px] text-muted-foreground">
              <BrainCircuit className="mt-0.5 size-3.5 shrink-0" />
              <span>{draft.rationale}</span>
            </div>
          )}
        </div>

        <div className="flex items-center border-t px-3 py-1.5">
          <CopyButton text={draft.text} label />
        </div>
      </div>
    </div>
  )
}
