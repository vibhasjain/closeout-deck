import { createHash, randomBytes } from 'node:crypto'
import { recentCycles } from '../../src/lib/cycles.ts'
import type { Cycle } from '../../src/lib/cycles.ts'
import { accountHash, DuplicateFileError, validateFact } from './datastore.ts'
import type { DataStore, FactRecord, FileRecord, SourceRecord } from './datastore.ts'
import { libraryMapping, normalize, parseFile, sanitizeFileName, validateMapping, inferPeriod } from './ingest.ts'
import type { MappingSpec, NormalizeMeta, TimeEntry } from './ingest.ts'
import { buildCycle, calendarFrom, engineSha, GENERIC_SYSTEM, pipelineInputHash } from './pipeline.ts'
import { generateSample } from './sampledata.ts'

export class DataError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
// An empty week publishes no run, so without this every read reloads all entries to rebuild it.
// Keyed by input hash like the runs: in-process first, then closeout_empty_cycles, so a deploy does not rebuild either.
// Exported so a test can clear it, as a restart does.
export const emptyCycles = new Map<string, string>()
// Every ingest holds the account's data lock from 'received' to its final status, so a 'received' file
// seen by another ingest was left by one that failed: it is ingested again under its own id, never reused.
const interrupted = (file: FileRecord | null) => file?.status === 'received'
/** A connection succeeds only when its time entries are in; otherwise the card shows an error it can retry. */
function connected<T extends { status: FileRecord['status'] }>(file: T): T {
  if (file.status !== 'normalized') throw new DataError(500, 'connect_incomplete')
  return file
}
export const dateKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Account-local civil date; calendar arithmetic never depends on the host's UTC date. */
export function localToday(facts: FactRecord[], doc: Record<string, unknown>, now = new Date()): Date {
  const tz = facts.find(f => f.kind === 'account' && f.key === 'timezone')?.value.value ?? doc.timezone ?? 'America/New_York'
  let date: string
  try { date = new Intl.DateTimeFormat('en-CA', { timeZone: String(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).format(now) }
  catch { throw new DataError(400, 'invalid_timezone') }
  return new Date(`${date}T00:00:00`)
}

export function normalizationContext(file: FileRecord, facts: FactRecord[], doc: Record<string, unknown> = {}): NormalizeMeta {
  return {
    fileId: file.id, sourceId: file.sourceId ?? '', sample: file.sample,
    timezone: String(facts.find(f => f.kind === 'account' && f.key === 'timezone')?.value.value ?? doc.timezone ?? 'America/New_York'),
    siteTimezones: Object.fromEntries(facts.filter(f => f.kind === 'site' && f.value.tz).map(f => [f.key, String(f.value.tz)])),
    aliases: Object.fromEntries(facts.filter(f => f.kind === 'alias').map(f => [f.key, String(f.value.workerKey)])),
  }
}

export interface UploadOptions {
  name: string; bytes: Uint8Array; set?: 1 | 2 | 3; sample?: boolean; method?: 'upload' | 'simulated'
  system?: string; site?: string; deferRun?: boolean
}

export function mappingForFile(spec: MappingSpec, file: FileRecord, source?: SourceRecord): MappingSpec {
  return { ...spec, file: file.id, period: file.periodEnd ? { end: file.periodEnd } : undefined,
    source: { ...spec.source, ...(source ? { system: source.system } : {}), ...(source?.site ? { site: source.site } : {}) } }
}

/** Coordinates publication: originals first, normalized entries next, current run pointer last. */
export class DataService {
  constructor(readonly store: DataStore) {}

  async ingestFile(email: string, input: UploadOptions, doc: Record<string, unknown> = {}, now = new Date()) {
    if (!input.bytes.length) throw new DataError(400, 'empty_file')
    if (input.bytes.length > 10 * 1024 * 1024) throw new DataError(413, 'file_too_large')
    const name = sanitizeFileName(input.name), sha256 = hash(input.bytes)
    const prior = await this.store.getFileBySha(email, sha256)
    if (prior && !interrupted(prior)) throw new DuplicateFileError(prior.id)
    const parsed = parseFile(input.bytes, name)
    const id = prior?.id ?? 'f_' + Array.from(randomBytes(12), b => 'abcdefghijklmnopqrstuvwxyz234567'[b % 32]).join('')
    let receivedAt = now.toISOString()
    const facts = await this.store.listFacts(email)
    const storedMapping = parsed.fingerprint ? await this.store.getMapping(email, parsed.fingerprint) : null
    let mapping = storedMapping?.spec ?? libraryMapping(parsed, name, id)
    let layout = mapping
    if (mapping) {
      mapping = { ...mapping, file: id }
      // The period belongs to this export, never to the cached layout's first file.
      const period = inferPeriod(name)
      mapping = { ...mapping, period }
      // The cached layout stays site-agnostic: a connection's site lives on its source and replays via mappingForFile.
      layout = mapping
      if (input.site) mapping = { ...mapping, source: { ...mapping.source, site: input.site } }
      if (input.system) mapping = { ...mapping, source: { ...mapping.source, system: input.system } }
    }
    const set = input.set ?? mapping?.set ?? null
    const system = mapping?.source.system ?? input.system ?? 'Spreadsheet'
    const site = mapping?.source.site ?? input.site ?? null
    const sourceId = set ? 'src_' + hash(`${email}|${set}|${system}|${site ?? ''}`).slice(0, 12) : null
    const file: FileRecord = {
      id, sourceId, mappingId: null, name, mime: parsed.mime, bytes: input.bytes.length, sha256,
      storagePath: `${accountHash(email)}/files/${id}/${name}`,
      status: parsed.kind === 'pdf' ? 'needs_extraction' : !parsed.headerRow ? 'rejected' : 'received',
      fingerprint: parsed.fingerprint, setHint: input.set ?? null, periodEnd: mapping?.period?.end ?? null,
      firstDate: null, lastDate: null, rowCount: null, entryCount: null, unparsed: [],
      sample: input.sample ?? false, receivedAt, normalizedAt: null,
    }
    await this.store.ensureAccount(email)
    if (sourceId && set) {
      const source = await this.store.getSource(email, sourceId)
      if (source?.lastReceivedAt) receivedAt = new Date(Math.max(now.getTime(), Date.parse(source.lastReceivedAt) + 1)).toISOString()
      file.receivedAt = receivedAt
      await this.store.upsertSource(email, { id: sourceId, set, system, site,
        method: input.method ?? 'upload', sample: source ? source.sample && file.sample : file.sample,
        createdAt: source?.createdAt ?? receivedAt, lastReceivedAt: receivedAt })
    }
    await this.store.putObject(email, file.storagePath, input.bytes, file.mime)
    await this.store.upsertFile(email, file)
    let replaced = 0
    if (file.status === 'received' && mapping && file.fingerprint) {
      const meta = { ...normalizationContext(file, facts, doc), name, status: 'needs_mapping', setHint: input.set,
        method: input.method ?? 'upload', sheets: parsed.sheets.map(s => s.name), today: dateKey(localToday(facts, doc, now)) }
      const grid = parsed.sheets.find(s => s.name === mapping.sheet)?.grid ?? parsed.grid
      const validation = validateMapping(mapping, grid, meta)
      if (!validation.ok) {
        file.status = 'needs_mapping'
        file.unparsed = validation.errors.slice(0, 200).map(reason => ({ row: 0, reason }))
      } else {
        const result = validation.result ?? normalize(grid, mapping, meta)
        const mappingId = storedMapping?.id ?? 'map_' + hash(`${email}|${file.fingerprint}`).slice(0, 16)
        await this.store.upsertMapping(email, { id: mappingId, fingerprint: file.fingerprint, spec: layout!,
          author: storedMapping?.author ?? 'library', version: storedMapping?.version ?? 1, updatedAt: storedMapping?.updatedAt ?? receivedAt })
        file.mappingId = mappingId
        // Same-source exports replace whole worker-days; other sources can reveal duplicate submissions.
        // Only same-set entries on this file's dates can match, so only those are read.
        const dates = result.entries.map(e => e.workDate).sort()
        const existing = dates.length ? await this.store.listEntries(email, { set: set ?? undefined, from: dates[0], to: dates.at(-1) }) : []
        const seen = new Map(existing.filter(e => e.sourceId !== sourceId && e.set === set && !e.dupOf)
          .map(e => [entryIdentity(e), e.id]))
        for (const e of result.entries) if (!e.dupOf && e.kind === 'work') e.dupOf = seen.get(entryIdentity(e)) ?? null
        await this.store.replaceEntries(email, id, result.entries)
        replaced = await this.store.supersedeEntries(email, sourceId!, id, result.entries.map(e => ({ workerKey: e.workerKey, workDate: e.workDate })))
        Object.assign(file, { status: 'normalized', rowCount: result.rowCount, entryCount: result.entries.length,
          unparsed: result.unparsed.slice(0, 200), firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, normalizedAt: receivedAt })
      }
    } else if (file.status === 'received') file.status = 'needs_mapping'
    await this.store.upsertFile(email, file)
    const cycles = input.deferRun ? [] : await this.recompute(email, doc, now)
    const runs = cycles.length ? await this.store.listRuns(email) : []
    return { ...file, mappingAuthor: file.mappingId ? storedMapping?.author ?? 'library' : null, set, rows: file.rowCount, entries: file.entryCount, replaced, cycles,
      gaps: runs.filter(r => cycles.includes(r.cycleId)).flatMap(r => r.gaps) }
  }

  async renormalizeOriginals(email: string, doc: Record<string, unknown> = {}, now = new Date(), pending: string[] = []): Promise<void> {
    const [files, mappings, facts, sources] = await Promise.all([this.store.listFiles(email), this.store.listMappings(email), this.store.listFacts(email), this.store.listSources(email)])
    const ordered = []
    for (const file of files.filter(f => f.status === 'normalized' || pending.includes(f.id)).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
      const mapping = mappings.find(m => m.id === file.mappingId)
      const bytes = await this.store.getObject(email, file.storagePath)
      if (!mapping || !bytes || hash(bytes) !== file.sha256) throw new DataError(500, 'original_unavailable')
      const parsed = parseFile(bytes, file.name)
      const grid = parsed.sheets.find(s => s.name === mapping.spec.sheet)?.grid ?? parsed.grid
      const result = normalize(grid, mappingForFile(mapping.spec, file, sources.find(s => s.id === file.sourceId)), normalizationContext(file, facts, doc))
      ordered.push({ file, result, fileId: file.id, entries: result.entries })
    }
    applyEntryVersions(ordered)
    for (const { file, result } of ordered) {
      await this.store.replaceEntries(email, file.id, result.entries)
      const dates = result.entries.map(e => e.workDate).sort()
      await this.store.upsertFile(email, { ...file, status: 'normalized', firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null,
        rowCount: result.rowCount, entryCount: result.entries.length, unparsed: result.unparsed.slice(0, 200),
        normalizedAt: new Date(Math.max(now.getTime(), Date.parse(file.normalizedAt ?? '1970-01-01') + 1)).toISOString() })
    }
  }

  /** Compile once, validate every affected original before publishing, and replay re-exports in order. */
  async applyAgentMapping(email: string, fileId: string, raw: unknown, doc: Record<string, unknown> = {}, now = new Date()) {
    const target = await this.store.getFile(email, fileId)
    if (!target || target.status !== 'needs_mapping' || !target.fingerprint) return { ok: false as const, errors: ['File is not awaiting a mapping'] }
    const [files, facts, sources] = await Promise.all([this.store.listFiles(email), this.store.listFacts(email), this.store.listSources(email)])
    const prepared = []
    for (const file of files.filter(f => f.fingerprint === target.fingerprint && ['needs_mapping', 'normalized'].includes(f.status))) {
      const bytes = await this.store.getObject(email, file.storagePath)
      if (!bytes || hash(bytes) !== file.sha256) throw new DataError(500, 'original_unavailable')
      const parsed = parseFile(bytes, file.name), source = sources.find(s => s.id === file.sourceId)
      const candidate = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw as Record<string, unknown> } : raw
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && file.id !== fileId) {
        Object.assign(candidate, { file: file.id, period: file.periodEnd ? { end: file.periodEnd } : inferPeriod(file.name) })
        if (source && (candidate as MappingSpec).source) (candidate as MappingSpec).source = {
          ...(candidate as MappingSpec).source, ...(source.system !== 'Spreadsheet' ? { system: source.system } : {}), ...(source.site ? { site: source.site } : {}),
        }
        if ((candidate as MappingSpec).period === undefined) delete (candidate as MappingSpec).period
      }
      const sheet = candidate && typeof candidate === 'object' ? (candidate as MappingSpec).sheet : undefined
      const grid = parsed.sheets.find(s => s.name === sheet)?.grid ?? parsed.grid
      const checked = validateMapping(candidate, grid, { ...normalizationContext(file, facts, doc), status: 'needs_mapping', name: file.name,
        setHint: file.setHint, method: source?.method ?? 'upload', sheets: parsed.sheets.map(s => s.name), today: dateKey(localToday(facts, doc, now)) })
      if (!checked.ok || !checked.spec) return { ok: false as const, errors: checked.errors.map(error => `${file.name}: ${error}`) }
      const spec = checked.spec
      const sourceId = file.sourceId ?? 'src_' + hash(`${email}|${spec.set}|${spec.source.system}|${spec.source.site ?? ''}`).slice(0, 12)
      prepared.push({ file, source, sourceId, spec })
    }
    const old = await this.store.getMapping(email, target.fingerprint)
    const mappingId = old?.id ?? 'map_' + hash(`${email}|${target.fingerprint}`).slice(0, 16)
    await this.store.upsertMapping(email, { id: mappingId, fingerprint: target.fingerprint, spec: prepared.find(p => p.file.id === fileId)!.spec,
      author: 'agent', version: (old?.version ?? 0) + 1, updatedAt: now.toISOString() })
    for (const { file, source, sourceId, spec } of prepared) {
      await this.store.upsertSource(email, { id: sourceId, set: spec.set, system: source?.system && source.system !== 'Spreadsheet' ? source.system : spec.source.system,
        site: source?.site ?? spec.source.site ?? null, method: source?.method ?? 'upload', sample: source ? source.sample && file.sample : file.sample,
        createdAt: source?.createdAt ?? file.receivedAt, lastReceivedAt: source?.lastReceivedAt ?? file.receivedAt })
      await this.store.upsertFile(email, { ...file, sourceId, mappingId, periodEnd: spec.period?.end ?? null, status: 'received' })
    }
    await this.renormalizeOriginals(email, doc, now, prepared.map(p => p.file.id))
    const cycles = await this.recompute(email, doc, now), saved = await this.store.getFile(email, fileId)
    const runs = await this.store.listRuns(email)
    return { ok: true as const, fileId, status: 'normalized' as const, entries: saved!.entryCount ?? 0, unparsed: saved!.unparsed.length,
      cycles, gaps: runs.filter(run => cycles.includes(run.cycleId)).flatMap(run => run.gaps) }
  }

  async recompute(email: string, doc: Record<string, unknown> = {}, now = new Date()): Promise<string[]> {
    const [files, facts, sources, prior] = await Promise.all([
      this.store.listFiles(email), this.store.listFacts(email), this.store.listSources(email),
      this.store.listRuns(email),
    ])
    const calendar = calendarFrom(doc)
    const today = localToday(facts, doc, now)
    // Include valid future exports as well as the 400-day ingestion lookback, retaining the biweekly anchor.
    const maxDate = files.reduce((max, file) => file.lastDate && file.lastDate > max ? file.lastDate : max, dateKey(today))
    const futureDays = Math.max(0, Math.round((Date.parse(maxDate) - Date.parse(dateKey(today))) / 86_400_000))
    const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Math.ceil(futureDays / 14) * 14)
    const cycles = recentCycles(calendar, 130, horizon)
    const current = recentCycles(calendar, 2, today)
    for (const cycle of cycles) cycle.status = cycle.end >= today ? 'in-progress' : cycle.id === current[1].id ? 'needs-review' : 'reviewed'
    for (const run of prior) if (!cycles.some(c => c.id === run.cycleId)) await this.store.deleteRun(email, run.cycleId)
    const ids: string[] = []
    let entries: TimeEntry[] | undefined, stored: Record<string, string> | undefined
    for (const cycle of cycles) {
      const start = dateKey(cycle.start), end = dateKey(cycle.end)
      if (!files.some(f => f.status === 'normalized' && f.firstDate && f.lastDate && f.firstDate <= end && f.lastDate >= start) && !prior.some(r => r.cycleId === cycle.id)) continue
      const old = prior.find(r => r.cycleId === cycle.id), emptyKey = `${email}|${cycle.id}`
      const inputHash = pipelineInputHash({ cycle, calendar, files, facts, engineSha, timezone: typeof doc.timezone === 'string' ? doc.timezone : undefined })
      if ((old ? old.inputHash : emptyCycles.get(emptyKey)) === inputHash) continue
      if (!old) {
        stored ??= await this.store.listEmptyCycles(email)
        if (stored[cycle.id] === inputHash) { remember(emptyKey, inputHash); continue }
      }
      entries ??= await this.store.listEntries(email)
      const built = buildCycle({ email, cycle, calendar, entries, files, facts, sources, engineSha, now, timezone: typeof doc.timezone === 'string' ? doc.timezone : undefined })
      const { payload } = built
      if (!payload.week.length) {
        if (old) await this.store.deleteRun(email, cycle.id)
        await this.store.setEmptyCycle(email, cycle.id, inputHash)
        remember(emptyKey, inputHash)
        continue
      }
      await this.store.saveRun(email, { cycleId: cycle.id, runId: payload.runId, periodStart: start,
        inputHash: built.inputHash, storagePath: `${accountHash(email)}/runs/${cycle.id}/${payload.runId}.json.gz`,
        totals: payload.totals, counts: payload.counts, groups: payload.groups, gaps: payload.gaps,
        sample: payload.sample, runAt: payload.runAt }, built.findings, payload)
      ids.push(cycle.id)
    }
    return ids
  }

  async seed(email: string, doc: Record<string, unknown> = {}, now = new Date()) {
    const facts = await this.store.listFacts(email)
    const calendar = calendarFrom(doc)
    const cycle = recentCycles({ ...calendar, frequency: 'Weekly' }, 2, localToday(facts, doc, now))[1]
    const generated = generateSample(cycle)
    await this.store.ensureAccount(email)
    for (const fact of generated.facts) {
      if (!facts.some(f => f.kind === fact.kind && f.key === fact.key)) {
        const checked = validateFact(fact)
        if (!checked.ok) throw new DataError(400, 'invalid_sample_fact')
        await this.store.upsertFact(email, { ...checked.fact, source: 'sample', sample: true, updatedAt: now.toISOString() })
      }
    }
    for (const file of generated.files) {
      if (await this.storedFile(email, file.bytes)) continue
      await this.ingestFile(email, { ...file, sample: true, method: 'simulated', deferRun: true }, doc, now)
    }
    await this.recompute(email, doc, now)
    const files = (await this.store.listFiles(email)).filter(f => f.sample)
    const payCycle = recentCycles(calendar, 64, localToday(facts, doc, now)).find(c => c.start <= cycle.end && c.end >= cycle.end) ?? cycle
    const run = await this.store.getRun(email, payCycle.id)
    return { cycleId: payCycle.id, files: files.map(f => f.id), entries: files.reduce((n, f) => n + (f.entryCount ?? 0), 0), groups: run?.groups ?? [] }
  }

  async setFact(email: string, body: unknown, doc: Record<string, unknown> = {}, now = new Date(), source: 'user' | 'agent' = 'user') {
    const checked = validateFact(body)
    if (!checked.ok) throw new DataError(400, 'invalid_fact')
    await this.store.ensureAccount(email)
    const facts = await this.store.listFacts(email), prior = facts.find(f => f.kind === checked.fact.kind && f.key === checked.fact.key)
    const fact: FactRecord = { ...checked.fact, value: { ...prior?.value, ...checked.fact.value }, source, sample: false, updatedAt: now.toISOString() }
    await this.store.upsertFact(email, fact)
    // Normalized entries depend on facts only through time zones and aliases; any other fact (a supervisor,
    // a state, a rate) leaves them as they are, so replaying every original would only hold the data lock.
    const shape = (list: FactRecord[]) => JSON.stringify(normalizationContext({ id: '', sourceId: null, sample: false } as FileRecord, list, doc))
    if (shape(facts) !== shape(prior ? facts.map(f => f === prior ? fact : f) : [...facts, fact])) await this.renormalizeOriginals(email, doc, now)
    return { ok: true, cycles: await this.recompute(email, doc, now) }
  }

  async connect(email: string, body: Record<string, unknown>, doc: Record<string, unknown> = {}, now = new Date()) {
    const set = body.set
    if (set !== 1 && set !== 2 && set !== 3) throw new DataError(400, 'invalid_set')
    if (body.system !== undefined && (typeof body.system !== 'string' || !body.system.trim() || body.system.length > 80)) throw new DataError(400, 'invalid_system')
    if (body.site !== undefined && (typeof body.site !== 'string' || !body.site.trim() || body.site.length > 200)) throw new DataError(400, 'invalid_site')
    const facts = await this.store.listFacts(email), calendar = calendarFrom(doc)
    const cycles = recentCycles(calendar, 2, localToday(facts, doc, now))
    if (set !== 3) {
      await this.store.ensureAccount(email)
      const generated = generateSample(cycles[1])
      const systemKey = /\b(adp|ukg|bullhorn)\b/i.exec(String(body.system ?? ''))?.[1].toLowerCase()
      const matching = generated.files.filter(f => f.set === set && systemKey && f.name.toLowerCase().startsWith(systemKey))
      const selected = matching.length ? matching : [generated.files.find(f => f.set === set && (set === 1 || f.name.startsWith(String(body.site ?? '').toLowerCase().includes('lonestar') ? 'adp' : 'ukg')))!]
      for (const fact of generated.facts) if (!facts.some(f => f.kind === fact.kind && f.key === fact.key)) {
        const checked = validateFact(fact)
        if (checked.ok) await this.store.upsertFact(email, { ...checked.fact, source: 'sample', sample: true, updatedAt: now.toISOString() })
      }
      const files = []
      for (const input of selected) {
        // A simulated sheet/inbox has this source's sample shape and its own identity.
        const parsed = parseFile(input.bytes, input.name), grid = parsed.grid
        const siteColumn = grid[0].findIndex(h => h === 'Client')
        let rows = grid.slice(1)
        if (body.site && siteColumn >= 0) {
          const exact = rows.filter(row => row[siteColumn] === body.site)
          rows = (exact.length ? exact : rows.filter(row => row[siteColumn] === rows[0]?.[siteColumn])).map(row => row.map((cell, i) => i === siteColumn ? String(body.site) : cell))
        }
        // A harmless skipped footer names the source, the vendor and its client, so another connector gets its own upload hash
        // while a repeat of the same source (ADP from the card, then ADP Workforce Now in Settings) hashes the same and returns its file.
        const layout = libraryMapping(parsed, input.name, '')
        const vendor = typeof body.system === 'string' && !GENERIC_SYSTEM.test(body.system) && !systemKey ? body.system : layout?.source.system ?? 'connection'
        const bytes = Buffer.from([grid[0], ...rows, [`Total: Sample ${vendor} ${String(body.site ?? layout?.source.site ?? '')}`]].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n')
        const existing = await this.storedFile(email, bytes)
        if (existing) { files.push(connected(existing)); continue }
        // A generic label ("Time entries") is not a system; the sample file's own vendor names the source.
        files.push(connected(await this.ingestFile(email, { ...input, bytes, system: typeof body.system === 'string' && !GENERIC_SYSTEM.test(body.system) ? body.system : undefined,
          site: typeof body.site === 'string' ? body.site : undefined, sample: true, method: 'simulated', deferRun: true }, doc, now)))
      }
      return { files, cycles: await this.recompute(email, doc, now) }
    }
    const entries = await this.store.listEntries(email, { from: dateKey(cycles[1].start), to: dateKey(cycles[0].end) })
    const groups = new Map<string, TimeEntry[]>()
    for (const entry of entries) {
      if (entry.set === 3 || entry.kind !== 'work' || entry.dupOf || entry.start == null || entry.end == null || (body.site && entry.site !== body.site)) continue
      const key = `${entry.workerKey}|${entry.siteKey}|${entry.workDate}`
      groups.set(key, [...groups.get(key) ?? [], entry])
    }
    const rows = [['Worker', 'Site', 'Date', 'Entered', 'Exited']]
    const clock = (_date: string, minute: number) => { const m = ((minute % 1440) + 1440) % 1440, h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
    for (const [key, all] of groups) {
      const chosen = all.some(e => e.set === 2) ? all.filter(e => e.set === 2) : all
      const jitter = parseInt(hash(key).slice(0, 8), 16)
      rows.push([chosen[0].worker, chosen[0].site, chosen[0].workDate.slice(5, 7) + '/' + chosen[0].workDate.slice(8, 10) + '/' + chosen[0].workDate.slice(0, 4),
        clock(chosen[0].workDate, Math.min(...chosen.map(e => e.start!)) - 3 - jitter % 6),
        clock(chosen[0].workDate, Math.max(...chosen.map(e => e.end!)) + 2 + jitter % 5)])
    }
    if (rows.length === 1) return { files: [], cycles: [] }
    const bytes = Buffer.from(rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n')
    const existing = await this.storedFile(email, bytes)
    if (existing) return { files: [connected(existing)], cycles: [] }
    // The file name states its period; it must be the week its last row falls in, or ingest rejects the period.
    const last = rows.slice(1).map(row => `${row[2].slice(6)}-${row[2].slice(0, 2)}-${row[2].slice(3, 5)}`).sort().at(-1)!
    const period = last >= dateKey(cycles[0].start) ? cycles[0] : cycles[1]
    const file = connected(await this.ingestFile(email, { name: `hypertrack_location_${period.id}.csv`, bytes, set: 3, sample: true, method: 'simulated' }, doc, now))
    return { files: [file], cycles: file.cycles }
  }

  /** The stored file with these bytes, unless an interrupted ingest left it behind. */
  private async storedFile(email: string, bytes: Uint8Array): Promise<FileRecord | null> {
    const file = await this.store.getFileBySha(email, hash(bytes))
    return interrupted(file) ? null : file
  }
}

function remember(key: string, inputHash: string): void {
  emptyCycles.set(key, inputHash)
  if (emptyCycles.size > 4096) emptyCycles.delete(emptyCycles.keys().next().value!)
}
function entryIdentity(e: TimeEntry) { return `${e.workerKey}|${e.siteKey}|${e.workDate}|${e.start}|${e.end}|${e.kind}` }
function csvCell(value: string): string { return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value }
export function cycleDates(cycle: Cycle) {
  return { id: cycle.id, start: dateKey(cycle.start), end: dateKey(cycle.end), cutoff: dateKey(cycle.cutoff),
    deadline: dateKey(cycle.deadline), payDate: dateKey(cycle.payDate), status: cycle.status }
}

/** Replay source exports and cross-source duplicates identically for the store and its disk cache. */
export function applyEntryVersions(ordered: { fileId: string; entries: TimeEntry[] }[]): void {
  const days = new Map<string, TimeEntry[]>()
  for (const file of ordered) {
    const next = new Map<string, TimeEntry[]>()
    for (const entry of file.entries) {
      const key = `${entry.sourceId}|${entry.workerKey}|${entry.workDate}`
      const list = next.get(key) ?? []; list.push(entry); next.set(key, list)
    }
    for (const [key, entries] of next) {
      for (const old of days.get(key) ?? []) old.supersededBy = file.fileId
      days.set(key, entries)
    }
  }
  const seen = new Map<string, TimeEntry>()
  for (const { entries } of ordered) for (const entry of entries) {
    if (entry.supersededBy || entry.kind !== 'work') continue
    const key = `${entry.set}|${entryIdentity(entry)}`, first = seen.get(key)
    if (first && first.sourceId !== entry.sourceId && !entry.dupOf) entry.dupOf = first.id
    if (!entry.dupOf) seen.set(key, entry)
  }
}
