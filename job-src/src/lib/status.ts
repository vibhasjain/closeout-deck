import type { Status } from '../types.ts'

const STATUS = new Set<Status>([
  'new', 'qualified', 'invited',
  'meeting-scheduled', 'met', 'disqualified',
])

const LEGACY_STATUS: Record<string, Status> = {
  drafted: 'qualified',
  'awaiting-reply': 'invited',
  sent: 'invited',
  'calendly-sent': 'invited',
}

export function parseStatus(value: unknown): Status {
  const rawStatus = typeof value === 'string' ? value : ''
  return LEGACY_STATUS[rawStatus]
    ?? (STATUS.has(rawStatus as Status) ? rawStatus as Status : 'new')
}
