/** Group messages by the operator's local calendar day. */
export function dayDivider(at: number, previousAt?: number, now = Date.now()): string | null {
  const date = new Date(at)
  if (previousAt !== undefined && date.toDateString() === new Date(previousAt).toDateString()) return null
  if (date.toDateString() === new Date(now).toDateString()) return 'Today'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
