import type { FirmFacts } from './onboarding'

const SAMPLE_NAME = 'Summit Staffing'
const SAMPLE_CLIENTS = ['Pacific Cold Storage', 'Lonestar Packaging']
const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
const parts = (value: string) => value.split(/\s*\/\s*|\s*&\s*|\s*,\s*|\s+and\s+/i).map(value => value.trim()).filter(Boolean)

/** Only an explicit clients/sites list is evidence that a name belongs to a customer. */
export function firmClientNames(firm: FirmFacts | null | undefined): string[] {
  const listed = /\b(?:clients|sites):\s*([^.]*)/i.exec(firm?.summary ?? '')?.[1] ?? ''
  return [...(firm?.domain === 'sample' ? SAMPLE_CLIENTS : []), ...parts(listed.replace(/\([^)]*\)/g, ''))]
}

/** Keep legitimate agency punctuation; reject a name assembled from known customers. */
export function singleFirmName(value: string, clients: string[]): string | null {
  const name = value.trim(), known = new Set(clients.map(key))
  if (!name || name.length > 200 || parts(name).some(part => known.has(key(part)))) return null
  return name
}

/** Old saved sample profiles may still contain client names. Never show them as the agency. */
export function payrollFirmName(firm: FirmFacts | null | undefined): string {
  if (firm?.domain === 'sample') return SAMPLE_NAME
  if (!firm) return 'Your firm'
  const name = singleFirmName(firm.name, firmClientNames(firm))
  return name && !name.includes('/') ? name : 'Your firm'
}
