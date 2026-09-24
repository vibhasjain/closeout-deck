import type { Proposal } from '@/lib/rules'

const SITE_HINTS: [RegExp, string][] = [
  [/riverside/i, 'Riverside DC'],
  [/fontana/i, 'Fontana Yard'],
  [/henderson/i, 'Henderson'],
  [/ontario/i, 'Ontario Hub'],
  [/chino/i, 'Chino Depot'],
  [/perris/i, 'Perris Cold Store'],
  [/colton/i, 'Colton Yard'],
  [/sparks/i, 'Sparks Annex'],
]

/**
 * Rates the rulebook already holds, per scope and per kind of worker. Compared like for like,
 * so a forklift premium is never mistaken for a contradiction of the general labour rate.
 */
const KNOWN_RATES: Record<string, Partial<Record<string, number>>> = {
  Henderson: { general: 21 },
  'Riverside DC': { forklift: 34.5 },
}

const TEMPLATES: ((n: number) => { text: string; kind: string })[] = [
  (n) => ({ text: `$${(1.5 + (n % 5) * 0.5).toFixed(2)}/hr night differential, 6:00 PM to 6:00 AM`, kind: 'differential' }),
  (n) => ({ text: `Contract rate $${20 + (n % 6)}.00/hr for general labour`, kind: 'general' }),
  (n) => ({ text: `Forklift-certified workers bill at $${32 + (n % 5)}.50/hr`, kind: 'forklift' }),
  (n) => ({ text: `Minimum ${3 + (n % 3)} h call-out pay`, kind: 'minimum' }),
  () => ({ text: 'Weekend work billed at 1.25× base', kind: 'premium' }),
  () => ({ text: 'Meal break waiver allowed when the work is under 6 h', kind: 'break' }),
  () => ({ text: 'Travel time paid portal to portal between sites', kind: 'travel' }),
  (n) => ({ text: `Overtime billed at 1.5× after ${40 + (n % 2) * 4} h in a week`, kind: 'overtime' }),
]

const hash = (s: string) => [...s].reduce((h, c) => ((h * 33) ^ c.charCodeAt(0)) >>> 0, 5381)
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Stand-in for document extraction: deterministic candidate rules with a citation back to the
 * source, so re-dropping the same file yields the same ids and never duplicates.
 * ponytail: swap for the real extractor; the review queue contract does not change.
 */
export function extractRules(fileName: string): Proposal[] {
  const h = hash(fileName)
  const scope = SITE_HINTS.find(([pattern]) => pattern.test(fileName))?.[1] ?? null
  const count = 3 + (h % 4)
  const base = slug(fileName)

  return Array.from({ length: count }, (_, n) => {
    const { text, kind } = TEMPLATES[(h + n * 3) % TEMPLATES.length](h + n)
    const known = scope ? KNOWN_RATES[scope]?.[kind] : undefined
    const quoted = Number(text.match(/\$(\d+(?:\.\d+)?)/)?.[1])
    return {
      id: `${base}-${n}`,
      text,
      scope,
      source: fileName,
      cite: `Clause ${1 + ((h + n) % 12)}.${1 + ((h + n * 7) % 9)}`,
      effective: `2026-0${1 + ((h + n) % 9)}-01`,
      conflict:
        known && quoted && quoted !== known
          ? `Rulebook already has $${known.toFixed(2)}/hr for ${kind === 'forklift' ? 'forklift-certified' : 'general labour'} at ${scope}`
          : null,
    }
  })
}

/**
 * Text documents: one proposal per numbered clause ("2.1 Hours worked…"). A "Client:" or "Facility:" header
 * scopes every clause, and an "Effective:" header dates them.
 */
export function extractClauses(fileName: string, text: string): Proposal[] {
  const scope = text.match(/^(?:client|facility|site):\s*(.+)$/im)?.[1].trim() ?? SITE_HINTS.find(([pattern]) => pattern.test(fileName))?.[1] ?? null
  const effective = text.match(/^effective:\s*(\d{4}-\d{2}-\d{2})/im)?.[1] ?? null
  const base = slug(fileName)
  return [...text.matchAll(/^\s*(\d+(?:\.\d+)+)\s+(.+)$/gm)].map(([, n, clause]) => {
    const sentence = clause.trim()
    const ends = sentence.match(/[.!?](?=\s|$)/g) ?? []
    const copy = ends.length === 1 && sentence.endsWith('.') && !sentence.endsWith('...') ? sentence.slice(0, -1) : sentence
    return { id: `${base}-${n}`, text: copy, scope, source: fileName, cite: `Clause ${n}`, effective, conflict: null }
  })
}
