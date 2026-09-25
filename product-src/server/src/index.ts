import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { authenticate, AuthError, InviteOnlyError, isAllowedEmail, signSession, validateSessionSecret, verifyGoogleIdToken } from './auth.ts'
import { AGENT_ERROR, getClaudeVersion, runClaude } from './claude.ts'
import { systemPrompt, onboardPrompt, ingestPrompt, livePrompt, scribePrompt, delegatePrompt, consolidatePrompt, withMemory } from './prompts.ts'
import { runDataTurn, scribeOutput, spokenAnswer } from './agentTurn.ts'
import { createLiveSession, LiveSessions, LiveUpstreamError, validateCallEnd, validateLiveBody, validateSdp, VOICE_ERROR } from './live.ts'
import { createDictation, DictateUpstreamError, DICTATE_ERROR } from './dictate.ts'
import { FirmError, FirmReader, extractFirm, firmCacheFromEnv } from './firm.ts'
import { GlobalSemaphore, KeyedMutex, QueueFullError, TurnRateLimit, UserQueue } from './queue.ts'
import { stateStoreFromEnv } from './state.ts'
import type { StateStore } from './state.ts'
import { CALL_ID, chatMessage, isPlainObject, MAX_DOC_BYTES, validateChatBody, validateChatHistory, validateStateBody, ValidationError } from './validation.ts'
import type { ChatMode } from './validation.ts'
import { prepareWorkspace, materialize, materializeTurn, writeCallFile } from './workspace.ts'
import { DataError, DataService, cycleDates, dateKey, localToday } from './data.ts'
import { handleJourney } from './journeyRoutes.ts'
import { createMemoryJourneyStore, journeyStoreFromEnv } from './journeyStore.ts'
import type { JourneyStore } from './journeyStore.ts'
import { dataStoreFromEnv, DuplicateFileError, createMemoryDataStore } from './datastore.ts'
import type { DataStore } from './datastore.ts'
import { calendarFrom, engineSha } from './pipeline.ts'
import { createMemory, handleMemory, MEMORY_TIMEOUT_MS } from './memory.ts'
import { createMemoryMemoryStore, memoryStoreFromEnv } from './memoryStore.ts'
import type { MemoryStore } from './memoryStore.ts'
import { parseFile, IngestError } from './ingest.ts'
import { recentCycles } from '../../src/lib/cycles.ts'
import { inboxAddress } from '../../src/lib/inbox.ts'

const ALLOWED_ORIGINS = new Set(['https://closeoutcopilot.com', 'http://localhost:9000'])

export function listenHost(env: NodeJS.ProcessEnv): string {
  return env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'
}

export const MODE_TIMEOUTS = { chat: 180_000, onboard: 180_000, ingest: 300_000, firm: 60_000, scribe: 45_000, delegate: 180_000, consolidate: 120_000, memory: MEMORY_TIMEOUT_MS } as const
export function turnTimeoutMs(mode: ChatMode | 'firm' | 'memory', env: NodeJS.ProcessEnv): number {
  const configured = Number(env[`CLOSEOUT_${mode.toUpperCase()}_TIMEOUT_MS`])
  return Number.isFinite(configured) && configured > 0 ? configured : MODE_TIMEOUTS[mode]
}

function logFailure(error: unknown): void {
  console.error('Request failed:', error instanceof Error ? error.name : 'Error')
}

interface ServerOptions {
  env?: NodeJS.ProcessEnv
  stateStore?: StateStore
  dataStore?: DataStore
  journeyStore?: JourneyStore
  memoryStore?: MemoryStore
  verifyGoogle?: typeof verifyGoogleIdToken
  claudeVersion?: () => Promise<string | null>
  runAgent?: typeof runClaude
  workspace?: typeof prepareWorkspace
  firmReader?: FirmReader
  /** The OpenAI fetch for GPT-Live sessions and dictation (tests mock it). */
  liveFetch?: typeof fetch
}

function json(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let failed = false
    request.on('data', (chunk: Buffer) => {
      if (failed) return
      bytes += chunk.length
      if (bytes > maxBytes) {
        failed = true
        chunks.length = 0
        reject(new ValidationError())
        return
      }
      chunks.push(chunk)
    })
    request.once('end', () => {
      if (failed) return
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new ValidationError())
      }
    })
    request.once('error', reject)
    request.once('aborted', () => reject(new ValidationError()))
  })
}

async function readBytes(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(request.headers['content-length'])
  if (Number.isFinite(declared) && declared > maxBytes) { request.resume(); throw new DataError(413, 'file_too_large') }
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0, failed = false
    request.on('data', (chunk: Buffer) => {
      if (failed) return
      bytes += chunk.length
      if (bytes > maxBytes) { failed = true; chunks.length = 0; reject(new DataError(413, 'file_too_large')); return }
      chunks.push(chunk)
    })
    request.once('end', () => { if (!failed) resolveBody(Buffer.concat(chunks)) })
    request.once('error', reject)
    request.once('aborted', () => reject(new DataError(400, 'upload_aborted')))
  })
}

export function createServer(options: ServerOptions = {}) {
  const env = options.env ?? process.env
  validateSessionSecret(env.SESSION_SECRET)
  const verifyGoogle = options.verifyGoogle ?? verifyGoogleIdToken
  const version = options.claudeVersion ?? (() => getClaudeVersion(env))
  const runAgent = options.runAgent ?? runClaude
  const workspace = options.workspace ?? prepareWorkspace
  const queue = new UserQueue()
  // Data requests serialize among themselves, not behind chat turns: a page load fires several at once.
  const dataLocks = new KeyedMutex()
  const capacity = new GlobalSemaphore()
  const rateLimit = new TurnRateLimit()
  // ponytail: a call scribes every user pause, so voice turns get their own window; the account queue still serializes them.
  const voiceRateLimit = new TurnRateLimit(120, 600_000)
  const live = new LiveSessions()
  const dictations = new TurnRateLimit(30, 600_000)
  let stateStore = options.stateStore
  let dataStore = options.dataStore
  let firmReader = options.firmReader
  const getDataStore = () => {
    if (!dataStore) {
      if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) dataStore = dataStoreFromEnv(env)
      else if (env.NODE_ENV !== 'production') dataStore = createMemoryDataStore()
      else throw new DataError(503, 'data_unavailable')
    }
    return dataStore
  }
  let journeyStore = options.journeyStore
  // P7 records live beside the data: Supabase when the data store is, otherwise in memory (tests, development).
  const getJourneyStore = () => journeyStore ??= options.dataStore || !(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) ? createMemoryJourneyStore() : journeyStoreFromEnv(env)
  let memoryStore = options.memoryStore
  // P9 memory lives beside the journey records: Supabase when they are, otherwise in memory (tests, development).
  const getMemoryStore = () => {
    if (!memoryStore) {
      if (!options.dataStore && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) memoryStore = memoryStoreFromEnv(env)
      else if (env.NODE_ENV !== 'production') memoryStore = createMemoryMemoryStore()
      else throw new DataError(503, 'data_unavailable')
    }
    return memoryStore
  }
  async function stateDoc(email: string): Promise<Record<string, unknown>> {
    if (!stateStore && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) stateStore = stateStoreFromEnv(env)
    const row = await stateStore?.get(email)
    return isPlainObject(row?.doc) ? row.doc : {}
  }
  const stores = () => ({ journey: getJourneyStore(), memory: getMemoryStore() })
  // The account's own calendar day: until is validated against the same day the one-pager renders against.
  const accountToday = async (email: string) => dateKey(localToday(await getDataStore().listFacts(email), await stateDoc(email)))
  // Consolidation reads its own snapshot (a sibling directory, no cycle data): it never rebuilds or prunes the chat workspace.
  const memory = createMemory({ env, runAgent, capacity, memory: getMemoryStore, data: getDataStore, journey: getJourneyStore,
    timeoutMs: turnTimeoutMs('memory', env), today: accountToday,
    workspace: async email => options.workspace ? workspace({ email }, env) : materialize({ email }, env, getDataStore(), await stateDoc(email), {}, { ...stores(), variant: 'memory', maxCycles: 0 }) })
  let cachedVersion: Promise<string | null> | undefined

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = request.headers.origin
    response.setHeader('Vary', 'Origin')
    if (origin) {
      if (!ALLOWED_ORIGINS.has(origin)) {
        json(response, 403, { error: 'origin_not_allowed' })
        return
      }
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name, X-Set, X-System, X-Site')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (request.method === 'GET' && path === '/health') {
      cachedVersion ??= version().catch(() => null)
      json(response, 200, { ok: true, claude: await cachedVersion, engineSha })
      return
    }
    if (request.method === 'POST' && path === '/session') {
      const body = await readJson(request, 32_768)
      if (!isPlainObject(body) || typeof body.idToken !== 'string' || !body.idToken) {
        throw new AuthError()
      }
      const user = await verifyGoogle(body.idToken, env.GOOGLE_CLIENT_ID ?? '', undefined, env.ALLOWED_DOMAINS ?? '')
      if (!isAllowedEmail(user.email, env.ALLOWED_DOMAINS ?? '')) {
        json(response, 403, { error: 'invite_only' })
        return
      }
      json(response, 200, await signSession(user, env.SESSION_SECRET ?? ''))
      return
    }

    const user = await authenticate(request.headers.authorization, env, request.socket.remoteAddress)
    if (request.method === 'POST' && path === '/live-session') {
      const body = validateLiveBody(await readJson(request, 80_000))
      if (!env.OPENAI_API_KEY) { json(response, 503, { error: 'voice_not_configured' }); return }
      const call = live.start(user.email, body.purpose)
      if (call === 'busy') { json(response, 409, { error: 'call_in_progress' }); return }
      if (call === 'limited') { json(response, 429, { error: 'too_many_calls' }); return }
      try {
        const answer = await createLiveSession({ instructions: livePrompt(body.purpose, body.context, inboxAddress(user.email)),
          sdp: body.sdp, apiKey: env.OPENAI_API_KEY, fetch: options.liveFetch })
        call.upstreamId = answer.upstreamId
        // A tab that went away never connects this session, so it must not hold the one-call lock.
        if (response.destroyed) live.release(user.email, call.id)
        json(response, 200, { sdp: answer.sdp, sessionId: call.id })
      } catch (error) {
        live.release(user.email, call.id)
        if (!(error instanceof LiveUpstreamError)) throw error
        json(response, 502, { error: 'voice_unavailable', message: VOICE_ERROR })
      }
      return
    }
    const callEnd = /^\/live-session\/([^/]+)\/end$/.exec(path)
    if (request.method === 'POST' && callEnd) {
      const body = validateCallEnd(await readJson(request, 131_072))
      const call = live.get(user.email, callEnd[1])
      if (!call) { json(response, 404, { error: 'not_found' }); return }
      const record = { id: call.id, startedAt: new Date(call.startedAt).toISOString(), seconds: body.seconds, transcript: body.transcript, summary: null }
      await getDataStore().putCall(user.email, record)
      await writeCallFile(user.email, env, record)
      live.release(user.email, call.id)
      json(response, 200, { callId: call.id })
      void memory.consolidateMemory(user.email, 'call', call.id)
      return
    }
    // The saved call, so its transcript opens on any device, not only the one that made the call.
    const callPath = /^\/calls\/([^/]+)$/.exec(path)
    if (request.method === 'GET' && callPath) {
      const call = CALL_ID.test(callPath[1]) ? await getDataStore().getCall(user.email, callPath[1]) : null
      if (!call) { json(response, 404, { error: 'not_found' }); return }
      json(response, 200, { call })
      return
    }
    if (request.method === 'POST' && path === '/dictate') {
      const body = await readJson(request, 80_000)
      const sdp = validateSdp(isPlainObject(body) ? body.sdp : undefined)
      if (!env.OPENAI_API_KEY) { json(response, 503, { error: 'voice_not_configured' }); return }
      try { dictations.consume(user.email) } catch { json(response, 429, { error: 'too_many_dictations' }); return }
      try {
        json(response, 200, { sdp: await createDictation({ sdp, apiKey: env.OPENAI_API_KEY, fetch: options.liveFetch }) })
      } catch (error) {
        if (!(error instanceof DictateUpstreamError)) throw error
        json(response, 502, { error: 'dictation_unavailable', message: DICTATE_ERROR })
      }
      return
    }
    if (request.method === 'POST' && path === '/firm') {
      firmReader ??= new FirmReader(firmCacheFromEnv(env), text => extractFirm(text, env, turnTimeoutMs('firm', env)))
      const { firm, cached } = await firmReader.read(user.email, await readJson(request, 4096))
      json(response, 200, { firm, cached })
      // The Sample firm is not a pre-read, and an empty read (site down, nothing found) has nothing to learn.
      if (firm.domain !== 'sample' && (firm.summary || firm.states.length || firm.verticals.length || firm.clientTypes.length)) {
        void memory.consolidateMemory(user.email, 'site', firm.domain, { ...firm })
      }
      return
    }
    if (path === '/memory' || path.startsWith('/memory/')) {
      if (!await handleMemory({ method: request.method!, path, email: user.email, response, readBody: max => readJson(request, max),
        memory: getMemoryStore(), journey: getJourneyStore(), consolidate: memory.consolidateMemory, today: () => accountToday(user.email) })) json(response, 404, { error: 'not_found' })
      return
    }
    if (path === '/state' && (request.method === 'GET' || request.method === 'PUT')) {
      if (!stateStore) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
          json(response, 503, { error: 'state_unavailable' })
          return
        }
        stateStore = stateStoreFromEnv(env)
      }
      if (request.method === 'GET') {
        json(response, 200, await stateStore.get(user.email) ?? { doc: null })
      } else {
        const body = validateStateBody(await readJson(request, MAX_DOC_BYTES + 65_536))
        // Chat lives in closeout_chat; an older client's copy is dropped so the document stays small.
        delete body.doc.chat
        const result = await stateStore.put(user.email, body.doc, body.base_updated_at)
        json(response, result.status, result.row ?? { doc: null })
      }
      return
    }
    // The transcript lives in closeout_chat, never in the state document.
    if (path === '/chat/history' && (request.method === 'GET' || request.method === 'POST')) {
      const store = getDataStore()
      if (request.method === 'GET') json(response, 200, { messages: (await store.listChat(user.email)).map(chatMessage) })
      else {
        await store.appendChat(user.email, validateChatHistory(await readJson(request, 512 * 1024)))
        json(response, 200, { ok: true })
      }
      return
    }
    if (path === '/files' || path.startsWith('/files/') || path.startsWith('/data/')) {
      const store = getDataStore(), service = new DataService(store)
      // GET of a stale run can also publish. Serialize it with uploads and the chat turn's own data writes.
      const release = await dataLocks.acquire(user.email)
      try {
        const doc = await stateDoc(user.email)
        const url = new URL(request.url!, 'http://localhost')
        const sync = async () => materialize(user, env, store, await stateDoc(user.email), {}, stores())
        if (path === '/files' && request.method === 'POST') {
          let name: string
          try { name = decodeURIComponent(String(request.headers['x-file-name'] ?? 'upload.csv')) }
          catch { throw new DataError(400, 'invalid_file_name') }
          const hint = request.headers['x-set']
          if (hint !== undefined && hint !== '1' && hint !== '2') throw new DataError(400, 'invalid_set')
          const sourceHeader = (key: string, max: number) => {
            const value = request.headers[key]
            if (value === undefined) return undefined
            if (typeof value !== 'string') throw new DataError(400, 'invalid_source')
            let decoded: string
            try { decoded = decodeURIComponent(value).trim() } catch { throw new DataError(400, 'invalid_source') }
            if (!decoded || decoded.length > max || /[\r\n]/.test(decoded)) throw new DataError(400, 'invalid_source')
            return decoded
          }
          const bytes = await readBytes(request, 10 * 1024 * 1024)
          const file = await service.ingestFile(user.email, { name, bytes, set: hint ? Number(hint) as 1 | 2 : undefined,
            system: sourceHeader('x-system', 80), site: sourceHeader('x-site', 200) }, doc)
          await sync()
          json(response, 201, { file })
          return
        }
        if (path === '/files' && request.method === 'GET') {
          json(response, 200, { files: await store.listFiles(user.email) }); return
        }
        const filePath = /^\/files\/([^/]+)(\/raw)?$/.exec(path)
        if (filePath && request.method === 'GET') {
          const file = await store.getFile(user.email, filePath[1])
          if (!file) { json(response, 404, { error: 'not_found' }); return }
          const bytes = await store.getObject(user.email, file.storagePath)
          if (!bytes) throw new DataError(404, 'not_found')
          if (filePath[2]) {
            response.writeHead(200, { 'Content-Type': file.mime, 'Content-Disposition': `attachment; filename="${file.name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
            response.end(bytes)
          } else json(response, 200, { file, profile: parseFile(bytes, file.name).profile, mappingId: file.mappingId })
          return
        }
        if (path === '/data/sample' && request.method === 'POST') {
          const result = await service.seed(user.email, doc)
          await sync(); json(response, 200, result); return
        }
        if (path === '/data/sample' && request.method === 'DELETE') {
          const sampleCycles = (await store.listRuns(user.email)).filter(run => run.sample).map(run => run.cycleId)
          await store.deleteSample(user.email)
          await getJourneyStore().deleteCycles(user.email, sampleCycles)
          await service.renormalizeOriginals(user.email, doc)
          const cycles = await service.recompute(user.email, doc)
          await sync(); json(response, 200, { ok: true, cycles }); return
        }
        if (path === '/data/facts' && request.method === 'POST') {
          const result = await service.setFact(user.email, await readJson(request, 65_536), doc)
          await sync(); json(response, 200, result); return
        }
        if (path === '/data/connect' && request.method === 'POST') {
          const body = await readJson(request, 16_384)
          if (!isPlainObject(body)) throw new ValidationError()
          const result = await service.connect(user.email, body, doc)
          await sync(); json(response, 200, result); return
        }
        if (path === '/data/cycles' && request.method === 'GET') {
          await service.recompute(user.email, doc)
          const [runs, sources, facts] = await Promise.all([store.listRuns(user.email), store.listSources(user.email), store.listFacts(user.email)])
          const cycles = recentCycles(calendarFrom(doc), 26, localToday(facts, doc)).map(c => {
            const run = runs.find(r => r.cycleId === c.id)
            return { ...cycleDates(c), sample: run?.sample ?? false, runAt: run?.runAt ?? null,
              totals: run?.totals ?? null, counts: run?.counts ?? { set1: 0, set2: 0, set3: 0 }, findings: run?.groups.length ?? 0 }
          })
          json(response, 200, { cycles, sources }); return
        }
        // GET /data/cycles/:id (+ decisions, batch, nextStep) and the P7 journey routes.
        if (await handleJourney({ method: request.method!, path, url, email: user.email, doc, currentDoc: () => stateDoc(user.email), store, service, journey: getJourneyStore(),
          response, readBody: max => readJson(request, max), sync, onSent: cycleId => void memory.consolidateMemory(user.email, 'send', cycleId) })) return
        if (request.method === 'GET' && (path === '/data/entries' || path === '/data/findings')) {
          const cycleId = url.searchParams.get('cycle')
          if (!cycleId || !/^\d{4}-\d{2}-\d{2}$/.test(cycleId)) throw new DataError(400, 'invalid_cycle')
          await service.recompute(user.email, doc)
          const run = await store.getRun(user.email, cycleId)
          if (!run) { json(response, 404, { error: 'not_found' }); return }
          if (path === '/data/findings') json(response, 200, { groups: run.groups, cases: await store.listFindings(user.email, cycleId) })
          else {
            const offset = Number(url.searchParams.get('offset') ?? 0)
            if (!Number.isSafeInteger(offset) || offset < 0) throw new DataError(400, 'invalid_offset')
            const shiftId = url.searchParams.get('shift')
            let ids: string[] | undefined
            if (shiftId) {
              const payload = await store.getRunPayload(user.email, run)
              const shift = payload?.week.find(s => s.id === shiftId)
              if (!shift) { json(response, 404, { error: 'not_found' }); return }
              ids = shift.entryIds
            }
            json(response, 200, { entries: await store.listEntries(user.email, ids ? { ids, offset, limit: 2000 } : { from: run.periodStart, to: run.cycleId, offset, limit: 2000 }) })
          }
          return
        }
        json(response, 404, { error: 'not_found' }); return
      } finally { release() }
    }
    if (request.method === 'POST' && path === '/chat') {
      const body = validateChatBody(await readJson(request, 300_000))
      // Scribe and delegate answers are consumed whole by the call (final), never streamed as chat text.
      const voice = body.mode === 'scribe' || body.mode === 'delegate'
      const ingestFiles = body.mode === 'ingest' ? await Promise.all((body.context.fileIds as string[]).map(id => getDataStore().getFile(user.email, id))) : []
      if (ingestFiles.some(file => !file || file.status !== 'needs_mapping')) throw new ValidationError()
      const turns = voice ? voiceRateLimit : rateLimit
      turns.consume(user.email)
      const abort = new AbortController()
      let heartbeat: ReturnType<typeof setInterval> | undefined
      const onClose = () => {
        clearInterval(heartbeat)
        if (!response.writableEnded) abort.abort()
      }
      response.once('close', onClose)
      let accountSlot: Promise<() => void> | undefined
      let release: (() => void) | undefined
      let releaseCapacity: (() => void) | undefined
      let done = false
      let sessionId = ''
      let spoken = ''
      try {
        accountSlot = queue.reserve(user.email, abort.signal)
        // Observe cancellation even while global admission is still pending.
        void accountSlot.catch(() => {})
        // Global admission must precede headers so its timeout is an HTTP 429.
        releaseCapacity = await capacity.acquire(abort.signal)
        if (abort.signal.aborted) return
        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        })
        response.flushHeaders()
        heartbeat = setInterval(() => {
          if (!response.destroyed && !response.writableEnded) response.write(': ka\n\n')
        }, 15_000)
        release = await accountSlot
        if (abort.signal.aborted) return
        const doc = await stateDoc(user.email), store = getDataStore()
        if (body.mode === 'ingest' && (await Promise.all((body.context.fileIds as string[]).map(id => store.getFile(user.email, id)))).some(file => !file || file.status !== 'needs_mapping')) throw new ValidationError()
        // P9: the CLI never re-reads CLAUDE.md on its own, so the memory one-pager this turn's own rebuild wrote rides in its system prompt.
        const { cwd, memory: onePager } = options.workspace ? { cwd: await workspace(user, env), memory: '' } : await materializeTurn(user, env, store, doc, body.context, stores())
        if (abort.signal.aborted) return
        await runDataTurn({ options: {
          cwd,
          message: body.message,
          prompt: body.mode === 'scribe' ? scribePrompt(body.context)
            : body.mode === 'consolidate' ? consolidatePrompt({ callId: body.context.callId as string })
            : withMemory(body.mode === 'onboard' ? onboardPrompt({ ...body.context, inbox: inboxAddress(user.email) })
              : body.mode === 'ingest' ? ingestPrompt(ingestFiles.filter(file => file !== null), body.context)
              : body.mode === 'delegate' ? delegatePrompt(body.context)
              : systemPrompt(body.context), onePager),
          model: body.mode === 'scribe' ? env.CLOSEOUT_SCRIBE_MODEL ?? 'sonnet' : env.CLOSEOUT_AGENT_MODEL ?? 'opus',
          env,
          signal: abort.signal,
          timeoutMs: turnTimeoutMs(body.mode, env),
          }, runAgent, service: new DataService(store), email: user.email, doc, lock: () => dataLocks.acquire(user.email),
          fileIds: body.mode === 'ingest' ? body.context.fileIds as string[] : undefined,
          sync: () => options.workspace ? workspace(user, env) : materialize(user, env, store, doc, body.context, stores()),
          emit(event) {
            if (abort.signal.aborted || done) return
            if (voice && 'text' in event) { spoken += event.text; return }
            if ('done' in event) {
              done = true
              sessionId = event.sessionId
              clearInterval(heartbeat)
              if (voice && !event.error) {
                const reply = event.final ?? spoken
                event = { ...event, final: body.mode === 'scribe' ? scribeOutput(reply, body.context.uncovered) : spokenAnswer(reply) }
              }
            }
            response.write(`data: ${JSON.stringify(event)}\n\n`)
          },
        })
        if (!abort.signal.aborted && !done) {
          response.write(`data: ${JSON.stringify({ done: true, sessionId, error: AGENT_ERROR })}\n\n`)
        }
        response.end()
      } catch (error) {
        if (abort.signal.aborted) return
        if (!response.headersSent) throw error
        logFailure(error)
        if (!done) response.write(`data: ${JSON.stringify({ done: true, sessionId, error: AGENT_ERROR })}\n\n`)
        response.end()
      } finally {
        clearInterval(heartbeat)
        response.off('close', onClose)
        abort.abort()
        if (!release) void accountSlot?.then(releaseSlot => releaseSlot(), () => {})
        release?.()
        releaseCapacity?.()
      }
      return
    }
    json(response, 404, { error: 'not_found' })
  }

  const server = createHttpServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (error instanceof InviteOnlyError) json(response, 403, { error: 'invite_only' })
      else if (error instanceof AuthError) json(response, 401, { error: 'invalid_token' })
      else if (error instanceof DuplicateFileError) json(response, 409, { error: 'duplicate_file', id: error.id })
      else if (error instanceof DataError) json(response, error.status, { error: error.message })
      else if (error instanceof FirmError) json(response, error.status, { error: error.message })
      else if (error instanceof IngestError) json(response, error.status, { error: error.status === 415 ? 'unsupported_file_type' : 'invalid_file' })
      else if (error instanceof ValidationError) json(response, 400, { error: 'invalid_body' })
      else if (error instanceof QueueFullError) json(response, 429, { error: 'queue_full' })
      else {
        logFailure(error)
        json(response, 500, { error: 'internal_error' })
      }
    })
  })
  // Closing finishes the background memory runs this server started, so none is cut off between its writes and its run row.
  const close = server.close.bind(server)
  server.close = (callback?: (error?: Error) => void) => close(error => { void memory.settled().then(() => callback?.(error)) })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 8787)
  const server = createServer()
  server.listen(port, listenHost(process.env), () => console.log(`Closeout Agent listening on port ${port}`))
}
