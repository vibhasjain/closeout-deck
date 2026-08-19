import type { Attachment } from '@/types'

export type AttachmentPreviewKind = 'pdf' | 'image' | 'docx' | 'text' | 'fallback'

export interface AttachmentRenderDispatch {
  kind: AttachmentPreviewKind
  mimeType?: string
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

const TEXT_MIME_TYPES: Record<string, string> = {
  txt: 'text/plain;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
}

export function attachmentBaseName(name: string): string {
  const withoutQuery = name.split(/[?#]/, 1)[0] ?? ''
  return withoutQuery.split('/').pop()?.toLowerCase() ?? ''
}

export function attachmentExtension(name: string): string {
  const baseName = attachmentBaseName(name)
  const dot = baseName.lastIndexOf('.')
  return dot >= 0 ? baseName.slice(dot + 1) : ''
}

export function getAttachmentRenderDispatch(attachment: Pick<Attachment, 'name'>): AttachmentRenderDispatch {
  const ext = attachmentExtension(attachment.name)
  if (ext === 'pdf') return { kind: 'pdf', mimeType: 'application/pdf' }
  if (ext === 'docx') {
    return {
      kind: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
  }
  if (IMAGE_MIME_TYPES[ext]) return { kind: 'image', mimeType: IMAGE_MIME_TYPES[ext] }
  if (TEXT_MIME_TYPES[ext]) return { kind: 'text', mimeType: TEXT_MIME_TYPES[ext] }
  return { kind: 'fallback' }
}

export function autoOpenAttachment(attachments: Attachment[]): Attachment | null {
  const resume = attachments.find((item) => {
    const kind = getAttachmentRenderDispatch(item).kind
    return kind === 'pdf' || kind === 'docx'
  })
  const linkedinProfile = attachments.find(
    (item) => attachmentBaseName(item.name) === 'linkedin-profile.png',
  )
  return resume ?? linkedinProfile ?? attachments[0] ?? null
}
