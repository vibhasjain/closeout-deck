/**
 * Strip markdown markers so model output renders as plain text (house rule:
 * no markdown rendered as literal text anywhere). Preserves newlines.
 */
export function stripMarkdown(text: string): string {
  if (!text) return text
  return (
    text
      // [label](url) -> label
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // # headings
      .replace(/^#{1,6}\s+/gm, '')
      // --- / *** / ___ horizontal rules
      .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '')
      // **bold** / __bold__
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
      // *italic*
      .replace(/\*(?=\S)([^*\n]*\S)\*/g, '$1')
      // _italic_ — word-boundary safe so snake_case identifiers survive
      .replace(/(^|[^A-Za-z0-9_])_(?=\S)([^_\n]*\S)_(?![A-Za-z0-9_])/gm, '$1$2')
      // `inline code` and ``` fences
      .replace(/`+/g, '')
  )
}
