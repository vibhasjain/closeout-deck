import type { NavigateFunction } from 'react-router-dom'
import type { Action } from '@/lib/chat'
import { agentHref } from '@/lib/navigation'
import { cycleNamed, saveCycle, slugId } from '@/lib/cohorts'
import { FREQUENCIES, WEEKDAYS, ONBOARD_TOPICS, PROFILE_FIELDS } from '@/lib/onboarding'
import type { CustomDeskRule, Onboarding } from '@/lib/onboarding'

export type ChatUpdate = (patch: Partial<Onboarding> | ((state: Onboarding) => Partial<Onboarding>)) => void

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const shortString = (value: unknown): value is string => typeof value === 'string' && value.length <= 200
const meaningfulString = (value: unknown): value is string => shortString(value) && value.trim().length > 0
const finiteRange = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
const stateCodes = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '))
function isFirmPatch(value: unknown) {
  return isRecord(value) && Object.keys(value).length > 0 && Object.entries(value).every(([key, field]) => {
    if (key === 'states') return Array.isArray(field) && field.length <= 51 && field.every((state) => typeof state === 'string' && stateCodes.has(state))
    if (key === 'verticals' || key === 'clientTypes') return Array.isArray(field) && field.length <= 10 && field.every(shortString)
    if (key === 'staffing') return typeof field === 'boolean'
    if (key === 'summary') return typeof field === 'string' && field.length <= 1000
    if (key === 'icon') {
      if (typeof field !== 'string' || field.length > 2048) return false
      try { return new URL(field).protocol === 'https:' } catch { return false }
    }
    return ['name', 'size', 'domain'].includes(key) && shortString(field)
  })
}

// parseActions follows the wire format; check model-provided values before writing the store.
export function isAction(value: unknown): value is Action {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'set_profile':
      return PROFILE_FIELDS.some((field) => field === value.field) && (shortString(value.value) || (isRecord(value.value)
        && Object.keys(value.value).length <= 10 && Object.entries(value.value).every(([key, item]) => meaningfulString(key) && !['__proto__', 'constructor', 'prototype'].includes(key) && shortString(item))))
    case 'set_firm': return isFirmPatch(value.patch)
    case 'add_source':
      return [1, 2, 3].includes(Number(value.set)) && typeof value.set === 'number'
        && ['email', 'sheet', 'system', 'upload', 'location', 'sample'].includes(String(value.kind))
        && meaningfulString(value.label) && (value.how === undefined || shortString(value.how))
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
      return isRecord(cohort) && typeof cohort.name === 'string' && cohort.name.trim() !== '' && typeof cohort.frequency === 'string'
        && (cohort.payDay === undefined || typeof cohort.payDay === 'string')
        && (cohort.periodEndDay === undefined || WEEKDAYS.some((item) => item === cohort.periodEndDay))
    }
    case 'add_rule':
      return typeof value.sentence === 'string' && (value.bucket === undefined || typeof value.bucket === 'string')
        && (value.kind === undefined || value.kind === 'det' || value.kind === 'llm' || value.kind === 'both')
    case 'go': return typeof value.to === 'string'
    case 'decide':
      return typeof value.cycleId === 'string' && typeof value.shiftId === 'string'
        && (value.decision === 'applied' || value.decision === 'dismissed')
        && (value.reason === undefined || typeof value.reason === 'string')
        && (value.decision !== 'dismissed' || (typeof value.reason === 'string' && value.reason.trim().length > 0))
    case 'note': return typeof value.text === 'string'
    default: return false
  }
}

export function applyAction(action: Action, update: ChatUpdate, navigate: NavigateFunction, params: URLSearchParams, cycleId?: string) {
  switch (action.type) {
    case 'set_profile':
      update((state) => ({ profile: { ...state.profile, [action.field]: action.value } }))
      break
    case 'set_firm':
      update((state) => ({ firm: { name: '', summary: '', states: [], verticals: [], clientTypes: [], size: '', staffing: true, ...state.firm, ...action.patch } }))
      break
    case 'add_source':
      update((state) => {
        const source = { set: action.set, kind: action.kind, label: action.label.trim(), ...(action.how === undefined ? {} : { how: action.how }) }
        const at = state.sources.findIndex((item) => item.set === source.set && item.kind === source.kind && item.label.toLowerCase() === source.label.toLowerCase())
        return { sources: at < 0 ? [...state.sources, source] : state.sources.map((item, index) => index === at ? { ...item, ...source } : item) }
      })
      break
    case 'set_authority':
      update((state) => ({ authority: { ...state.authority, ...action.patch }, authorityConfigured: true }))
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
      update((state) => ({ customRules: [...state.customRules, rule] }))
      break
    }
    case 'go':
      navigate(agentHref(action.to, params, cycleId))
      break
    case 'decide':
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

export function actionSummary(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null
  const action = value as Record<string, unknown>
  switch (action.type) {
    case 'set_profile': return `Payroll profile: ${String(action.field)}`
    case 'set_firm': return 'Updated firm details'
    case 'add_source': return `Added source: ${String(action.label)}`
    case 'set_authority': return 'Updated what I fix on my own'
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

