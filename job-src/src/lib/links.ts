export interface TextLinkPart {
  text: string
  href?: string
}

const HTTP_URL = /\bhttps?:\/\/[^\s<>"']+/gi

export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function withoutTrailingPunctuation(value: string): { url: string; trailing: string } {
  let end = value.length
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

  while (end > 0) {
    const character = value[end - 1]
    if (/[.,!?;:]/.test(character)) {
      end -= 1
      continue
    }
    const opening = pairs[character]
    if (opening) {
      const candidate = value.slice(0, end)
      const openingCount = candidate.split(opening).length - 1
      const closingCount = candidate.split(character).length - 1
      if (closingCount > openingCount) {
        end -= 1
        continue
      }
    }
    break
  }

  return { url: value.slice(0, end), trailing: value.slice(end) }
}

export function linkifyHttpText(text: string): TextLinkPart[] {
  const parts: TextLinkPart[] = []
  let cursor = 0

  for (const match of text.matchAll(HTTP_URL)) {
    const index = match.index ?? 0
    if (index > cursor) parts.push({ text: text.slice(cursor, index) })

    const raw = match[0]
    const { url, trailing } = withoutTrailingPunctuation(raw)
    const href = safeHttpUrl(url)
    if (href) parts.push({ text: url, href })
    else parts.push({ text: url })
    if (trailing) parts.push({ text: trailing })
    cursor = index + raw.length
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return parts.length > 0 ? parts : [{ text }]
}
