import type { Onboarding } from '@/lib/onboarding'

/** P6 owns these fields; existing server data outside this set survives every write. Chat is not here: it lives in closeout_chat. */
export const SYNC_FIELDS = ['firm', 'profile', 'covered', 'sources', 'neverContact', 'setupStep', 'setupHistory', 'setupRequest', 'setupClosing', 'setupNotice',
  'forwarded', 'frequency', 'periodEndDay', 'payDay', 'payDatesOfMonth', 'cutoffDays', 'deadlineDays', 'cohorts',
  'dataSource', 'timezone', 'resolutions', 'reasons', 'decisionTimes', 'acceptedGaps', 'undone', 'approvedCycles', 'declinedAutoApproveRules',
  'authority', 'authorityConfigured', 'authoritySuggestion', 'rules', 'proposals', 'customRules', 'chatSessionId'] as const satisfies readonly (keyof Onboarding)[]
export type SyncPatch = Partial<Pick<Onboarding, typeof SYNC_FIELDS[number]>>
export interface SyncStatus { ready: boolean; loading: boolean; saving: boolean; error: string | null }
interface StateRow { doc: Record<string, unknown>; updated_at: string | null }
interface Options {
  defaults: Onboarding
  read(): Onboarding
  apply(patch: Partial<Onboarding>): void
  loadPending(): SyncPatch
  savePending(patch: SyncPatch): void
  /** The canonical fields as of the last successful sync on this device; null before its first sync. */
  loadBase(): SyncPatch | null
  saveBase(base: SyncPatch): void
  request(method: 'GET' | 'PUT', body?: { doc: Record<string, unknown>; base_updated_at: string | null }): Promise<Response>
  status(status: SyncStatus): void
  /** Sees the first canonical document once, e.g. to move a legacy transcript out of it. */
  adopt?(doc: Record<string, unknown>): void
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const pick = (source: object): SyncPatch => Object.fromEntries(Object.entries(source).filter(([key]) => SYNC_FIELDS.some((field) => field === key))) as SyncPatch
const hasChanges = (patch: SyncPatch) => Object.keys(patch).length > 0
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
/** A pre-fix document may still carry the transcript; it is never written back. */
const withoutChat = (doc: Record<string, unknown>) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== 'chat'))

/** Identity of a list item for merging: names ignore case, records use their id (or set and label for sources). */
function itemKey(item: unknown): string | null {
  if (typeof item === 'string') return `s:${item.trim().toLowerCase()}`
  if (!object(item)) return null
  if (typeof item.id === 'string') return `id:${item.id}`
  if (typeof item.set === 'number' && typeof item.label === 'string') return `src:${item.set}:${item.label.trim().toLowerCase()}`
  return null
}

/** Three-way merge of one field. Lists of named items and records merge per item or key; a scalar the user changed wins. */
export function merge3(base: unknown, local: unknown, remote: unknown): unknown {
  if (equal(local, base)) return remote
  if (equal(remote, base) || equal(local, remote)) return local
  if (Array.isArray(local) && Array.isArray(remote) && [...local, ...remote].every((item) => itemKey(item) !== null)) {
    const before = new Map((Array.isArray(base) ? base : []).flatMap((item): [string, unknown][] => { const key = itemKey(item); return key ? [[key, item]] : [] }))
    const mine = new Map(local.map((item) => [itemKey(item)!, item]))
    const merged = remote.filter((item) => !(before.has(itemKey(item)!) && !mine.has(itemKey(item)!)))
      .map((item) => { const key = itemKey(item)!, own = mine.get(key); return own !== undefined && before.has(key) && !equal(own, before.get(key)) ? own : item })
    const present = new Set(merged.map(itemKey))
    return [...merged, ...local.filter((item) => !before.has(itemKey(item)!) && !present.has(itemKey(item)))]
  }
  if (object(local) && object(remote)) {
    const was = object(base) ? base : {}
    return Object.fromEntries([...new Set([...Object.keys(remote), ...Object.keys(local)])].flatMap((key) => {
      const value = merge3(was[key], local[key], remote[key])
      return value === undefined ? [] : [[key, value]]
    }))
  }
  return local
}

function row(value: unknown): StateRow {
  if (!object(value) || !(value.doc === null || object(value.doc)) || (value.updated_at !== undefined && value.updated_at !== null && typeof value.updated_at !== 'string')) {
    throw new Error('Your saved Payroll profile could not be read. Retry to continue.')
  }
  return { doc: value.doc ?? {}, updated_at: typeof value.updated_at === 'string' ? value.updated_at : null }
}

/** Conditional writes, merged per field against the last pulled base: pull on focus and before every push; a 409 pulls, merges and retries. */
export function createOnboardingSync(options: Options) {
  let enabled = false, initialized = false, pullGeneration = 0
  let remote: StateRow = { doc: {}, updated_at: null }
  let base: SyncPatch | null = null
  let pending: SyncPatch = {}
  let lastLocal: SyncPatch = {}
  let hydration: Promise<void> | null = null, writing: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let status: SyncStatus = { ready: false, loading: false, saving: false, error: null }
  const report = (patch: Partial<SyncStatus>) => { status = { ...status, ...patch }; options.status(status) }
  const persist = () => options.savePending(pending)
  // An adopted legacy transcript is durably queued before this cleanup; no defaults
  // are introduced just to remove that obsolete field from an existing document.
  const needsWrite = () => hasChanges(pending) || Object.hasOwn(remote.doc, 'chat')
  const applyRemote = () => { options.apply({ ...pick(options.defaults), ...pick(remote.doc), ...pending }); lastLocal = pick(options.read()) }
  const valueIn = (source: Record<string, unknown>, key: string) => key in source ? source[key] : options.defaults[key as keyof Onboarding]

  /** Adopt a newer canonical document, keeping each unsaved local edit merged against the base it was made on. */
  function rebase(next: StateRow) {
    const was = base ?? {}
    pending = Object.fromEntries(Object.entries(pending).flatMap(([key, local]) => {
      const theirs = valueIn(next.doc, key)
      const merged = merge3(valueIn(was, key), local, theirs)
      return key in next.doc && equal(merged, theirs) ? [] : [[key, merged]]
    })) as SyncPatch
    remote = next
    base = pick(next.doc)
    options.saveBase(base)
    persist()
    applyRemote()
  }
  async function pullRow(): Promise<StateRow> {
    const response = await options.request('GET')
    if (!response.ok) throw new Error('Your Payroll profile could not be loaded. Retry to continue.')
    return row(await response.json())
  }

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
    if (!enabled) {
      enabled = true
      base = options.loadBase()
      pending = pick(options.loadPending())
      // The previous sync implementation queued its whole defaults object on a first
      // hydrate. Without a saved base those values cannot prove an intentional edit.
      if (!base) pending = Object.fromEntries(Object.entries(pending).filter(([key, value]) => !equal(value, valueIn({}, key)))) as SyncPatch
      lastLocal = pick(options.read())
    }
    report({ loading: true, error: null })
    hydration = (async () => {
      const next = await pullRow()
      options.adopt?.(next.doc)
      if (!base) {
        // First sync on this device: offer only what the user actually changed locally, never untouched defaults,
        // and only where the canonical document is missing the field or still holds the default.
        const local = pick(options.read())
        const seed = Object.fromEntries(Object.entries(local).filter(([key, value]) =>
          !equal(value, valueIn({}, key)) && (!(key in next.doc) || equal(next.doc[key], valueIn({}, key)))))
        pending = { ...seed, ...pending }
      }
      rebase(next)
      initialized = true
      report({ ready: true, loading: false, error: null })
      if (needsWrite()) schedule()
    })().catch((cause: unknown) => {
      report({ loading: false, error: cause instanceof Error ? cause.message : 'Your Payroll profile could not be loaded. Retry to continue.' })
      throw cause
    }).finally(() => { hydration = null })
    return hydration
  }
  /** Focus or visibility: take changes made on another device. A write in flight reconciles on its own. */
  async function pull() {
    if (!initialized || writing) return
    const generation = ++pullGeneration
    try {
      const next = await pullRow()
      // A newer pull or write owns reconciliation; this response is now stale.
      if (generation !== pullGeneration || writing) return
      rebase(next)
      report({ error: null })
      if (needsWrite()) schedule()
    } catch (cause) {
      if (generation !== pullGeneration) return
      report({ error: cause instanceof Error ? cause.message : 'Your Payroll profile could not be loaded.' })
      throw cause
    }
  }
  async function flush() {
    clearTimeout(timer)
    await hydrate()
    if (writing) { await writing; if (needsWrite()) return flush(); return }
    if (!needsWrite()) return
    report({ saving: true, error: null })
    pullGeneration += 1
    writing = (async () => {
      let conflicts = 0
      while (needsWrite()) {
        // Pull immediately before every attempt, including conflict retries and edits queued mid-write.
        rebase(await pullRow())
        if (!needsWrite()) break
        const submitted = { ...pending }
        const response = await options.request('PUT', { doc: { ...withoutChat(remote.doc), ...submitted }, base_updated_at: remote.updated_at })
        if (response.status === 409) {
          if (++conflicts > 3) throw new Error('Your Payroll profile changed elsewhere. Retry to save your changes.')
          continue
        }
        if (!response.ok) throw new Error('Your Payroll profile could not be saved. Your changes are kept here; retry to save them.')
        const saved = row(await response.json())
        // Edits made while this write was in flight stay pending for the next pass.
        pending = Object.fromEntries(Object.entries(pending).filter(([key, value]) => !equal(value, submitted[key as keyof SyncPatch]))) as SyncPatch
        remote = saved
        base = pick(saved.doc)
        options.saveBase(base)
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
  return { hydrate, flush, changed, pull }
}
