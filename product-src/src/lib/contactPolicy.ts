import type { CyclePayload } from '@/lib/data'
import type { JourneyThread } from '@/lib/journey'

const normalize = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Match the person and, for a site conversation, its current and legacy site references. */
export function blockedCounterparty(thread: JourneyThread, neverContact: readonly string[], cycle?: CyclePayload): boolean {
  const blocked = new Set(neverContact.map(normalize).filter(Boolean))
  const counterparty = thread.counterparty
  const names = [counterparty.name]
  if (counterparty.kind === 'site') names.push(
    ...(counterparty.siteNames ?? []),
    ...(counterparty.gapIds ?? []).map(id => id.split('|')[0]),
    ...(cycle?.sites.filter(site => normalize(site.supervisor?.name ?? '') === normalize(counterparty.name)).map(site => site.name) ?? []),
  )
  return names.some(name => blocked.has(normalize(name)))
}

export function threadErrorText(cause: unknown, name: string): string {
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined
  const message = cause instanceof Error ? cause.message : ''
  if (code === 'never_contact' || message === 'never_contact') return `${name} is on your never-contact list.`
  // A server error code is diagnostic information, never the message a person should read.
  return message && !/^[a-z][a-z0-9_]*$/.test(message) ? message : 'The message could not be recorded. Try again.'
}
