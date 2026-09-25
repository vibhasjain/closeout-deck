import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MappingSpec, TimeEntry } from './ingest.ts'
import type { CyclePayload, FindingCase } from './pipeline.ts'

export interface SourceRecord {
  id: string; set: 1 | 2 | 3; system: string; site: string | null
  method: 'upload' | 'simulated'; sample: boolean; createdAt: string; lastReceivedAt: string | null
}
export interface MappingRecord {
  id: string; fingerprint: string; spec: MappingSpec; author: 'agent' | 'library' | 'user'
  version: number; updatedAt: string
}
export interface FileRecord {
  id: string; sourceId: string | null; mappingId: string | null; name: string; mime: string; bytes: number
  sha256: string; storagePath: string
  status: 'received' | 'needs_mapping' | 'normalized' | 'needs_extraction' | 'rejected'
  fingerprint: string | null; setHint: 1 | 2 | 3 | null; periodEnd: string | null
  firstDate: string | null; lastDate: string | null; rowCount: number | null; entryCount: number | null
  unparsed: { row: number; reason: string }[]; sample: boolean; receivedAt: string; normalizedAt: string | null
}
export type FactKind = 'site' | 'rate' | 'differential' | 'alias' | 'account'
export interface FactRecord {
  kind: FactKind; key: string; value: Record<string, unknown>; source: 'user' | 'agent' | 'sample' | 'firm'
  sample: boolean; updatedAt: string
}
export interface RunRecord {
  cycleId: string; runId: string; periodStart: string; inputHash: string; storagePath: string
  totals: CyclePayload['totals']; counts: { set1: number; set2: number; set3: number }
  groups: CyclePayload['groups']; gaps: CyclePayload['gaps']; sample: boolean; runAt: string
}
export interface DataManifest {
  files: Pick<FileRecord, 'id' | 'sha256' | 'status' | 'normalizedAt'>[]
  runs: Pick<RunRecord, 'cycleId' | 'runId'>[]
  factsUpdatedAt: string | null
}
/** One persisted chat line (closeout_chat). The client owns the id; rows are append-only. */
export interface ChatRecord {
  id: string; role: 'user' | 'agent'; text: string; at: number; scope?: string; cards?: unknown[]; context?: Record<string, unknown>
}
export const CHAT_HISTORY_LIMIT = 500
export interface EntryQuery {
  from?: string; to?: string; fileId?: string; sourceId?: string; ids?: string[]; offset?: number; limit?: number
  includeSuperseded?: boolean; includeUnnormalized?: boolean
}
export interface DataStore {
  ensureAccount(email: string): Promise<void>
  listSources(email: string): Promise<SourceRecord[]>
  getSource(email: string, id: string): Promise<SourceRecord | null>
  upsertSource(email: string, source: SourceRecord): Promise<void>
  listMappings(email: string): Promise<MappingRecord[]>
  getMapping(email: string, fingerprint: string): Promise<MappingRecord | null>
  upsertMapping(email: string, mapping: MappingRecord): Promise<void>
  listFiles(email: string): Promise<FileRecord[]>
  getFile(email: string, id: string): Promise<FileRecord | null>
  getFileBySha(email: string, sha256: string): Promise<FileRecord | null>
  upsertFile(email: string, file: FileRecord): Promise<void>
  replaceEntries(email: string, fileId: string, entries: TimeEntry[]): Promise<void>
  listEntries(email: string, query?: EntryQuery): Promise<TimeEntry[]>
  countEntries(email: string, fileId: string): Promise<number>
  supersedeEntries(email: string, sourceId: string, newFileId: string, workerDays: { workerKey: string; workDate: string }[]): Promise<number>
  listFacts(email: string): Promise<FactRecord[]>
  upsertFact(email: string, fact: FactRecord): Promise<void>
  listRuns(email: string): Promise<RunRecord[]>
  getRun(email: string, cycleId: string): Promise<RunRecord | null>
  deleteRun(email: string, cycleId: string): Promise<void>
  saveRun(email: string, run: RunRecord, findings: FindingCase[], payload: CyclePayload): Promise<void>
  getRunPayload(email: string, run: RunRecord | string): Promise<CyclePayload | null>
  listFindings(email: string, cycleId: string): Promise<FindingCase[]>
  manifest(email: string): Promise<DataManifest>
  putObject(email: string, path: string, bytes: Uint8Array, mime?: string): Promise<void>
  getObject(email: string, path: string): Promise<Buffer | null>
  deleteSample(email: string): Promise<void>
  /** The latest CHAT_HISTORY_LIMIT lines, oldest first. */
  listChat(email: string): Promise<ChatRecord[]>
  /** Idempotent by id: a replayed line is ignored. */
  appendChat(email: string, messages: ChatRecord[]): Promise<void>
}

export function accountHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16)
}

function checkedPath(email: string, path: string): string {
  if (!path.startsWith(`${accountHash(email)}/`) || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('invalid_storage_path')
  }
  return path
}

export class DuplicateFileError extends Error {
  constructor(readonly id: string) { super('duplicate_file') }
}

/** Deterministic entry ids are shared by unchanged rows in successive exports. A newer
 * file takes ownership of that id, so historical per-file counts must be checked only
 * after replaying every file (oldest first), rather than against each original in isolation. */
export async function verifyRebuiltEntries(
  store: DataStore, email: string, ordered: { fileId: string; entries: TimeEntry[] }[],
): Promise<TimeEntry[]> {
  const owned = new Map<string, TimeEntry>()
  for (const file of ordered) for (const entry of file.entries) {
    if (entry.fileId !== file.fileId) throw new Error('rebuild_file_mismatch')
    owned.set(entry.id, entry)
  }
  const counts = new Map<string, number>()
  for (const entry of owned.values()) counts.set(entry.fileId, (counts.get(entry.fileId) ?? 0) + 1)
  for (const file of ordered) if (await store.countEntries(email, file.fileId) !== (counts.get(file.fileId) ?? 0)) throw new Error('rebuild_entry_count_mismatch')
  return [...owned.values()]
}

const clone = <T>(value: T): T => structuredClone(value)
const nextVersion = (previous?: string) => new Date(Math.max(Date.now(), (previous ? Date.parse(previous) : 0) + 1)).toISOString()
const factId = (fact: Pick<FactRecord, 'kind' | 'key'>) => `${fact.kind}\u001f${fact.key}`

export function createMemoryDataStore(): DataStore {
  interface Account {
    sources: Map<string, SourceRecord>; mappings: Map<string, MappingRecord>; files: Map<string, FileRecord>
    entries: Map<string, TimeEntry>; facts: Map<string, FactRecord>; runs: Map<string, RunRecord>
    findings: Map<string, FindingCase[]>; objects: Map<string, Buffer>; chat: Map<string, ChatRecord>
  }
  const accounts = new Map<string, Account>()
  function account(email: string): Account {
    let current = accounts.get(email)
    if (!current) {
      current = { sources: new Map(), mappings: new Map(), files: new Map(), entries: new Map(), facts: new Map(), runs: new Map(), findings: new Map(), objects: new Map(), chat: new Map() }
      accounts.set(email, current)
    }
    return current
  }
  const store: DataStore = {
    async ensureAccount(email) { account(email) },
    async listSources(email) { return clone([...account(email).sources.values()]) },
    async getSource(email, id) { return clone(account(email).sources.get(id) ?? null) },
    async upsertSource(email, value) { account(email).sources.set(value.id, clone(value)) },
    async listMappings(email) { return clone([...account(email).mappings.values()]) },
    async getMapping(email, fingerprint) { return clone([...account(email).mappings.values()].find(row => row.fingerprint === fingerprint) ?? null) },
    async upsertMapping(email, value) { account(email).mappings.set(value.id, clone(value)) },
    async listFiles(email) { return clone([...account(email).files.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))) },
    async getFile(email, id) { return clone(account(email).files.get(id) ?? null) },
    async getFileBySha(email, sha) { return clone([...account(email).files.values()].find(row => row.sha256 === sha) ?? null) },
    async upsertFile(email, file) {
      const duplicate = await store.getFileBySha(email, file.sha256)
      if (duplicate && duplicate.id !== file.id) throw new DuplicateFileError(duplicate.id)
      account(email).files.set(file.id, clone(file))
    },
    async replaceEntries(email, fileId, entries) {
      const state = account(email)
      if (!state.files.has(fileId) || entries.some(row => row.fileId !== fileId || !state.sources.has(row.sourceId))) throw new Error('file_not_found')
      for (const [id, entry] of state.entries) if (entry.fileId === fileId) state.entries.delete(id)
      for (const entry of entries) state.entries.set(entry.id, clone(entry))
    },
    async listEntries(email, query = {}) {
      const state = account(email)
      const ids = query.ids ? new Set(query.ids) : null
      const rows = [...state.entries.values()].filter(entry =>
        (query.includeUnnormalized || state.files.get(entry.fileId)?.status === 'normalized') &&
        (query.includeSuperseded || !entry.supersededBy) &&
        (!query.from || entry.workDate >= query.from) && (!query.to || entry.workDate <= query.to) &&
        (!query.fileId || entry.fileId === query.fileId) && (!query.sourceId || entry.sourceId === query.sourceId) && (!ids || ids.has(entry.id)),
      ).sort((a, b) => a.workDate.localeCompare(b.workDate) || a.id.localeCompare(b.id))
      return clone(rows.slice(query.offset ?? 0, query.limit === undefined ? undefined : (query.offset ?? 0) + query.limit))
    },
    async countEntries(email, fileId) { return [...account(email).entries.values()].filter(row => row.fileId === fileId).length },
    async supersedeEntries(email, sourceId, newFileId, workerDays) {
      const state = account(email)
      if (!state.files.has(newFileId) || !state.sources.has(sourceId)) throw new Error('file_not_found')
      const keys = new Set(workerDays.map(row => `${row.workerKey}\u001f${row.workDate}`))
      let count = 0
      for (const entry of state.entries.values()) if (entry.sourceId === sourceId && entry.fileId !== newFileId && !entry.supersededBy && keys.has(`${entry.workerKey}\u001f${entry.workDate}`)) {
        entry.supersededBy = newFileId; count++
      }
      return count
    },
    async listFacts(email) { return clone([...account(email).facts.values()]) },
    async upsertFact(email, value) {
      const facts = account(email).facts, previous = [...facts.values()].map(row => row.updatedAt).sort().at(-1)
      facts.set(factId(value), clone({ ...value, updatedAt: nextVersion(previous) }))
    },
    async listRuns(email) { return clone([...account(email).runs.values()].sort((a, b) => b.cycleId.localeCompare(a.cycleId))) },
    async getRun(email, cycleId) { return clone(account(email).runs.get(cycleId) ?? null) },
    async deleteRun(email, cycleId) {
      const state = account(email), run = state.runs.get(cycleId)
      if (!run) return
      state.runs.delete(cycleId)
      state.findings.delete(run.runId)
      state.objects.delete(run.storagePath)
    },
    async saveRun(email, run, findings, payload) {
      const state = account(email), old = state.runs.get(run.cycleId)
      await store.putObject(email, run.storagePath, gzipSync(JSON.stringify(payload)), 'application/gzip')
      state.findings.set(run.runId, clone(findings))
      state.runs.set(run.cycleId, clone(run))
      if (old && old.runId !== run.runId) { state.findings.delete(old.runId); state.objects.delete(old.storagePath) }
    },
    async getRunPayload(email, input) {
      const run = typeof input === 'string' ? await store.getRun(email, input) : input
      if (!run || (await store.getRun(email, run.cycleId))?.runId !== run.runId) return null
      const bytes = await store.getObject(email, run.storagePath)
      return bytes ? JSON.parse(gunzipSync(bytes).toString('utf8')) as CyclePayload : null
    },
    async listFindings(email, cycleId) {
      const state = account(email), run = state.runs.get(cycleId)
      return clone(run ? state.findings.get(run.runId) ?? [] : [])
    },
    async manifest(email) {
      const state = account(email)
      return {
        files: [...state.files.values()].map(({ id, sha256, status, normalizedAt }) => ({ id, sha256, status, normalizedAt })),
        runs: [...state.runs.values()].map(({ cycleId, runId }) => ({ cycleId, runId })),
        factsUpdatedAt: [...state.facts.values()].map(row => row.updatedAt).sort().at(-1) ?? null,
      }
    },
    async putObject(email, path, bytes) { account(email).objects.set(checkedPath(email, path), Buffer.from(bytes)) },
    async getObject(email, path) { const bytes = account(email).objects.get(checkedPath(email, path)); return bytes ? Buffer.from(bytes) : null },
    async deleteSample(email) {
      const state = account(email)
      for (const [id, row] of state.files) if (row.sample) { state.files.delete(id); state.objects.delete(row.storagePath) }
      for (const [id, row] of state.entries) if (row.sample || !state.files.has(row.fileId)) state.entries.delete(id)
      for (const [id, row] of state.sources) if (row.sample) state.sources.delete(id)
      for (const [id, row] of state.facts) if (row.sample) state.facts.delete(id)
      const lastFact = [...state.facts.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      if (lastFact) lastFact.updatedAt = nextVersion(lastFact.updatedAt)
      for (const [id, row] of state.runs) if (row.sample) { state.runs.delete(id); state.findings.delete(row.runId); state.objects.delete(row.storagePath) }
      // Mappings are reusable layout knowledge; only data tagged sample is removed.
      for (const row of state.entries.values()) if (row.supersededBy && !state.files.has(row.supersededBy)) row.supersededBy = null
    },
    async listChat(email) { return clone([...account(email).chat.values()].sort((a, b) => a.at - b.at).slice(-CHAT_HISTORY_LIMIT)) },
    async appendChat(email, messages) {
      const chat = account(email).chat
      for (const message of messages) if (!chat.has(message.id)) chat.set(message.id, clone(message))
    },
  }
  return store
}

type Row = Record<string, unknown>
const names: Record<string, string> = {
  set: 'set_no', sourceId: 'source_id', mappingId: 'mapping_id', storagePath: 'storage_path', setHint: 'set_hint',
  periodEnd: 'period_end', firstDate: 'first_date', lastDate: 'last_date', rowCount: 'row_count', entryCount: 'entry_count',
  receivedAt: 'received_at', normalizedAt: 'normalized_at', createdAt: 'created_at', lastReceivedAt: 'last_received_at',
  updatedAt: 'updated_at', fileId: 'file_id', workerKey: 'worker_key', workerExt: 'worker_ext', siteKey: 'site_key',
  workDate: 'work_date', start: 'start_min', end: 'end_min', mealMin: 'meal_min', payRate: 'pay_rate', billRate: 'bill_rate',
  payCode: 'pay_code', approvedBy: 'approved_by', dupOf: 'dup_of', supersededBy: 'superseded_by', cycleId: 'cycle_id',
  runId: 'run_id', periodStart: 'period_start', inputHash: 'input_hash', runAt: 'run_at', shiftId: 'shift_id', ruleId: 'rule_id', entryIds: 'entry_ids',
}
const reverseNames = Object.fromEntries(Object.entries(names).map(([key, value]) => [value, key]))
function encode(value: object): Row {
  const output: Row = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'sched') { output.sched_start = item?.[0] ?? null; output.sched_end = item?.[1] ?? null }
    else if (item !== undefined) output[names[key] ?? key] = item
  }
  return output
}
function decode<T>(value: Row): T {
  const output: Row = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'email' || key === 'sched_start' || key === 'sched_end') continue
    output[reverseNames[key] ?? key] = item
  }
  if ('sched_start' in value) output.sched = value.sched_start == null || value.sched_end == null ? null : [value.sched_start, value.sched_end]
  return output as T
}

export function createDataStore(client: SupabaseClient): DataStore {
  const bucket = client.storage.from('closeout-files')
  const table = (name: string) => client.from(`closeout_${name}`)
  async function all<T>(name: string, email: string, columns = '*'): Promise<T[]> {
    const rows: T[] = []
    for (let offset = 0; ; offset += 1000) {
      const request = table(name).select(columns).eq('email', email)
      const ordered = name === 'facts' ? request.order('kind').order('key') : request.order(name === 'runs' ? 'cycle_id' : 'id')
      const { data, error } = await ordered.range(offset, offset + 999)
      if (error) throw new Error(`data_${name}_read_failed`)
      rows.push(...(data as unknown as Row[]).map(row => decode<T>(row)))
      if (data.length < 1000) return rows
    }
  }
  async function one<T>(name: string, email: string, column: string, value: string): Promise<T | null> {
    const { data, error } = await table(name).select('*').eq('email', email).eq(column, value).maybeSingle()
    if (error) throw new Error(`data_${name}_read_failed`)
    return data ? decode<T>(data as Row) : null
  }
  async function write(name: string, email: string, value: { id: string }) {
    await store.ensureAccount(email)
    const existing = await one(name, email, 'id', value.id)
    const row = { ...encode(value), email }
    const { error } = existing ? await table(name).update(row).eq('email', email).eq('id', value.id) : await table(name).insert(row)
    if (error) throw new Error(`data_${name}_write_failed`)
  }
  const store: DataStore = {
    async ensureAccount(email) {
      const { error } = await table('state').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })
      if (error) throw new Error('data_account_write_failed')
    },
    listSources: email => all<SourceRecord>('sources', email),
    getSource: (email, id) => one<SourceRecord>('sources', email, 'id', id),
    upsertSource: (email, source) => write('sources', email, source),
    listMappings: email => all<MappingRecord>('mappings', email),
    getMapping: (email, fingerprint) => one<MappingRecord>('mappings', email, 'fingerprint', fingerprint),
    upsertMapping: (email, mapping) => write('mappings', email, mapping),
    async listFiles(email) { return (await all<FileRecord>('files', email)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)) },
    getFile: (email, id) => one<FileRecord>('files', email, 'id', id),
    getFileBySha: (email, sha) => one<FileRecord>('files', email, 'sha256', sha),
    async upsertFile(email, file) {
      const duplicate = await store.getFileBySha(email, file.sha256)
      if (duplicate && duplicate.id !== file.id) throw new DuplicateFileError(duplicate.id)
      await write('files', email, file)
    },
    async replaceEntries(email, fileId, entries) {
      if (!await store.getFile(email, fileId) || entries.some(row => row.fileId !== fileId)) throw new Error('file_not_found')
      const sourceIds = new Set((await store.listSources(email)).map(row => row.id))
      if (entries.some(row => !sourceIds.has(row.sourceId))) throw new Error('source_not_found')
      const previous = new Map((await store.listEntries(email, { fileId, includeUnnormalized: true, includeSuperseded: true })).map(row => [row.id, row]))
      const incoming = new Set(entries.map(row => row.id)), files = await store.listFiles(email)
      // Re-exports can take ownership of unchanged deterministic ids from old files.
      // Snapshot only those rows, so a failed batch can restore the previous export.
      for (const sourceId of new Set(entries.map(row => row.sourceId))) {
        if (!files.some(file => file.id !== fileId && file.sourceId === sourceId)) continue
        for (const row of await store.listEntries(email, { sourceId, includeUnnormalized: true, includeSuperseded: true })) {
          if (incoming.has(row.id)) previous.set(row.id, row)
        }
      }
      const { error } = await table('entries').delete().eq('email', email).eq('file_id', fileId)
      if (error) throw new Error('data_entries_write_failed')
      try {
        for (let offset = 0; offset < entries.length; offset += 1000) {
          const { error: insertError } = await table('entries').upsert(entries.slice(offset, offset + 1000).map(row => ({ ...encode(row), email })), { onConflict: 'id' })
          if (insertError) throw new Error('data_entries_write_failed')
        }
      } catch {
        // This is best-effort rollback, not a transaction: a process crash or unavailable
        // database still needs replay from originals. No failed batch publishes the file.
        const { error: deleteError } = await table('entries').delete().eq('email', email).eq('file_id', fileId)
        if (deleteError) throw new Error('data_entries_restore_failed')
        const snapshot = [...previous.values()]
        for (let offset = 0; offset < snapshot.length; offset += 1000) {
          const { error: restoreError } = await table('entries').upsert(snapshot.slice(offset, offset + 1000).map(row => ({ ...encode(row), email })), { onConflict: 'id' })
          if (restoreError) throw new Error('data_entries_restore_failed')
        }
        throw new Error('data_entries_write_failed')
      }
    },
    async listEntries(email, query = {}) {
      if (query.ids?.length === 0) return []
      const output: TimeEntry[] = [], offsetStart = query.offset ?? 0
      // Filtering via the file join avoids exposing partially written entries.
      for (let offset = offsetStart; ; offset += 1000) {
        const size = Math.min(1000, query.limit === undefined ? 1000 : query.limit - output.length)
        if (size <= 0) return output
        let request = table('entries').select(query.includeUnnormalized ? '*' : '*,closeout_files!inner(status)').eq('email', email)
        if (!query.includeUnnormalized) request = request.eq('closeout_files.status', 'normalized')
        if (!query.includeSuperseded) request = request.is('superseded_by', null)
        if (query.from) request = request.gte('work_date', query.from)
        if (query.to) request = request.lte('work_date', query.to)
        if (query.fileId) request = request.eq('file_id', query.fileId)
        if (query.sourceId) request = request.eq('source_id', query.sourceId)
        if (query.ids) request = request.in('id', query.ids)
        const { data, error } = await request.order('work_date').order('id').range(offset, offset + size - 1)
        if (error) throw new Error('data_entries_read_failed')
        output.push(...(data as unknown as Row[]).map(row => { const entry = { ...row }; delete entry.closeout_files; return decode<TimeEntry>(entry) }))
        if (data.length < size) return output
      }
    },
    async countEntries(email, fileId) {
      const { count, error } = await table('entries').select('id', { count: 'exact', head: true }).eq('email', email).eq('file_id', fileId)
      if (error) throw new Error('data_entries_read_failed')
      return count ?? 0
    },
    async supersedeEntries(email, sourceId, newFileId, workerDays) {
      if (!await store.getFile(email, newFileId) || !await store.getSource(email, sourceId)) throw new Error('file_not_found')
      const keys = new Set(workerDays.map(row => `${row.workerKey}\u001f${row.workDate}`))
      const ids = (await store.listEntries(email)).filter(row => row.sourceId === sourceId && row.fileId !== newFileId && keys.has(`${row.workerKey}\u001f${row.workDate}`)).map(row => row.id)
      // Keep PostgREST filter URLs below proxy request-line limits.
      for (let offset = 0; offset < ids.length; offset += 200) {
        const { error } = await table('entries').update({ superseded_by: newFileId }).eq('email', email).in('id', ids.slice(offset, offset + 200))
        if (error) throw new Error('data_entries_write_failed')
      }
      return ids.length
    },
    listFacts: email => all<FactRecord>('facts', email),
    async upsertFact(email, fact) {
      await store.ensureAccount(email)
      const { data, error: readError } = await table('facts').select('updated_at').eq('email', email).order('updated_at', { ascending: false }).limit(1)
      if (readError) throw new Error('data_facts_read_failed')
      const { error } = await table('facts').upsert({ ...encode(fact), updated_at: nextVersion(data?.[0]?.updated_at as string | undefined), email }, { onConflict: 'email,kind,key' })
      if (error) throw new Error('data_facts_write_failed')
    },
    async listRuns(email) { return (await all<RunRecord>('runs', email)).sort((a, b) => b.cycleId.localeCompare(a.cycleId)) },
    getRun: (email, id) => one<RunRecord>('runs', email, 'cycle_id', id),
    async deleteRun(email, cycleId) {
      const run = await store.getRun(email, cycleId)
      if (!run) return
      // Remove the published pointer before its backing rows/object, so readers
      // never discover a current run whose findings have already disappeared.
      const { error } = await table('runs').delete().eq('email', email).eq('cycle_id', cycleId).eq('run_id', run.runId)
      if (error) throw new Error('data_runs_delete_failed')
      const { error: findingsError } = await table('findings').delete().eq('email', email).eq('cycle_id', cycleId).eq('run_id', run.runId)
      if (findingsError) throw new Error('data_findings_cleanup_failed')
      const { error: objectError } = await bucket.remove([checkedPath(email, run.storagePath)])
      if (objectError) throw new Error('data_object_cleanup_failed')
    },
    async saveRun(email, run, findings, payload) {
      await store.ensureAccount(email)
      const previous = await store.getRun(email, run.cycleId)
      if (previous?.runId === run.runId) return
      await store.putObject(email, run.storagePath, gzipSync(JSON.stringify(payload)), 'application/gzip')
      for (let offset = 0; offset < findings.length; offset += 1000) {
        const rows = findings.slice(offset, offset + 1000).map(row => ({ ...encode(row), email, run_id: run.runId, cycle_id: run.cycleId }))
        const { error } = await table('findings').upsert(rows, { onConflict: 'email,run_id,shift_id,rule_id,seq' })
        if (error) throw new Error('data_findings_write_failed')
      }
      const { error } = await table('runs').upsert({ ...encode(run), email }, { onConflict: 'email,cycle_id' })
      if (error) throw new Error('data_runs_write_failed')
      if (previous) {
        const { error: cleanupError } = await table('findings').delete().eq('email', email).eq('run_id', previous.runId)
        if (cleanupError) throw new Error('data_findings_cleanup_failed')
        const { error: objectError } = await bucket.remove([checkedPath(email, previous.storagePath)])
        if (objectError) throw new Error('data_object_cleanup_failed')
      }
    },
    async getRunPayload(email, input) {
      const run = typeof input === 'string' ? await store.getRun(email, input) : input
      if (!run || (await store.getRun(email, run.cycleId))?.runId !== run.runId) return null
      const bytes = await store.getObject(email, run.storagePath)
      return bytes ? JSON.parse(gunzipSync(bytes).toString('utf8')) as CyclePayload : null
    },
    async listFindings(email, cycleId) {
      const run = await store.getRun(email, cycleId)
      if (!run) return []
      const rows: FindingCase[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await table('findings').select('*').eq('email', email).eq('cycle_id', cycleId).eq('run_id', run.runId).order('shift_id').order('rule_id').order('seq').range(offset, offset + 999)
        if (error) throw new Error('data_findings_read_failed')
        rows.push(...(data as Row[]).map(row => { const finding = { ...row }; delete finding.run_id; delete finding.cycle_id; return decode<FindingCase>(finding) }))
        if (data.length < 1000) return rows
      }
    },
    async manifest(email) {
      const [files, runs, facts] = await Promise.all([
        all<DataManifest['files'][number]>('files', email, 'id,sha256,status,normalized_at'),
        all<DataManifest['runs'][number]>('runs', email, 'cycle_id,run_id'),
        table('facts').select('updated_at').eq('email', email).order('updated_at', { ascending: false }).limit(1),
      ])
      if (facts.error) throw new Error('data_facts_read_failed')
      return { files, runs, factsUpdatedAt: facts.data?.[0]?.updated_at as string | undefined ?? null }
    },
    async putObject(email, path, bytes, mime = 'application/octet-stream') {
      const { error } = await bucket.upload(checkedPath(email, path), bytes, { contentType: mime, upsert: true })
      if (error) throw new Error('data_object_write_failed')
    },
    async getObject(email, path) {
      const { data, error } = await bucket.download(checkedPath(email, path))
      if (error) {
        if ('statusCode' in error && [400, 404].includes(Number(error.statusCode))) return null
        throw new Error('data_object_read_failed')
      }
      return Buffer.from(await data.arrayBuffer())
    },
    async deleteSample(email) {
      const [files, runs] = await Promise.all([store.listFiles(email), store.listRuns(email)])
      const paths = [...files.filter(row => row.sample).map(row => row.storagePath), ...runs.filter(row => row.sample).map(row => row.storagePath)]
      for (const run of runs.filter(row => row.sample)) {
        const { error } = await table('findings').delete().eq('email', email).eq('run_id', run.runId)
        if (error) throw new Error('data_sample_delete_failed')
      }
      for (const name of ['runs', 'entries', 'files', 'sources', 'facts']) {
        const { error } = await table(name).delete().eq('email', email).eq('sample', true)
        if (error) throw new Error('data_sample_delete_failed')
      }
      const remainingFact = (await store.listFacts(email)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      if (remainingFact) await store.upsertFact(email, remainingFact)
      const deletedFiles = files.filter(row => row.sample).map(row => row.id)
      if (deletedFiles.length) {
        const { error } = await table('entries').update({ superseded_by: null }).eq('email', email).in('superseded_by', deletedFiles)
        if (error) throw new Error('data_sample_delete_failed')
      }
      for (let offset = 0; offset < paths.length; offset += 1000) {
        const { error } = await bucket.remove(paths.slice(offset, offset + 1000).map(path => checkedPath(email, path)))
        if (error) throw new Error('data_object_cleanup_failed')
      }
    },
    async listChat(email) {
      const { data, error } = await table('chat').select('id,role,text,at,scope,cards,context').eq('email', email)
        .order('at', { ascending: false }).limit(CHAT_HISTORY_LIMIT)
      if (error) throw new Error('data_chat_read_failed')
      return (data as Row[]).reverse().map(row => ({
        id: String(row.id).replace(new RegExp(`^${accountHash(email)}:`), ''), role: row.role === 'user' ? 'user' : 'agent', text: String(row.text ?? ''), at: Date.parse(String(row.at)),
        ...(typeof row.scope === 'string' ? { scope: row.scope } : {}), ...(Array.isArray(row.cards) ? { cards: row.cards } : {}),
        ...(row.context && typeof row.context === 'object' ? { context: row.context as Record<string, unknown> } : {}),
      }))
    },
    async appendChat(email, messages) {
      if (!messages.length) return
      await store.ensureAccount(email)
      // The table has a global text primary key. Namespace client ids so two accounts
      // can append the same local id without suppressing each other's transcript.
      const { error } = await table('chat').upsert(messages.map(message => ({ id: `${accountHash(email)}:${message.id}`, email, role: message.role, text: message.text,
        at: new Date(message.at).toISOString(), scope: message.scope ?? null, cards: message.cards ?? null, context: message.context ?? null })),
      { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error('data_chat_write_failed')
    },
  }
  return store
}

export function dataStoreFromEnv(env: NodeJS.ProcessEnv): DataStore {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('data_unavailable')
  return createDataStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }))
}

export type FactValidation = { ok: true; fact: Pick<FactRecord, 'kind' | 'key' | 'value'> } | { ok: false; errors: string[] }
const states = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '))
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const timezones = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }

/** Shared by fact cards now and the agent's set_fact action in session B. */
export function validateFact(input: unknown): FactValidation {
  const errors: string[] = []
  if (!record(input)) return { ok: false, errors: ['A fact must be an object'] }
  const { kind, key, value } = input
  if (Object.keys(input).some(name => !['kind', 'key', 'value'].includes(name))) errors.push('Unknown fact field')
  if (typeof key !== 'string' || !key.trim() || key.length > 200 || [...key].some(char => char.charCodeAt(0) < 32)) errors.push('key must be a nonempty string up to 200 characters')
  if (!record(value)) return { ok: false, errors: [...errors, 'value must be an object'] }
  function shape(allowed: string[], required: string[]) {
    if (Object.keys(value as Row).some(name => !allowed.includes(name))) errors.push('Unknown value field')
    for (const name of required) if (!(name in (value as Row)) || (value as Row)[name] === undefined) errors.push(`${name} is required`)
  }
  function number(name: string, minimum: number, maximum: number) {
    const candidate = (value as Row)[name]
    if (candidate !== undefined && (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < minimum || candidate > maximum)) errors.push(`${name} must be a finite number from ${minimum} to ${maximum}`)
  }
  function string(name: string, max = 200) {
    const candidate = (value as Row)[name]
    if (candidate !== undefined && (typeof candidate !== 'string' || !candidate.trim() || candidate.length > max)) errors.push(`${name} must be a nonempty string up to ${max} characters`)
  }
  switch (kind) {
    case 'site':
      shape(['state', 'city', 'tz', 'minWage', 'vertical', 'autoDeduct', 'lat', 'lng', 'supervisor'], ['state'])
      if (typeof value.state !== 'string' || !states.has(value.state)) errors.push('state must be a US two-letter state code')
      string('city'); string('vertical', 80)
      if (value.tz !== undefined && (typeof value.tz !== 'string' || !timezones.has(value.tz))) errors.push('tz must be an IANA time zone')
      number('minWage', 0, 1000); number('lat', -90, 90); number('lng', -180, 180)
      if (value.autoDeduct !== undefined && typeof value.autoDeduct !== 'boolean') errors.push('autoDeduct must be a boolean')
      if (value.supervisor !== undefined && (!record(value.supervisor) || Object.keys(value.supervisor).some(name => !['name', 'role'].includes(name)) || typeof value.supervisor.name !== 'string' || !value.supervisor.name.trim() || value.supervisor.name.length > 200 || (value.supervisor.role !== undefined && (typeof value.supervisor.role !== 'string' || value.supervisor.role.length > 200)))) errors.push('supervisor requires name and an optional role')
      break
    case 'rate':
      shape(['pay', 'bill'], ['pay']); number('pay', 0, 1000); number('bill', 0, 2000)
      if (typeof key === 'string' && !/^(?:w:.+|.+\|.+)$/.test(key)) errors.push('rate key must be site|role, site|*, or w:workerKey')
      break
    case 'differential':
      shape(['perHour', 'payCode'], ['perHour']); number('perHour', 0, 1000); string('payCode', 80)
      break
    case 'alias':
      shape(['workerKey'], ['workerKey']); string('workerKey')
      if (typeof key === 'string' && !/^.+\|.+$/.test(key)) errors.push('alias key must be sourceId|externalId-or-name')
      break
    case 'account':
      shape(['value'], ['value'])
      if (key === 'burden') number('value', 0, 5)
      else if (key === 'offCycleCost') number('value', 0, 100000)
      else if (key === 'workweekStart') { if (typeof value.value !== 'string' || !weekdays.includes(value.value)) errors.push('workweekStart must be a weekday name') }
      else if (key === 'timezone') { if (typeof value.value !== 'string' || !timezones.has(value.value)) errors.push('timezone must be an IANA time zone') }
      else errors.push('Unknown account fact key')
      break
    default: errors.push('Unknown fact kind')
  }
  return errors.length ? { ok: false, errors } : { ok: true, fact: { kind: kind as FactKind, key: key as string, value: clone(value) } }
}
