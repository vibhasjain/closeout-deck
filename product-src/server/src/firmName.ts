import { SAMPLE_FIRM } from './firm.ts'
import { isPlainObject } from './validation.ts'

const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
const parts = (value: string) => value.split(/\s*\/\s*|\s*&\s*|\s*,\s*|\s+and\s+/i).map(value => value.trim()).filter(Boolean)

/** Sources and site facts supply exact names; the pre-read may also name clients explicitly. */
export function knownFirmClients(firm: unknown): string[] {
  if (!isPlainObject(firm)) return []
  const summaries = [firm.summary, ...(firm.domain === 'sample' ? [SAMPLE_FIRM.summary] : [])]
  return summaries.flatMap(summary => {
    const listed = typeof summary === 'string' ? /\b(?:clients|sites):\s*([^.]*)/i.exec(summary)?.[1] : ''
    return parts((listed ?? '').replace(/\([^)]*\)/g, ''))
  })
}

/** set_firm names the staffing agency, never a list assembled from its clients or sites. */
export function validFirmName(value: unknown, knownClients: string[]): boolean {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) return false
  const clients = new Set(knownClients.map(key))
  return !parts(value).some(part => clients.has(key(part)))
}
