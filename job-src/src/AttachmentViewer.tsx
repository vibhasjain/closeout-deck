import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import { Download, ExternalLink, FileText, Maximize2, Share2, X } from 'lucide-react'
import * as mammoth from 'mammoth'
import { ClaudeCrab } from '@/components/ClaudeCrab'
import { Button, Skeleton } from '@/components/ui'
import { FadeText } from '@/components/FadeText'
import { loadFile, revokeFiles } from '@/api'
import { cn } from '@/lib/utils'
import { safeHttpUrl } from '@/lib/links'
import {
  attachmentBaseName,
  getAttachmentRenderDispatch,
  meetingResumeAttachment,
  type AttachmentRenderDispatch,
} from '@/lib/attachmentPreview'
import type { Attachment, Candidate, MeetingPaneTab, MeetingRecording } from '@/types'

// Clipboards can't hold a PDF — the browsers only take text and images — so the
// share sheet (phones, Slack in two taps) is the real thing, download the rest.
const canShareFiles = typeof navigator.canShare === 'function'
  && navigator.canShare({ files: [new File([], 'resume.pdf', { type: 'application/pdf' })] })

function sanitizeMammothHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script, iframe, object, embed, style, link, meta, base, form').forEach((node) => node.remove())
  document.body.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().replace(/[\u0000-\u0020]+/g, '').toLowerCase()
      if (
        name.startsWith('on') ||
        name === 'style' ||
        name === 'srcdoc' ||
        ((name === 'href' || name === 'src' || name === 'xlink:href') &&
          (value.startsWith('javascript:') || value.startsWith('vbscript:') || value.startsWith('data:text/html')))
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  })
  return document.body.innerHTML
}

function Preview({
  attachment,
  dispatch,
  url,
  docxHtml,
  text,
  linkedinUrl,
}: {
  attachment: Attachment
  dispatch: AttachmentRenderDispatch
  url: string
  docxHtml: string | null
  text: string | null
  linkedinUrl?: string
}) {
  if (dispatch.kind === 'pdf') {
    return (
      <iframe
        src={`${url}#view=FitH&zoom=page-width`}
        className="h-full w-full border-0"
        title={attachment.name}
      />
    )
  }
  if (dispatch.kind === 'docx' && docxHtml !== null) {
    return (
      <div className="h-full w-full overflow-y-auto bg-white px-5 py-6 text-[13.5px] leading-[1.65] text-black md:px-8">
        <article
          className="mx-auto max-w-[52rem] break-words [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-3 [&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold [&_img]:max-w-full [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2.5 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-neutral-300 [&_td]:p-2 [&_th]:border [&_th]:border-neutral-300 [&_th]:bg-neutral-100 [&_th]:p-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: docxHtml }}
        />
      </div>
    )
  }
  if (dispatch.kind === 'image' && attachmentBaseName(attachment.name) === 'linkedin-profile.png') {
    return (
      <div className="h-full w-full overflow-y-auto bg-white">
        {linkedinUrl && (
          <div className="border-b bg-background px-4 py-2.5 md:px-5">
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
            >
              Open on LinkedIn
              <ExternalLink className="size-2.5" aria-hidden="true" />
            </a>
          </div>
        )}
        <img src={url} alt={`${attachment.name} for candidate`} className="block h-auto w-full" />
      </div>
    )
  }
  if (dispatch.kind === 'image') {
    return (
      <div className="flex h-full items-center justify-center p-5">
        <img src={url} alt={attachment.name} className="max-h-full max-w-full object-contain" />
      </div>
    )
  }
  if (dispatch.kind === 'text' && text !== null) {
    return (
      <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words px-5 py-5 font-mono text-[12.5px] leading-relaxed text-foreground md:px-8">
        {text}
      </pre>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <FileText className="size-7 text-muted-foreground/40" />
      <p className="text-[12px] font-medium">{attachment.name}</p>
      <p className="text-[12px] text-muted-foreground">This file can’t be previewed inline.</p>
      <a
        href={url}
        download={attachment.name}
        className="mt-1 inline-flex h-8 items-center justify-center gap-2 rounded-md bg-foreground px-3 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Download className="size-3.5" aria-hidden="true" />
        Download
      </a>
    </div>
  )
}

function ViewerBody({
  attachment,
  dispatch,
  url,
  docxHtml,
  text,
  loading,
  error,
  linkedinUrl,
}: {
  attachment: Attachment
  dispatch: AttachmentRenderDispatch
  url: string | null
  docxHtml: string | null
  text: string | null
  loading: boolean
  error: string
  linkedinUrl?: string
}) {
  if (loading) {
    return (
      <div className="space-y-2 px-5 py-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: `${[92, 85, 96, 70, 88, 60, 94, 78][i]}%` }} />
        ))}
      </div>
    )
  }
  if (error) return <p className="px-5 py-4 text-[12.5px] text-nosource">{error}</p>
  return url ? (
    <Preview
      attachment={attachment}
      dispatch={dispatch}
      url={url}
      docxHtml={docxHtml}
      text={text}
      linkedinUrl={linkedinUrl}
    />
  ) : null
}

function inlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|__[^_\n]+__)/g).filter(Boolean).map((part, index) => {
    const bold = (part.startsWith('**') && part.endsWith('**'))
      || (part.startsWith('__') && part.endsWith('__'))
    return bold
      ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>
      : part
  })
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line) {
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const className = level === 1
        ? 'mt-1 text-lg font-semibold tracking-tight'
        : level === 2
          ? 'mt-4 text-[15px] font-semibold'
          : 'mt-3 text-[13px] font-semibold'
      blocks.push(<h3 key={`heading-${index}`} className={className}>{inlineMarkdown(heading[2])}</h3>)
      index += 1
      continue
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/)
    const ordered = line.match(/^\d+\.\s+(.+)$/)
    if (unordered || ordered) {
      const orderedList = Boolean(ordered)
      const items: ReactNode[] = []
      while (index < lines.length) {
        const itemLine = lines[index].trim()
        const match = orderedList
          ? itemLine.match(/^\d+\.\s+(.+)$/)
          : itemLine.match(/^[-*+]\s+(.+)$/)
        if (!match) break
        items.push(<li key={index}>{inlineMarkdown(match[1])}</li>)
        index += 1
      }
      const listClass = 'space-y-1 pl-5 marker:text-muted-foreground'
      blocks.push(orderedList
        ? <ol key={`list-${index}`} className={cn(listClass, 'list-decimal')}>{items}</ol>
        : <ul key={`list-${index}`} className={cn(listClass, 'list-disc')}>{items}</ul>)
      continue
    }

    const paragraph: string[] = []
    const paragraphStart = index
    while (index < lines.length) {
      const next = lines[index].trim()
      if (!next || /^(#{1,3})\s+/.test(next) || /^([-*+]\s+|\d+\.\s+)/.test(next)) break
      paragraph.push(next)
      index += 1
    }
    blocks.push(
      <p key={`paragraph-${paragraphStart}`} className="whitespace-pre-wrap">
        {inlineMarkdown(paragraph.join(' '))}
      </p>,
    )
  }

  return <article className="space-y-3 text-[13px] leading-relaxed text-foreground">{blocks}</article>
}

function MeetingDocument({ meeting, tab }: { meeting: MeetingRecording; tab: MeetingPaneTab }) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const path = tab === 'summary' ? meeting.summaryPath : meeting.transcriptPath
  const label = tab === 'summary' ? 'summary' : 'transcript'

  useEffect(() => {
    setText(null)
    setError('')
    if (!path) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const mimeType = tab === 'summary'
      ? 'text/markdown;charset=utf-8'
      : 'text/plain;charset=utf-8'
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
  }, [label, path, tab])

  if (loading) {
    return (
      <div className="space-y-2 px-5 py-4 md:px-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: `${[92, 85, 96, 70, 88, 60, 94, 78][i]}%` }} />
        ))}
      </div>
    )
  }
  if (error) return <p className="px-5 py-4 text-[12.5px] text-nosource">{error}</p>
  if (!text?.trim()) {
    return <EmptyMeetingDocument label={label} />
  }
  return tab === 'summary' ? (
    <div className="h-full overflow-y-auto px-5 py-5 md:px-6">
      <MarkdownText text={text} />
    </div>
  ) : (
    <div className="h-full overflow-y-auto whitespace-pre-wrap break-words px-5 py-5 text-[13px] leading-relaxed text-foreground md:px-6">
      {text}
    </div>
  )
}

function EmptyMeetingDocument({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="text-[12px] text-muted-foreground">No {label} available.</p>
    </div>
  )
}

export function AttachmentViewer({
  paneRef,
  desktopWidth,
  candidate,
  attachment,
  meeting,
  meetingTab,
  attachments,
  onSelect,
  onMeetingTab,
  onClose,
}: {
  paneRef: Ref<HTMLElement>
  desktopWidth: number
  candidate: Candidate | undefined
  attachment: Attachment | null
  meeting: MeetingRecording | null
  meetingTab: MeetingPaneTab
  attachments: Attachment[]
  onSelect: (attachment: Attachment) => void
  onMeetingTab: (tab: MeetingPaneTab) => void
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(false)
  const linkedinUrl = safeHttpUrl(candidate?.linkedinUrl)
  const resumeAttachment = meetingResumeAttachment(attachments)
  const previewAttachment = meeting && meetingTab === 'resume' ? resumeAttachment : attachment
  const previewPath = previewAttachment?.path ?? null
  const previewAttachmentRef = useRef(previewAttachment)
  previewAttachmentRef.current = previewAttachment
  const dispatch = previewAttachment ? getAttachmentRenderDispatch(previewAttachment) : null

  useEffect(() => {
    setUrl(null)
    setDocxHtml(null)
    setText(null)
    setError('')
    const nextAttachment = previewAttachmentRef.current
    if (!nextAttachment) return
    let cancelled = false
    setLoading(true)
    const nextDispatch = getAttachmentRenderDispatch(nextAttachment)
    loadFile(nextAttachment.path, nextDispatch.mimeType)
      .then(async (next) => {
        let nextDocxHtml: string | null = null
        let nextText: string | null = null
        if (nextDispatch.kind === 'docx') {
          const arrayBuffer = await fetch(next).then((response) => response.arrayBuffer())
          const result = await mammoth.convertToHtml({ arrayBuffer })
          nextDocxHtml = sanitizeMammothHtml(result.value)
        } else if (nextDispatch.kind === 'text') {
          nextText = await fetch(next).then((response) => response.text())
        }
        if (!cancelled) {
          setUrl(next)
          setDocxHtml(nextDocxHtml)
          setText(nextText)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this attachment.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [previewPath])

  useEffect(() => () => revokeFiles(), [])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [lightbox])

  useEffect(() => setLightbox(false), [attachment?.path, meeting?.loomId])

  const shareFile = async (name: string, href: string) => {
    try {
      const blob = await fetch(href).then((res) => res.blob())
      await navigator.share({ files: [new File([blob], name, { type: blob.type })] })
    } catch {
      // Cancelling or rejecting a share must never turn into an automatic download.
    }
  }

  const attachmentHeader = (onDismiss: () => void, showMaximize: boolean) => attachment ? (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-5">
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-semibold leading-snug">
          <FadeText text={attachment.name} />
        </h3>
        <p className="font-mono text-[11px] text-muted-foreground">{candidate?.name ?? ''}</p>
      </div>
      <div className="ml-3 flex shrink-0 items-center">
        {url && dispatch?.kind !== 'fallback' && (canShareFiles ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground/60 hover:text-foreground"
            onClick={() => void shareFile(attachment.name, url)}
            aria-label={canShareFiles ? 'Share file' : 'Download file'}
          >
            {canShareFiles ? <Share2 className="size-4" /> : <Download className="size-4" />}
          </Button>
        ) : (
          <a
            href={url}
            download={attachment.name}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Download file"
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
        ))}
        {showMaximize && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground/60 hover:text-foreground"
            onClick={() => setLightbox(true)}
            aria-label="Open full screen"
          >
            <Maximize2 className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 text-muted-foreground/60 hover:text-foreground"
          onClick={onDismiss}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </div>
    </header>
  ) : null

  const meetingHeader = meeting ? (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold leading-snug">
            <FadeText text={meeting.title || 'Meeting'} />
          </h3>
          <p className="font-mono text-[11px] text-muted-foreground">{candidate?.name ?? ''}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 ml-3 shrink-0 text-muted-foreground/60 hover:text-foreground"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </header>
      <div className="shrink-0 border-b px-4 md:px-5">
        <div className="flex h-9 items-end gap-4" role="tablist" aria-label="Meeting notes">
          {(['summary', 'transcript', 'resume'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={meetingTab === tab}
              onClick={() => onMeetingTab(tab)}
              className={cn(
                'relative h-9 px-0.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground',
                meetingTab === tab && 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground',
              )}
            >
              {tab === 'summary' ? 'Summary' : tab === 'transcript' ? 'Transcript' : 'Resume'}
            </button>
          ))}
        </div>
      </div>
    </>
  ) : null

  const active = Boolean(attachment || meeting)

  return (
    <>
      <aside
        ref={paneRef}
        style={{ '--right-pane-width': `${desktopWidth}px` } as CSSProperties}
        className={cn(
          'flex-col bg-background md:flex md:h-full md:w-[var(--right-pane-width)] md:min-w-[320px] md:max-w-[60vw] md:shrink-0',
          active ? 'fixed inset-0 z-50 flex h-full w-full animate-fade-in md:static md:z-auto' : 'hidden md:flex',
        )}
      >
        {meeting ? (
          <>
            {meetingHeader}
            <div className="min-h-0 flex-1" role="tabpanel">
              {meetingTab === 'resume'
                ? resumeAttachment
                  ? <ViewerBody attachment={resumeAttachment} dispatch={dispatch!} url={url} docxHtml={docxHtml} text={text} loading={loading} error={error} linkedinUrl={linkedinUrl} />
                  : <EmptyMeetingDocument label="resume" />
                : <MeetingDocument meeting={meeting} tab={meetingTab} />}
            </div>
          </>
        ) : attachment ? (
          <>
            {attachmentHeader(onClose, true)}
            <div className="min-h-0 flex-1">
              <ViewerBody attachment={attachment} dispatch={dispatch!} url={url} docxHtml={docxHtml} text={text} loading={loading} error={error} linkedinUrl={linkedinUrl} />
            </div>
          </>
        ) : (
          <>
            <header className="flex h-14 shrink-0 items-center border-b px-4 md:px-5">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold leading-snug">Attachments</h3>
                <p className="font-mono text-[11px] text-muted-foreground">{candidate?.name ?? ''}</p>
              </div>
            </header>
            {attachments.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 no-scrollbar">
                {attachments.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => onSelect(item)}
                    className="group flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left hover:border-border hover:bg-muted/60"
                  >
                    <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <FadeText text={item.name} className="min-w-0 flex-1 text-[12px] font-medium" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6">
                <ClaudeCrab className="size-7 text-muted-foreground/40" />
              </div>
            )}
          </>
        )}
      </aside>

      {lightbox && attachment && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 animate-fade-in" onClick={() => setLightbox(false)} />
          <div className="fixed inset-4 z-50 flex flex-col rounded-xl border bg-background shadow-xl animate-fade-in">
            {attachmentHeader(() => setLightbox(false), false)}
            <div className="min-h-0 flex-1">
              <ViewerBody attachment={attachment} dispatch={dispatch!} url={url} docxHtml={docxHtml} text={text} loading={loading} error={error} linkedinUrl={linkedinUrl} />
            </div>
          </div>
        </>
      )}
    </>
  )
}
