import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { FileText, X } from 'lucide-react'
import { MarkdownText } from '@/AttachmentViewer'
import { loadFile } from '@/api'
import { ClaudeCrab } from '@/components/ClaudeCrab'
import { FadeText } from '@/components/FadeText'
import { ListToolbar } from '@/components/ListToolbar'
import { ThreePaneLayout } from '@/components/ThreePaneLayout'
import { Button, CopyButton, Skeleton } from '@/components/ui'
import { stripMarkdown } from '@/lib/stripMarkdown'
import { cn } from '@/lib/utils'
import type { Discussion, Feed } from '@/types'

const NO_FILTERS: readonly string[] = []
const NO_DISCUSSIONS: readonly Discussion[] = []
const DISCUSSION_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
const DISCUSSION_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
})

function discussionMeta(discussion: Discussion): string {
  const parts: string[] = []
  if (discussion.recordedAt) {
    const date = new Date(discussion.recordedAt)
    if (!Number.isNaN(date.getTime())) {
      parts.push(`${DISCUSSION_DATE_FORMATTER.format(date)} · ${DISCUSSION_TIME_FORMATTER.format(date)}`)
    }
  }
  if (discussion.durationSec !== undefined) {
    parts.push(`${Math.round(discussion.durationSec / 60)} min`)
  }
  return parts.join(' · ')
}

function useDiscussionText(path: string | undefined, mimeType: string, label: string) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setText(null)
    setError('')
    if (!path) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    loadFile(path, mimeType)
      .then((url) => fetch(url))
      .then((response) => response.text())
      .then((nextText) => {
        if (!cancelled) setText(nextText)
      })
      .catch(() => {
        if (!cancelled) setError(`Could not load this ${label}.`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Paths are the file identities. Feed polling replaces discussion objects,
    // but unchanged paths must not reload or reset either document's scroll.
  }, [path])

  return { text, loading, error }
}

function TextLoader({ loading, error }: { loading: boolean; error: string }) {
  if (loading) {
    return (
      <div className="space-y-2 px-5 py-4 md:px-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: `${[92, 85, 96, 70, 88, 60, 94, 78][i]}%` }} />
        ))}
      </div>
    )
  }
  return error ? <p className="px-5 py-4 text-[12.5px] text-nosource">{error}</p> : null
}

export function InternalTab({
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const discussions = feed?.discussions ?? NO_DISCUSSIONS
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized
      ? discussions.filter((discussion) => discussion.title.toLowerCase().includes(normalized))
      : discussions
  }, [discussions, query])
  const selected = selectedId
    ? discussions.find((discussion) => discussion.id === selectedId)
    : undefined
  const summary = useDiscussionText(selected?.summaryPath, 'text/markdown;charset=utf-8', 'summary')
  const transcript = useDiscussionText(selected?.transcriptPath, 'text/plain;charset=utf-8', 'transcript')
  const meta = selected ? discussionMeta(selected) : ''

  useEffect(() => {
    if (selectedId && discussions.some((discussion) => discussion.id === selectedId)) return
    if (selectedId) {
      setSelectedId(null)
      setTranscriptOpen(false)
      onMobileDetail(false)
    }
    if (discussions.length > 0 && window.matchMedia('(min-width: 768px)').matches) {
      setSelectedId(discussions[0].id)
    }
  }, [discussions, onMobileDetail, selectedId])

  const selectDiscussion = useCallback((id: string) => {
    setSelectedId(id)
    setTranscriptOpen(false)
    onMobileDetail(true)
  }, [onMobileDetail])

  const emptyState = (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <ClaudeCrab className="size-7 text-muted-foreground/40" />
      <p className="text-[12px] text-muted-foreground">
        {discussions.length === 0 ? 'No discussions yet' : 'No discussions match'}
      </p>
    </div>
  )

  return (
    <ThreePaneLayout
      mobileDetail={mobileDetail}
      separatorLabel="Resize transcript pane"
      left={(
        <>
          <ListToolbar
            searchPlaceholder="Search discussions"
            q={query}
            onQ={setQuery}
            options={NO_FILTERS}
            filter="internal"
            onFilter={() => {}}
          />
          <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
            {initialLoading && discussions.length === 0 && (
              <div className="space-y-2 px-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-1.5 py-1">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            )}
            {!initialLoading && filtered.length === 0 && emptyState}
            {filtered.map((discussion) => (
              <button
                key={discussion.id}
                onClick={() => selectDiscussion(discussion.id)}
                className={cn(
                  'block w-full border-l-2 px-3 py-2.5 text-left transition-colors',
                  discussion.id === selectedId
                    ? 'border-foreground bg-muted/70'
                    : 'border-transparent hover:bg-muted/40',
                )}
              >
                <FadeText text={discussion.title} className="text-[12.5px] font-semibold" />
                {discussionMeta(discussion) && (
                  <p className="mt-1 font-mono text-[10.5px] text-muted-foreground/70">
                    {discussionMeta(discussion)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      middle={selected ? (
        <>
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold leading-snug">
                <FadeText text={selected.title} />
              </h2>
              {meta && <p className="font-mono text-[11px] text-muted-foreground">{meta}</p>}
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-1">
              {summary.text && <CopyButton text={stripMarkdown(summary.text)} label />}
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-foreground md:hidden"
                onClick={() => setTranscriptOpen(true)}
              >
                <FileText className="size-3" />
                Transcript
              </Button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
            <TextLoader loading={summary.loading} error={summary.error} />
            {!summary.loading && !summary.error && summary.text?.trim() && (
              <div className="mx-auto max-w-[52rem]">
                <MarkdownText text={summary.text} />
              </div>
            )}
            {!summary.loading && !summary.error && !summary.text?.trim() && (
              <p className="text-[12px] text-muted-foreground">No summary available.</p>
            )}
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <ClaudeCrab className="size-7 text-muted-foreground/40" />
          <p className="text-[12px] text-muted-foreground">
            {discussions.length === 0 ? 'No discussions yet' : 'Select a discussion'}
          </p>
        </div>
      )}
      right={({ paneRef, desktopWidth }) => (
        <aside
          ref={paneRef}
          style={{ '--right-pane-width': `${desktopWidth}px` } as CSSProperties}
          className={cn(
            'flex-col bg-background md:flex md:h-full md:w-[var(--right-pane-width)] md:min-w-[320px] md:max-w-[60vw] md:shrink-0',
            transcriptOpen
              ? 'fixed inset-0 z-50 flex h-full w-full animate-fade-in md:static md:z-auto'
              : 'hidden md:flex',
          )}
        >
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-5">
            <h3 className="text-[14px] font-semibold leading-snug">Transcript</h3>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 text-muted-foreground/60 hover:text-foreground md:hidden"
              onClick={() => setTranscriptOpen(false)}
              aria-label="Close transcript"
            >
              <X className="size-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-5 py-5 text-[13px] leading-relaxed text-foreground md:px-6">
            <TextLoader loading={transcript.loading} error={transcript.error} />
            {!transcript.loading && !transcript.error && transcript.text?.trim() && transcript.text}
            {!transcript.loading && !transcript.error && selected && !transcript.text?.trim() && (
              <p className="text-[12px] text-muted-foreground">No transcript available.</p>
            )}
            {!selected && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <ClaudeCrab className="size-7 text-muted-foreground/40" />
                <p className="text-[12px] text-muted-foreground">
                  {discussions.length === 0 ? 'No discussions yet' : 'Select a discussion'}
                </p>
              </div>
            )}
          </div>
        </aside>
      )}
    />
  )
}
