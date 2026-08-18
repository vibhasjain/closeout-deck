import { useEffect, useState } from 'react'
import { FileText, Maximize2, Paperclip, X } from 'lucide-react'
import { Button, Skeleton } from '@/components/ui'
import { FadeText } from '@/components/FadeText'
import { loadFile, revokeFiles } from '@/api'
import { cn } from '@/lib/utils'
import type { Attachment, Candidate } from '@/types'

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function Preview({ attachment, url }: { attachment: Attachment; url: string }) {
  const ext = extension(attachment.name)
  if (ext === 'pdf') {
    return <iframe src={url} className="h-full w-full border-0" title={attachment.name} />
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return (
      <div className="flex h-full items-center justify-center p-5">
        <img src={url} alt={attachment.name} className="max-h-full max-w-full object-contain" />
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <FileText className="size-7 text-muted-foreground/40" />
      <p className="text-[12px] font-medium">{attachment.name}</p>
      <p className="text-[12px] text-muted-foreground">This file can’t be previewed inline.</p>
    </div>
  )
}

function ViewerBody({
  attachment,
  url,
  loading,
  error,
}: {
  attachment: Attachment
  url: string | null
  loading: boolean
  error: string
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
  return url ? <Preview attachment={attachment} url={url} /> : null
}

export function AttachmentViewer({
  candidate,
  attachment,
  attachments,
  onSelect,
  onClose,
}: {
  candidate: Candidate | undefined
  attachment: Attachment | null
  attachments: Attachment[]
  onSelect: (attachment: Attachment) => void
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    setUrl(null)
    setError('')
    if (!attachment) return
    let cancelled = false
    setLoading(true)
    loadFile(attachment.path)
      .then((next) => {
        if (!cancelled) setUrl(next)
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
  }, [attachment])

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

  useEffect(() => setLightbox(false), [attachment])

  const header = (onDismiss: () => void, showMaximize: boolean) => attachment ? (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-5">
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-semibold leading-snug">
          <FadeText text={attachment.name} />
        </h3>
        <p className="font-mono text-[11px] text-muted-foreground">{candidate?.name ?? ''}</p>
      </div>
      <div className="ml-3 flex shrink-0 items-center">
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

  return (
    <>
      <aside
        className={cn(
          'flex-col bg-background md:flex md:h-full md:w-[400px] md:shrink-0 md:border-l xl:w-[460px]',
          attachment ? 'fixed inset-0 z-50 flex h-full w-full animate-fade-in md:static md:z-auto' : 'hidden md:flex',
        )}
      >
        {attachment ? (
          <>
            {header(onClose, true)}
            <div className="min-h-0 flex-1">
              <ViewerBody attachment={attachment} url={url} loading={loading} error={error} />
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
                <Paperclip className="size-7 text-muted-foreground/40" />
              </div>
            )}
          </>
        )}
      </aside>

      {lightbox && attachment && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 animate-fade-in" onClick={() => setLightbox(false)} />
          <div className="fixed inset-4 z-50 flex flex-col rounded-xl border bg-background shadow-xl animate-fade-in">
            {header(() => setLightbox(false), false)}
            <div className="min-h-0 flex-1">
              <ViewerBody attachment={attachment} url={url} loading={loading} error={error} />
            </div>
          </div>
        </>
      )}
    </>
  )
}
