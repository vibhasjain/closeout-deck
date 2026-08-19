import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, FileText, Mail, Paperclip } from 'lucide-react'
import { AttachmentViewer } from '@/AttachmentViewer'
import { ClaudeCrab } from '@/components/ClaudeCrab'
import { DraftCard } from '@/components/DraftCard'
import { FadeText } from '@/components/FadeText'
import { chipLabel } from '@/components/FilterChips'
import { ListToolbar } from '@/components/ListToolbar'
import { Badge, CopyButton, Skeleton } from '@/components/ui'
import { filterCandidates, type CandidateFilter } from '@/lib/filter'
import { linkifyHttpText, safeHttpUrl } from '@/lib/links'
import { stripMarkdown } from '@/lib/stripMarkdown'
import { cn, shortDate, shortTime } from '@/lib/utils'
import type { Attachment, Candidate, Feed, Meeting, Status, ThreadEntry } from '@/types'

const FILTERS = ['all', 'drafted', 'awaiting-reply', 'disqualified'] as const

export const STATUS_CHIP: Record<Status, string> = {
  new: '',
  drafted: 'border-transparent bg-pending/10 text-pending',
  sent: 'border-transparent bg-muted text-muted-foreground',
  'awaiting-reply': 'border-transparent bg-muted text-muted-foreground',
  'calendly-sent': 'border-transparent bg-verify/10 text-verify',
  'meeting-scheduled': 'border-transparent bg-solid/10 text-solid',
  met: 'border-transparent bg-solid/10 text-solid',
  disqualified: 'border-transparent bg-nosource/10 text-nosource',
}

function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return <Badge className={cn('shrink-0', STATUS_CHIP[status], className)}>{chipLabel(status)}</Badge>
}

function candidateAttachments(candidate: Candidate | undefined): Attachment[] {
  if (!candidate) return []
  const byPath = new Map<string, Attachment>()
  for (const entry of candidate.thread ?? []) {
    for (const attachment of entry.attachments ?? []) {
      if (attachment?.path && attachment?.name) byPath.set(attachment.path, attachment)
    }
  }
  return [...byPath.values()]
}

function autoOpenAttachment(attachments: Attachment[]): Attachment | null {
  const hasResume = attachments.some((item) => ['pdf', 'docx'].includes(item.name.split('.').pop()?.toLowerCase() ?? ''))
  const linkedinProfile = attachments.find((item) => item.name.toLowerCase() === 'linkedin-profile.png')
  if (!hasResume && linkedinProfile) return linkedinProfile
  return attachments.length === 1 ? attachments[0] : null
}

function SourceIcon({ source }: { source: Candidate['source'] }) {
  const label = source === 'linkedin' ? 'LinkedIn source' : 'Email source'
  return (
    <span className="shrink-0 text-muted-foreground/55" aria-label={label} title={label}>
      {source === 'linkedin'
        ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
              aria-hidden="true"
            >
              <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z" />
              <path d="M2 9h4v12H2z" />
              <circle cx="4" cy="4" r="2" />
            </svg>
          )
        : <Mail className="size-3" aria-hidden="true" />}
    </span>
  )
}

function LinkifiedMessageText({ text }: { text: string }) {
  return (
    <>
      {linkifyHttpText(stripMarkdown(text)).map((part, index) => part.href ? (
        <a
          key={`${part.href}-${index}`}
          href={part.href}
          target="_blank"
          rel="noopener"
          className="break-all underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
        >
          {part.text}
        </a>
      ) : part.text)}
    </>
  )
}

function MessageBubble({
  entry,
  candidate,
  onAttachment,
}: {
  entry: ThreadEntry
  candidate: Candidate
  onAttachment: (attachment: Attachment) => void
}) {
  const attachments = entry.attachments ?? []
  const internal = entry.dir === 'internal'
  const incoming = entry.dir === 'in'
  const label = internal
    ? `Agent · ${shortTime(entry.at)}`
    : incoming
      ? `${candidate.name} · ${shortTime(entry.at)}`
      : `Us → ${candidate.name} · ${shortTime(entry.at)}`

  return (
    <div
      className={cn(
        internal
          ? 'max-w-[min(82%,42rem)] self-start rounded-lg border border-dashed border-internal/30 bg-internal/[0.06] px-3.5 py-2 font-mono text-[12.5px] leading-relaxed'
          : incoming
            ? 'max-w-[min(82%,42rem)] self-start rounded-lg border bg-muted/50 px-3.5 py-2.5 text-[13.5px] leading-relaxed'
            : 'max-w-[min(82%,42rem)] self-end rounded-lg border bg-card px-3.5 py-2.5 text-[13.5px] leading-relaxed',
      )}
    >
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className={cn('text-[10px] font-medium', internal ? 'text-internal' : 'text-muted-foreground')}>
          {label}
        </span>
        {incoming && <CopyButton text={stripMarkdown(entry.text)} />}
      </div>
      {entry.subject && (
        <FadeText text={entry.subject} className="mb-1 text-[11px] font-medium" />
      )}
      <p className="whitespace-pre-wrap"><LinkifiedMessageText text={entry.text} /></p>
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <button
              key={attachment.path}
              onClick={() => onAttachment(attachment)}
              className="flex max-w-full items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              <FileText className="size-3 shrink-0" />
              <FadeText text={attachment.name} className="min-w-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PipelineTab({
  feed,
  initialLoading,
  mobileDetail,
  onMobileDetail,
}: {
  feed: Feed | null
  initialLoading: boolean
  mobileDetail: boolean
  onMobileDetail: (open: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CandidateFilter>('drafted')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const autoSelected = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const candidates = feed?.candidates ?? []
  const filtered = useMemo(
    () => filterCandidates(candidates, filter, query),
    [candidates, filter, query],
  )
  const selected = selectedId ? candidates.find((candidate) => candidate.id === selectedId) : undefined
  const selectedLinkedinUrl = safeHttpUrl(selected?.linkedinUrl)
  const selectedMeeting = useMemo(
    () => (feed?.meetings ?? []).reduce<Meeting | undefined>(
      (latest, meeting) => {
        if (meeting.candidateId !== selected?.id) return latest
        return !latest || new Date(meeting.at).getTime() > new Date(latest.at).getTime()
          ? meeting
          : latest
      },
      undefined,
    ),
    [feed?.meetings, selected?.id],
  )
  const attachments = useMemo(() => candidateAttachments(selected), [selected])
  const threadLength = selected?.thread?.length ?? 0

  const selectCandidate = useCallback((id: string, mobile = true) => {
    autoSelected.current = true
    setSelectedId(id)
    if (mobile) onMobileDetail(true)
  }, [onMobileDetail])

  useEffect(() => {
    if (autoSelected.current || filtered.length === 0) return
    autoSelected.current = true
    setSelectedId(filtered[0].id)
  }, [filtered])

  useEffect(() => {
    // Key this to candidate changes so closing a single attachment does not
    // reopen it during a background poll. On mobile the viewer is a full-screen
    // takeover, so never auto-open there — it would hide the candidate list.
    const desktop = window.matchMedia('(min-width: 768px)').matches
    setAttachment(desktop ? autoOpenAttachment(attachments) : null)
  }, [selectedId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [selectedId, threadLength, selected?.draft?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return
      if (!filtered.length) return
      const index = filtered.findIndex((candidate) => candidate.id === selectedId)
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = filtered[Math.min(index + 1, filtered.length - 1)]
        if (next) selectCandidate(next.id, false)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        const previous = filtered[Math.max(index - 1, 0)]
        if (previous) selectCandidate(previous.id, false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, selectedId, selectCandidate])

  return (
    <div className="flex h-full min-h-0 w-full">
      <div
        className={cn(
          'w-full shrink-0 flex-col border-r md:flex md:w-[320px]',
          mobileDetail ? 'hidden md:flex' : 'flex',
        )}
      >
        <ListToolbar
          searchPlaceholder="Search candidates"
          q={query}
          onQ={setQuery}
          options={FILTERS}
          filter={filter}
          onFilter={setFilter}
        />
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
          {initialLoading && candidates.length === 0 && (
            <div className="space-y-2 px-3 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1.5 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-12 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          )}
          {!initialLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <ClaudeCrab className="size-7 text-muted-foreground/40" />
              <p className="text-[12px] text-muted-foreground">No candidates match</p>
            </div>
          )}
          {filtered.map((candidate) => {
            const hasAttachments = (candidate.thread ?? []).some((entry) => (entry.attachments ?? []).length > 0)
            return (
              <button
                key={candidate.id}
                onClick={() => selectCandidate(candidate.id)}
                className={cn(
                  'block w-full border-l-2 px-3 py-2.5 text-left transition-colors',
                  candidate.id === selectedId ? 'border-foreground bg-muted/70' : 'border-transparent hover:bg-muted/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <FadeText text={candidate.name} className="min-w-0 flex-1 text-[12.5px] font-medium" />
                  <SourceIcon source={candidate.source} />
                  <StatusBadge status={candidate.status} />
                  {hasAttachments && <Paperclip className="size-3 shrink-0 text-muted-foreground" />}
                </div>
                <FadeText text={candidate.summary} lines={2} className="mt-0.5 text-[12px] leading-snug text-muted-foreground" />
                <p className="mt-1 font-mono text-[10.5px] text-muted-foreground/70">
                  {shortDate(candidate.appliedAt)}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <div className={cn('min-w-0 flex-1 flex-col md:flex', mobileDetail ? 'flex' : 'hidden')}>
        {selected ? (
          <>
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-[14px] font-semibold leading-snug">
                  <FadeText text={selected.name} />
                </h2>
                <div className="flex min-w-0 items-center gap-2">
                  <FadeText
                    text={selectedMeeting && selectedMeeting.status !== 'canceled'
                      ? `${selected.email} · Meeting ${shortDate(selectedMeeting.at)} ${shortTime(selectedMeeting.at)}`
                      : selected.email}
                    className="min-w-0 font-mono text-[11px] text-muted-foreground"
                  />
                  {selectedLinkedinUrl && (
                    <a
                      href={selectedLinkedinUrl}
                      target="_blank"
                      rel="noopener"
                      className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
                    >
                      LinkedIn
                      <ExternalLink className="size-2.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
              <StatusBadge status={selected.status} className="ml-3" />
            </div>

            {/* Extra bottom space on phones so the floating Agent Keyboard pill
                never sits on top of the last message. */}
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-4 no-scrollbar max-md:[body:has(#agent-keyboard-host)_&]:pb-[calc(4rem+env(safe-area-inset-bottom))] md:px-5"
            >
              <div className="flex flex-col gap-4">
                {(selected.thread ?? []).map((entry) => (
                  <MessageBubble
                    key={entry.id}
                    entry={entry}
                    candidate={selected}
                    onAttachment={setAttachment}
                  />
                ))}
                {selected.draft && (
                  <DraftCard candidate={selected} draft={selected.draft} />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <ClaudeCrab className="size-7 text-muted-foreground/40" />
            <p className="text-[12px] text-muted-foreground">Select a candidate</p>
          </div>
        )}
      </div>

      <AttachmentViewer
        candidate={selected}
        attachment={attachment}
        attachments={attachments}
        onSelect={setAttachment}
        onClose={() => setAttachment(null)}
      />
    </div>
  )
}
