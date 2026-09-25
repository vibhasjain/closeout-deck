import type { Onboarding } from '@/lib/onboarding'

/** P6 owns these fields; existing server data outside this set survives every write. */
export const SYNC_FIELDS = ['firm', 'profile', 'covered', 'sources', 'neverContact', 'setupStep', 'setupHistory', 'setupRequest',
  'forwarded', 'frequency', 'periodEndDay', 'payDay', 'payDatesOfMonth', 'cutoffDays', 'deadlineDays', 'cohorts',
  'dataSource', 'timezone', 'resolutions', 'reasons', 'decisionTimes', 'acceptedGaps', 'undone', 'approvedCycles',
  'authority', 'authorityConfigured', 'rules', 'proposals', 'customRules', 'chat', 'chatSessionId'] as const satisfies readonly (keyof Onboarding)[]
export type SyncPatch = Partial<Pick<Onboarding, typeof SYNC_FIELDS[number]>>
export interface SyncStatus { ready: boolean; loading: boolean; saving: boolean; error: string | null }
interface StateRow { doc: Record<string, unknown>; updated_at: string | null }
interface Options {
  read(): Onboarding
  apply(patch: Partial<Onboarding>): void
  loadPending(): SyncPatch
  savePending(patch: SyncPatch): void
  request(method: 'GET' | 'PUT', body?: { doc: Record<string, unknown>; base_updated_at: string | null }): Promise<Response>
  status(status: SyncStatus): void
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const pick = (source: object): SyncPatch => Object.fromEntries(Object.entries(source).filter(([key]) => SYNC_FIELDS.some((field) => field === key))) as SyncPatch
const hasChanges = (patch: SyncPatch) => Object.keys(patch).length > 0
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

function row(value: unknown): StateRow {
  if (!object(value) || !(value.doc === null || object(value.doc)) || (value.updated_at !== undefined && value.updated_at !== null && typeof value.updated_at !== 'string')) {
    throw new Error('Your saved Payroll profile could not be read. Retry to continue.')
  }
  return { doc: value.doc ?? {}, updated_at: typeof value.updated_at === 'string' ? value.updated_at : null }
}

/** Conditional writes serialize local changes and rebase only dirty fields after a conflict. */
export function createOnboardingSync(options: Options) {
  let enabled = false, initialized = false
  let remote: StateRow = { doc: {}, updated_at: null }
  let pending: SyncPatch = {}
  let lastLocal: SyncPatch = {}
  let hydration: Promise<void> | null = null, writing: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let status: SyncStatus = { ready: false, loading: false, saving: false, error: null }
  const report = (patch: Partial<SyncStatus>) => { status = { ...status, ...patch }; options.status(status) }
  const persist = () => options.savePending(pending)
  const applyRemote = () => { options.apply({ ...pick(remote.doc), ...pending }); lastLocal = pick(options.read()) }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => { void flush().catch(() => { /* status exposes the error to the UI; pending changes stay durable */ }) }, 350)
  }
  function changed(patch: Partial<Onboarding>) {
    if (!enabled) return
    const relevant = Object.fromEntries(Object.entries(pick(patch)).filter(([key, value]) => !equal(value, lastLocal[key as keyof SyncPatch]))) as SyncPatch
    lastLocal = { ...lastLocal, ...pick(patch) }
    if (!hasChanges(relevant)) return
    pending = { ...pending, ...relevant }
    persist()
    if (initialized) schedule()
  }
  async function hydrate() {
    if (initialized) return
    if (hydration) return hydration
    if (!enabled) { enabled = true; pending = pick(options.loadPending()); lastLocal = pick(options.read()) }
    report({ loading: true, error: null })
    hydration = (async () => {
      const response = await options.request('GET')
      if (!response.ok) throw new Error('Your Payroll profile could not be loaded. Retry to continue.')
      remote = row(await response.json())
      // Adopt existing local setup only for fields absent from the canonical document.
      const local = pick(options.read())
      pending = { ...Object.fromEntries(Object.entries(local).filter(([key]) => !(key in remote.doc))), ...pending }
      applyRemote()
      persist()
      initialized = true
      report({ ready: true, loading: false, error: null })
      if (hasChanges(pending)) schedule()
    })().catch((cause: unknown) => {
      report({ loading: false, error: cause instanceof Error ? cause.message : 'Your Payroll profile could not be loaded. Retry to continue.' })
      throw cause
    }).finally(() => { hydration = null })
    return hydration
  }
  async function flush() {
    clearTimeout(timer)
    await hydrate()
    if (writing) { await writing; if (hasChanges(pending)) return flush(); return }
    if (!hasChanges(pending)) return
    report({ saving: true, error: null })
    writing = (async () => {
      let conflicts = 0
      while (hasChanges(pending)) {
        const submitted = { ...pending }
        const response = await options.request('PUT', { doc: { ...remote.doc, ...submitted }, base_updated_at: remote.updated_at })
        if (response.status === 409) {
          remote = row(await response.json())
          if (++conflicts > 3) throw new Error('Your Payroll profile changed elsewhere. Retry to save your changes.')
          continue
        }
        if (!response.ok) throw new Error('Your Payroll profile could not be saved. Your changes are kept here; retry to save them.')
        remote = row(await response.json())
        pending = Object.fromEntries(Object.entries(pending).filter(([key, value]) => !equal(value, submitted[key as keyof SyncPatch]))) as SyncPatch
        persist()
        applyRemote()
        conflicts = 0
      }
      report({ saving: false, error: null })
    })().catch((cause: unknown) => {
      report({ saving: false, error: cause instanceof Error ? cause.message : 'Your Payroll profile could not be saved. Retry to save your changes.' })
      throw cause
    }).finally(() => { writing = null })
    return writing
  }
  return { hydrate, flush, changed }
}
