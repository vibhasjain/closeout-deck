import type { Discussion } from '../types.ts'

function object(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function parseDiscussion(value: unknown): Discussion | null {
  const item = object(value)
  const id = string(item.id)
  const title = string(item.title)
  const summaryPath = string(item.summaryPath)
  const transcriptPath = string(item.transcriptPath)
  if (!id || !title || !summaryPath || !transcriptPath) return null
  const durationSec = typeof item.durationSec === 'number' && Number.isFinite(item.durationSec)
    ? item.durationSec
    : undefined
  const tags = Array.isArray(item.tags)
    ? item.tags.filter((tag): tag is string => typeof tag === 'string')
    : undefined
  return {
    id,
    title,
    ...(string(item.recordedAt) ? { recordedAt: string(item.recordedAt) } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(string(item.source) ? { source: string(item.source) } : {}),
    ...(/^https:\/\/(www\.)?loom\.com\//.test(string(item.loomUrl)) ? { loomUrl: string(item.loomUrl) } : {}),
    ...(tags ? { tags } : {}),
    summaryPath,
    transcriptPath,
  }
}
