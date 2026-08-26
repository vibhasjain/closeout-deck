import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, FileText, Mail } from 'lucide-react'
import { AttachmentViewer } from '@/AttachmentViewer'
import { ClaudeCrab } from '@/components/ClaudeCrab'
import { DraftCard } from '@/components/DraftCard'
import { FadeText } from '@/components/FadeText'
import { chipLabel } from '@/components/FilterChips'
import { ListToolbar } from '@/components/ListToolbar'
import { ThreePaneLayout } from '@/components/ThreePaneLayout'
import { Badge, CopyButton, Skeleton } from '@/components/ui'
import {
  filterCandidates,
  PIPELINE_FILTERS,
  selectionForCandidates,
  type PipelineFilter,
} from '@/lib/filter'
import { autoOpenAttachment } from '@/lib/attachmentPreview'
import { linkifyHttpText, safeHttpUrl } from '@/lib/links'
import { stripMarkdown } from '@/lib/stripMarkdown'
import { cn, shortDate, shortTime } from '@/lib/utils'
import type {
  Attachment,
  Candidate,
  Feed,
  Meeting,
  MeetingPaneTab,
  MeetingRecording,
  Status,
  ThreadEntry,
} from '@/types'

const MEETING_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
const MEETING_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
})

function meetingDateTime(iso: string): string {
  const date = new Date(iso)
  return `${MEETING_DATE_FORMATTER.format(date)} · ${MEETING_TIME_FORMATTER.format(date)}`
}

export const STATUS_CHIP: Record<Status, string> = {
  new: '',
  qualified: 'border-transparent bg-pending/10 text-pending',
  invited: 'border-transparent bg-muted text-muted-foreground',
  'meeting-scheduled': 'border-transparent bg-solid/10 text-solid',
  met: 'border-transparent bg-solid/10 text-solid',
  disqualified: 'border-transparent bg-nosource/10 text-nosource',
  'no-show': 'border-transparent bg-verify/10 text-verify',
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

function MeetingCard({
  entry,
  candidateMeeting,
  onMeeting,
}: {
  entry: ThreadEntry
  candidateMeeting?: MeetingRecording
  onMeeting: (meeting: MeetingRecording, tab: MeetingPaneTab) => void
}) {
  const loomId = entry.loomId || candidateMeeting?.loomId || ''
  const loomUrl = entry.loomUrl || candidateMeeting?.loomUrl || `https://www.loom.com/share/${loomId}`
  const meeting: MeetingRecording = {
    ...candidateMeeting,
    loomId,
    loomUrl,
    recordedAt: candidateMeeting?.recordedAt || entry.at,
  }

  return (
    <div className="w-full max-w-[min(82%,42rem)] self-start overflow-hidden rounded-lg border bg-card">
      <div className="px-3.5 py-2">
        <span className="text-[10px] font-medium text-muted-foreground">
          Meeting · {shortTime(entry.at)}
        </span>
      </div>
      <div className="aspect-video w-full border-y bg-muted/40">
        <iframe
          src={`https://www.loom.com/embed/${encodeURIComponent(loomId)}`}
          title={candidateMeeting?.title || 'Recorded meeting'}
          className="h-full w-full border-0"
          loading="lazy"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="flex items-center gap-1.5 px-3.5 py-2 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => onMeeting(meeting, 'summary')}
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          Summary
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => onMeeting(meeting, 'transcript')}
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          Transcript
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => onMeeting(meeting, 'resume')}
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          Resume
        </button>
      </div>
    </div>
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
          ? 'max-w-[min(82%,42rem)] self-start rounded-lg border bg-muted/50 px-3.5 py-2 font-mono text-[12.5px] leading-relaxed'
          : incoming
            ? 'max-w-[min(82%,42rem)] self-start rounded-lg border bg-muted/50 px-3.5 py-2.5 text-[13.5px] leading-relaxed'
            : 'max-w-[min(82%,42rem)] self-end rounded-lg border bg-card px-3.5 py-2.5 text-[13.5px] leading-relaxed',
      )}
    >
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
        {incoming && <CopyButton text={stripMarkdown(entry.text)} />}
      </div>
      <p className="whitespace-pre-wrap break-words"><LinkifiedMessageText text={entry.text} /></p>
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
  filter,
  onFilter,
  filterCounts,
}: {
  feed: Feed | null
  initialLoading: boolean
  mobileDetail: boolean
  onMobileDetail: (open: boolean) => void
  filter: PipelineFilter
  onFilter: (filter: PipelineFilter) => void
  filterCounts: Record<PipelineFilter, number>
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [meetingPane, setMeetingPane] = useState<{
    meeting: MeetingRecording
    tab: MeetingPaneTab
  } | null>(null)
  const autoSelected = useRef(false)
  const previousFilter = useRef(filter)
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
    const nextCandidate = candidates.find((candidate) => candidate.id === id)
    const desktop = window.matchMedia('(min-width: 768px)').matches
    if (desktop && nextCandidate?.status === 'met' && nextCandidate.meeting) {
      setAttachment(null)
      setMeetingPane({ meeting: nextCandidate.meeting, tab: 'summary' })
    }
  }, [candidates, onMobileDetail])

  const openAttachment = useCallback((nextAttachment: Attachment | null) => {
    setMeetingPane(null)
    setAttachment(nextAttachment)
  }, [])

  const openMeeting = useCallback((meeting: MeetingRecording, tab: MeetingPaneTab) => {
    setAttachment(null)
    setMeetingPane({ meeting, tab })
  }, [])

  useEffect(() => {
    if (autoSelected.current || filtered.length === 0) return
    autoSelected.current = true
    setSelectedId(filtered[0].id)
  }, [filtered])

  useEffect(() => {
    if (previousFilter.current === filter) return
    previousFilter.current = filter
    setSelectedId((current) => selectionForCandidates(filtered, current))
  }, [filter, filtered])

  useEffect(() => {
    // Key this to candidate changes so closing a single attachment does not
    // reopen it during a background poll. On mobile the viewer is a full-screen
    // takeover, so never auto-open there — it would hide the candidate list.
    const desktop = window.matchMedia('(min-width: 768px)').matches
    if (desktop && selected?.status === 'met' && selected.meeting) {
      setAttachment(null)
      setMeetingPane({ meeting: selected.meeting, tab: 'summary' })
      return
    }
    setMeetingPane(null)
    setAttachment(desktop ? autoOpenAttachment(attachments) : null)
  }, [selectedId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [selectedId, threadLength, selected?.draft?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // composedPath: the Agent Keyboard widget's textarea lives in a shadow root,
      // so e.target at window level is its host, not the textarea.
      const target = e.composedPath()[0] as HTMLElement | undefined
      if (target?.tagName?.match(/INPUT|TEXTAREA/) || target?.isContentEditable) return
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
    <ThreePaneLayout
      mobileDetail={mobileDetail}
      separatorLabel="Resize attachments pane"
      left={(
        <>
        <ListToolbar
          searchPlaceholder="Search candidates"
          q={query}
          onQ={setQuery}
          options={PIPELINE_FILTERS}
          filter={filter}
          onFilter={onFilter}
          counts={filterCounts}
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
                </div>
                <FadeText text={candidate.summary} lines={2} className="mt-0.5 text-[12px] leading-snug text-muted-foreground" />
                <p className="mt-1 font-mono text-[10.5px] text-muted-foreground/70">
                  {candidate.status === 'meeting-scheduled' && candidate.meetingAt
                    ? meetingDateTime(candidate.meetingAt)
                    : shortDate(candidate.appliedAt)}
                </p>
              </button>
            )
          })}
        </div>
        </>
      )}
      middle={selected ? (
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
              <div className="ml-3 flex shrink-0 items-center gap-1">
                <StatusBadge status={selected.status} />
                {attachments.length > 0 && (
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:hidden"
                    onClick={() => openAttachment(autoOpenAttachment(attachments))}
                    aria-label="View attachment"
                    title="View attachment"
                  >
                    <FileText className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* Extra bottom space on phones so the floating Agent Keyboard pill
                never sits on top of the last message. */}
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-4 no-scrollbar max-md:[body:has(#agent-keyboard-host)_&]:pb-[calc(4rem+env(safe-area-inset-bottom))] md:px-5"
            >
              <div className="flex flex-col gap-4">
                {(selected.thread ?? []).map((entry) => entry.kind === 'meeting' ? (
                  <MeetingCard
                    key={entry.id}
                    entry={entry}
                    candidateMeeting={selected.meeting}
                    onMeeting={openMeeting}
                  />
                ) : (
                  <MessageBubble
                    key={entry.id}
                    entry={entry}
                    candidate={selected}
                    onAttachment={openAttachment}
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
      right={({ paneRef, desktopWidth }) => (
        <AttachmentViewer
          paneRef={paneRef}
          desktopWidth={desktopWidth}
          candidate={selected}
          attachment={attachment}
          meeting={meetingPane?.meeting ?? null}
          meetingTab={meetingPane?.tab ?? 'summary'}
          attachments={attachments}
          onSelect={openAttachment}
          onMeetingTab={(tab) => setMeetingPane((current) => current ? { ...current, tab } : current)}
          onClose={() => {
            setAttachment(null)
            setMeetingPane(null)
          }}
        />
      )}
    />
  )
}
