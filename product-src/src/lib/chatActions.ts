import type { NavigateFunction } from 'react-router-dom'
import type { Action, Card } from '@/lib/chat'
import { isJourneyForm, limitCards } from '@/lib/chat'
import { agentHref } from '@/lib/navigation'
import { cycleNamed, saveCycle, slugId } from '@/lib/cohorts'
import { FREQUENCIES, WEEKDAYS, ONBOARD_TOPICS, PROFILE_FIELDS, effectiveAuthority, getOnboarding } from '@/lib/onboarding'
import type { CustomDeskRule, FirmFacts, Onboarding } from '@/lib/onboarding'
import { invalidate } from '@/lib/data'
import { decide } from '@/lib/journey'
import { memoryHistory, rememberAction, validRememberAction } from '@/components/memory/chatMemory'

export type ChatUpdate = (patch: Partial<Onboarding> | ((state: Onboarding) => Partial<Onboarding>)) => void

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const shortString = (value: unknown): value is string => typeof value === 'string' && value.length <= 200
const meaningfulString = (value: unknown): value is string => shortString(value) && value.trim().length > 0
const finiteRange = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max

const firmHost = (domain?: string) => {
  try { return new URL(domain?.includes('://') ? domain : `https://${domain}`).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/** A model cannot choose an image or link destination outside the firm the user selected. */
export function allowedModelUrl(value: string, firm: FirmFacts | null, icon = false): string | null {
  const host = firm?.domain ? firmHost(firm.domain) : ''
  if (!host || value.length > 2048) return null
  if (icon && /^\/apple-touch-icon[^/]*$/.test(value)) value = `https://${host}${value}`
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && url.hostname.toLowerCase().replace(/^www\./, '') === host ? url.href : null
  } catch { return null }
}

/** Free-form model text is plain text; discard unsafe URL tokens before saving/rendering. */
export function safeModelText(text: string, firm: FirmFacts | null, cap = 20_000): string {
  return text.slice(0, cap).replace(/(?:[a-z][a-z0-9+.-]*:\/\/|\/\/|(?:javascript|data|file|mailto):|www\.)[^\s<>[\]"']+/gi,
    (url) => allowedModelUrl(url, firm) ?? '').trim()
}

export function safeModelCard(card: Card, firm: FirmFacts | null): Card | null {
  if (card.kind === 'choice') {
    const clean = { ...card, ask: safeModelText(card.ask, firm, 200), yours: safeModelText(card.yours, firm, 200), sample: safeModelText(card.sample, firm, 200) }
    return clean.ask && clean.yours && clean.sample ? clean : null
  }
  if (card.kind !== 'question') return card
  const clean = (value: string) => safeModelText(value, firm, 200)
  const choice = card.choice ? { yours: clean(card.choice.yours), sample: clean(card.choice.sample) } : undefined
  if (choice && (!choice.yours || !choice.sample)) return null
  return { ...card, topics: card.topics.map(clean).filter(Boolean),
    ...(card.placeholder ? { placeholder: clean(card.placeholder) } : {}),
    ...(card.chips ? { chips: card.chips.map(clean).filter(Boolean) } : {}), ...(choice ? { choice } : {}),
  }
}

function safeFirmPatch(patch: Partial<FirmFacts>, firm: FirmFacts | null) {
  const safe = { ...patch }, skipped: string[] = []
  if (safe.domain !== undefined && (!firm?.domain || firmHost(safe.domain) !== firmHost(firm.domain))) {
    delete safe.domain; skipped.push('set_firm.domain')
  }
  if (safe.icon !== undefined) {
    const icon = allowedModelUrl(safe.icon, firm, true)
    if (icon) safe.icon = icon
    else { delete safe.icon; skipped.push('set_firm.icon') }
  }
  return { patch: safe, skipped }
}

/** Validate actions independently so one bad action never discards the usable reply. */
export function validatedActions(values: unknown[], firm: FirmFacts | null): { actions: Action[]; skipped: string[] } {
  const actions: Action[] = [], skipped: string[] = []
  for (const value of values.slice(0, 30)) {
    const name = isRecord(value) && typeof value.type === 'string' ? value.type.slice(0, 40) : 'action'
    if (!isRecord(value)) { skipped.push(name); continue }
    let candidate = value
    if (value.type === 'set_firm' && isRecord(value.patch)) {
      const filtered = safeFirmPatch(value.patch, firm)
      skipped.push(...filtered.skipped)
      candidate = { ...value, patch: filtered.patch }
      if (!Object.keys(filtered.patch).length) continue
    }
    // URL checks apply inside nested profile/source/fact strings too. Keys and total
    // string lengths remain subject to isAction's strict schema bounds.
    const clean = (item: unknown): unknown => {
      if (typeof item === 'string') return safeModelText(item, firm, 2048)
      if (Array.isArray(item)) return item.map(clean)
      if (isRecord(item)) return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, clean(entry)]))
      return item
    }
    const safe = clean(candidate)
    if (JSON.stringify(safe) !== JSON.stringify(candidate)) skipped.push(`${name} URL`)
    if (isAction(safe)) actions.push(safe)
    else skipped.push(name)
  }
  if (values.length > 30) skipped.push('extra actions')
  return { actions, skipped: [...new Set(skipped)] }
}
const stateCodes = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP'.split(' '))
function isFirmPatch(value: unknown) {
  return isRecord(value) && Object.keys(value).length > 0 && Object.entries(value).every(([key, field]) => {
    if (key === 'states') return Array.isArray(field) && field.length <= 56 && field.every((state) => typeof state === 'string' && stateCodes.has(state))
    if (key === 'verticals' || key === 'clientTypes') return Array.isArray(field) && field.length <= 10 && field.every(shortString)
    if (key === 'staffing') return typeof field === 'boolean'
    if (key === 'summary') return typeof field === 'string' && field.length <= 1000
    if (key === 'icon') {
      if (typeof field !== 'string' || field.length > 2048) return false
      try { return new URL(field).protocol === 'https:' || /^\/apple-touch-icon[^/]*$/.test(field) } catch { return /^\/apple-touch-icon[^/]*$/.test(field) }
    }
    return ['name', 'size', 'domain'].includes(key) && shortString(field)
  })
}

// parseActions follows the wire format; check model-provided values before writing the store.
export function isAction(value: unknown): value is Action {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'remember': return validRememberAction(value)
    case 'approve':
    case 'dismiss':
      return meaningfulString(value.cycleId) && meaningfulString(value.groupId)
        && (value.type !== 'dismiss' || meaningfulString(value.reason))
        && Object.keys(value).every(key => ['type', 'cycleId', 'groupId', ...(value.type === 'dismiss' ? ['reason'] : [])].includes(key))
    case 'open_form':
      return meaningfulString(value.cycleId) && isJourneyForm(value.form) && Object.keys(value).every(key => ['type', 'cycleId', 'form'].includes(key))
    case 'set_fact':
      return ['site', 'rate', 'differential', 'alias', 'account'].includes(String(value.kind))
        && meaningfulString(value.key) && isRecord(value.value)
    case 'set_profile':
      return PROFILE_FIELDS.some((field) => field === value.field) && (shortString(value.value) || (isRecord(value.value)
        && Object.keys(value.value).length <= 10 && Object.entries(value.value).every(([key, item]) => meaningfulString(key) && !['__proto__', 'constructor', 'prototype'].includes(key) && shortString(item))))
    case 'set_firm': return isFirmPatch(value.patch)
    case 'add_source':
      return [1, 2, 3].includes(Number(value.set)) && typeof value.set === 'number'
        && ['email', 'sheet', 'system', 'upload', 'location', 'sample'].includes(String(value.kind))
        && meaningfulString(value.label) && (value.how === undefined || shortString(value.how))
    case 'remove_source': return [1, 2, 3].includes(Number(value.set)) && typeof value.set === 'number' && meaningfulString(value.label)
    case 'remove_rule': return meaningfulString(value.sentence)
    case 'set_authority':
      return isRecord(value.patch) && Object.keys(value.patch).length > 0 && Object.entries(value.patch).every(([key, field]) => {
        if (key === 'limit') return finiteRange(field, 10_000)
        if (key === 'weeklyCap') return finiteRange(field, 100_000)
        if (key === 'briefing') return field === 'Email' || field === 'Slack'
        return ['autoFix', 'textSupervisors', 'textWorkers'].includes(key) && typeof field === 'boolean'
      })
    case 'never_contact': return meaningfulString(value.name)
    case 'cover_topic': return ONBOARD_TOPICS.some((topic) => topic === value.topic)
    case 'set_calendar':
      return isRecord(value.patch) && Object.entries(value.patch).every(([key, field]) => {
        switch (key) {
          case 'frequency': return FREQUENCIES.some((item) => item === field)
          case 'periodEndDay':
          case 'payDay': return WEEKDAYS.some((item) => item === field)
          case 'payDatesOfMonth': return Array.isArray(field) && field.every((item) => typeof item === 'number' && Number.isFinite(item))
          case 'cutoffDays':
          case 'deadlineDays': return typeof field === 'number' && Number.isFinite(field)
          default: return false
        }
      })
    case 'add_cohort': {
      const cohort = value.cohort
      return isRecord(cohort) && meaningfulString(cohort.name) && shortString(cohort.frequency)
        && (cohort.payDay === undefined || WEEKDAYS.some((item) => item === cohort.payDay))
        && (cohort.periodEndDay === undefined || WEEKDAYS.some((item) => item === cohort.periodEndDay))
    }
    case 'add_rule':
      return meaningfulString(value.sentence) && (value.bucket === undefined || shortString(value.bucket))
        && (value.kind === undefined || value.kind === 'det' || value.kind === 'llm' || value.kind === 'both')
    case 'go': return meaningfulString(value.to) && /^\/(?!\/)/.test(value.to) && !value.to.includes('\\')
    case 'decide':
      return meaningfulString(value.cycleId) && meaningfulString(value.shiftId)
        && (value.decision === 'applied' || value.decision === 'dismissed')
        && (value.reason === undefined || shortString(value.reason))
        && (value.decision !== 'dismissed' || (typeof value.reason === 'string' && value.reason.trim().length > 0))
    case 'note': return shortString(value.text)
    default: return false
  }
}

/** A $0 weekly cap is never stored. With fixing allowed in the same answer it just means no weekly cap was stated; alone it means ask before every fix. */
export function authorityPatch(patch: Partial<Onboarding['authority']>): Partial<Onboarding['authority']> {
  if (patch.weeklyCap !== 0) return patch
  return patch.autoFix ? { ...patch, weeklyCap: null } : { ...patch, autoFix: false, weeklyCap: null }
}

export function applyAction(action: Action, update: ChatUpdate, navigate: NavigateFunction, params: URLSearchParams, cycleId?: string) {
  switch (action.type) {
    case 'remember': return rememberAction(action)
    case 'approve':
    case 'dismiss':
      return decide(action.cycleId, { groupId: action.groupId, decision: action.type === 'approve' ? 'approved' : 'dismissed', ...(action.type === 'dismiss' ? { reason: action.reason } : {}) }).then(() => {})
    case 'open_form':
      update(state => {
        const latest = memoryHistory(state.chat).at(-1)
        if (!latest || latest.role !== 'agent') return {}
        const card: Card = { kind: 'form', form: action.form, cycleId: action.cycleId }
        if (latest.cards?.some(item => item.kind === 'form' && item.form === action.form && item.cycleId === action.cycleId)) return {}
        return { chat: state.chat.map(message => message.id === latest.id ? { ...message, cards: limitCards([...(message.cards ?? []), card]).cards } : message) }
      })
      break
    case 'set_fact':
      // Facts are validated and saved by the server before its done event.
      void invalidate()
      break
    case 'set_profile':
      update((state) => ({ profile: { ...state.profile, [action.field]: action.value } }))
      break
    case 'set_firm':
      update((state) => ({ firm: { name: '', summary: '', states: [], verticals: [], clientTypes: [], size: '', staffing: true, ...state.firm, ...safeFirmPatch(action.patch, state.firm).patch } }))
      break
    case 'add_source':
      update((state) => {
        const source = { set: action.set, kind: action.kind, label: action.label.trim(), ...(action.how === undefined ? {} : { how: action.how }) }
        const at = state.sources.findIndex((item) => item.set === source.set && item.kind === source.kind && item.label.toLowerCase() === source.label.toLowerCase())
        return { sources: at < 0 ? [...state.sources, source] : state.sources.map((item, index) => index === at ? { ...item, ...source } : item) }
      })
      break
    case 'set_authority':
      update((state) => {
        const current = effectiveAuthority(state)
        const authority = { ...current }
        const suggestion: Partial<Onboarding['authority']> = {}
        for (const [key, value] of Object.entries(authorityPatch(action.patch))) {
          const field = key as keyof Onboarding['authority']
          const before = current[field]
          // No weekly cap is the widest setting: dropping a cap widens, adding one restricts.
          // An unset or legacy $0 cap reads as no cap, never as $0.
          const increase = field === 'weeklyCap' ? (!value ? !!before : !!before && Number(value) > Number(before))
            : typeof value === 'boolean' ? value && !before : typeof value === 'number' ? value > Number(before) : false
          if (increase) Object.assign(suggestion, { [field]: value })
          else Object.assign(authority, { [field]: value })
        }
        return { authority, authoritySuggestion: Object.keys(suggestion).length ? { ...state.authoritySuggestion, ...suggestion } : state.authoritySuggestion }
      })
      break
    case 'remove_source':
      update((state) => ({ sources: state.sources.filter((source) => source.set !== action.set || source.label.trim().toLowerCase() !== action.label.trim().toLowerCase()) }))
      break
    case 'remove_rule':
      update((state) => ({ customRules: state.customRules.filter((rule) => rule.sentence.trim().toLowerCase() !== action.sentence.trim().toLowerCase()) }))
      break
    case 'never_contact':
      update((state) => ({ neverContact: (state.neverContact ?? []).some((name) => name.toLowerCase() === action.name.trim().toLowerCase())
        ? state.neverContact : [...(state.neverContact ?? []), action.name.trim()] }))
      break
    case 'cover_topic':
      update((state) => ({ covered: state.covered.includes(action.topic) ? state.covered : [...state.covered, action.topic] }))
      break
    case 'set_calendar':
      update(action.patch)
      break
    case 'add_cohort':
      // A name already on file updates that cycle instead of adding a duplicate.
      update((state) => ({ cohorts: saveCycle(state.cohorts, {
        name: action.cohort.name,
        frequency: FREQUENCIES.find((value) => value === action.cohort.frequency) ?? state.frequency,
        periodEndDay: WEEKDAYS.find((value) => value === action.cohort.periodEndDay) ?? state.periodEndDay,
        payDay: WEEKDAYS.find((value) => value === action.cohort.payDay) ?? state.payDay,
        payDatesOfMonth: [...state.payDatesOfMonth],
      }, cycleNamed(state.cohorts, action.cohort.name)?.id) }))
      break
    case 'add_rule': {
      const rule: CustomDeskRule = {
        id: slugId('rule', crypto.randomUUID()), bucket: 'Custom', kind: action.kind ?? 'both',
        sentence: action.sentence, source: { doc: 'You told the agent' }, draft: false, at: Date.now(),
      }
      update((state) => ({ customRules: state.customRules.some((item) => item.sentence.trim().toLowerCase() === rule.sentence.trim().toLowerCase()) ? state.customRules : [...state.customRules, rule] }))
      break
    }
    case 'go':
      navigate(agentHref(action.to, params, cycleId))
      break
    case 'decide':
      if (getOnboarding().dataSource === 'server') throw new Error('use approve/dismiss for a group')
      update((state) => ({
        decisionTimes: { ...state.decisionTimes, [`${action.cycleId}:${action.shiftId}`]: new Date().toISOString() },
        resolutions: {
          ...state.resolutions,
          [action.cycleId]: { ...state.resolutions[action.cycleId], [action.shiftId]: action.decision },
        },
        ...(action.reason === undefined ? {} : {
          reasons: { ...state.reasons, [`${action.cycleId}:${action.shiftId}`]: action.reason.trim() },
        }),
      }))
      break
    case 'note':
      break
  }
}

/** What a set_authority patch says, in the Rulebook's words. */
export function authorityLine(patch: Partial<Onboarding['authority']>): string {
  const parts = [
    patch.autoFix === false ? 'ask before every fix' : patch.autoFix ? (patch.limit !== undefined ? `fix up to $${patch.limit.toLocaleString()} per entry without asking` : 'fix without asking')
      : patch.limit !== undefined ? `$${patch.limit.toLocaleString()} per-entry limit` : '',
    patch.weeklyCap ? `$${patch.weeklyCap.toLocaleString()} weekly cap` : '',
    patch.textSupervisors === undefined ? '' : patch.textSupervisors ? 'text site supervisors' : 'ask before texting supervisors',
    patch.textWorkers === undefined ? '' : patch.textWorkers ? 'text workers' : 'ask before texting workers',
    patch.briefing ? `${patch.briefing} briefing` : '',
  ].filter(Boolean).join(' · ')
  return parts.charAt(0).toUpperCase() + parts.slice(1)
}
const widens = (patch: Partial<Onboarding['authority']>) => Object.entries(patch).some(([key, value]) => key !== 'briefing' && (value === true || (typeof value === 'number' && value > 0)))

/** Skipped parts read as one human line. Raw action names never reach the user; notes that are already sentences pass through. */
export function skippedLine(skipped: readonly string[]): { text: string; retry: boolean } {
  const human = skipped.filter(item => /^[A-Z]/.test(item) && item.includes(' '))
  const retry = human.length < skipped.length
  return { text: [...(retry ? ["I couldn't save part of that."] : []), ...human].join(' '), retry }
}

export function actionSummary(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null
  const action = value as Record<string, unknown>
  switch (action.type) {
    case 'remember': return null
    case 'approve': return `Approved ${String(action.groupId)}`
    case 'dismiss': return `Dismissed ${String(action.groupId)} · ${String(action.reason)}`
    case 'open_form': return null
    case 'set_fact': return `Saved ${String(action.kind)} details: ${String(action.key)}`
    case 'set_profile': return `Payroll profile: ${String(action.field)}`
    case 'set_firm': return 'Updated firm details'
    // A source is a plan from setup; loading its time entries happens only through a connection or upload.
    case 'add_source': return `Planned: ${String(action.label)}${typeof action.how === 'string' && action.how ? ` · ${action.how}` : ''}`
    case 'set_authority': {
      const patch = (isRecord(action.patch) ? action.patch : {}) as Partial<Onboarding['authority']>
      // `consent` marks an explicit answer to the authority goal, applied as said. Without it, wider settings wait in the Rulebook.
      return action.consent || !widens(patch) ? `Saved: ${authorityLine(patch)}` : `Suggested: ${authorityLine(patch)} · confirm it in the Rulebook`
    }
    case 'remove_source': return `Removed plan: ${String(action.label)}`
    case 'remove_rule': return `Removed rule: ${String(action.sentence)}`
    case 'never_contact': return `Never contact: ${String(action.name)}`
    case 'cover_topic': return `Covered: ${String(action.topic)}`
    case 'set_calendar': return `Calendar: ${JSON.stringify(action.patch)}`
    case 'add_cohort': {
      const cohort = action.cohort as { name?: string } | undefined
      return `Added pay cycle: ${cohort?.name ?? ''}`
    }
    case 'add_rule': return `Added rule: ${action.sentence}`
    case 'go': return `Opened ${action.to}`
    case 'decide': return `${action.cycleId} · #${action.shiftId} · ${action.decision === 'applied' ? 'Applied' : 'Not an issue'}${action.reason ? ` · ${action.reason}` : ''}`
    case 'note': return String(action.text ?? '')
    default: return null
  }
}
