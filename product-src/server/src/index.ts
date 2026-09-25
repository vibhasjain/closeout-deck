import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { authenticate, AuthError, InviteOnlyError, isAllowedEmail, signSession, validateSessionSecret, verifyGoogleIdToken } from './auth.ts'
import { AGENT_ERROR, getClaudeVersion, runClaude } from './claude.ts'
import { systemPrompt, onboardPrompt, ingestPrompt } from './prompts.ts'
import { runDataTurn } from './agentTurn.ts'
import { FirmError, FirmReader, extractFirm, firmCacheFromEnv } from './firm.ts'
import { GlobalSemaphore, QueueFullError, TurnRateLimit, UserQueue } from './queue.ts'
import { stateStoreFromEnv } from './state.ts'
import type { StateStore } from './state.ts'
import { chatMessage, isPlainObject, MAX_DOC_BYTES, validateChatBody, validateChatHistory, validateStateBody, ValidationError } from './validation.ts'
import type { ChatMode } from './validation.ts'
import { prepareWorkspace, materialize } from './workspace.ts'
import { DataError, DataService, cycleDates, localToday } from './data.ts'
import { dataStoreFromEnv, DuplicateFileError, createMemoryDataStore } from './datastore.ts'
import type { DataStore } from './datastore.ts'
import { calendarFrom, engineSha } from './pipeline.ts'
import { parseFile, IngestError } from './ingest.ts'
import { recentCycles } from '../../src/lib/cycles.ts'
import { inboxAddress } from '../../src/lib/inbox.ts'

const ALLOWED_ORIGINS = new Set(['https://closeoutcopilot.com', 'http://localhost:9000'])

export function listenHost(env: NodeJS.ProcessEnv): string {
  return env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'
}

export const MODE_TIMEOUTS = { chat: 180_000, onboard: 180_000, ingest: 300_000, firm: 60_000, scribe: 180_000, delegate: 180_000, consolidate: 180_000 } as const
export function turnTimeoutMs(mode: ChatMode | 'firm', env: NodeJS.ProcessEnv): number {
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
  verifyGoogle?: typeof verifyGoogleIdToken
  claudeVersion?: () => Promise<string | null>
  runAgent?: typeof runClaude
  workspace?: typeof prepareWorkspace
  firmReader?: FirmReader
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
  const capacity = new GlobalSemaphore()
  const rateLimit = new TurnRateLimit()
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
  async function stateDoc(email: string): Promise<Record<string, unknown>> {
    if (!stateStore && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) stateStore = stateStoreFromEnv(env)
    const row = await stateStore?.get(email)
    return isPlainObject(row?.doc) ? row.doc : {}
  }
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
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
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
    if (request.method === 'POST' && ['/live-session', '/dictate'].includes(path)) {
      json(response, 501, { error: 'not_yet' })
      return
    }
    if (request.method === 'POST' && path === '/firm') {
      firmReader ??= new FirmReader(firmCacheFromEnv(env), text => extractFirm(text, env, turnTimeoutMs('firm', env)))
      json(response, 200, await firmReader.read(user.email, await readJson(request, 4096)))
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
      const abort = new AbortController()
      const onClose = () => { if (!response.writableEnded) abort.abort() }
      response.once('close', onClose)
      // GET of a stale run can also publish. Serialize it with uploads and chat turns.
      const release = await queue.reserve(user.email, abort.signal)
      try {
        const doc = await stateDoc(user.email)
        const url = new URL(request.url!, 'http://localhost')
        const sync = () => materialize(user, env, store, doc)
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
          await store.deleteSample(user.email)
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
        const cyclePath = /^\/data\/cycles\/(\d{4}-\d{2}-\d{2})$/.exec(path)
        if (cyclePath && request.method === 'GET') {
          await service.recompute(user.email, doc)
          const run = await store.getRun(user.email, cyclePath[1])
          if (!run) { json(response, 404, { error: 'not_found' }); return }
          const bytes = await store.getObject(user.email, run.storagePath)
          if (!bytes) throw new DataError(404, 'not_found')
          response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' })
          response.end(bytes); return
        }
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
      } finally { release(); response.off('close', onClose) }
    }
    if (request.method === 'POST' && path === '/chat') {
      const body = validateChatBody(await readJson(request, 300_000))
      if (body.mode !== 'chat' && body.mode !== 'onboard' && body.mode !== 'ingest') {
        json(response, 501, { error: 'not_yet' })
        return
      }
      const ingestFiles = body.mode === 'ingest' ? await Promise.all((body.context.fileIds as string[]).map(id => getDataStore().getFile(user.email, id))) : []
      if (ingestFiles.some(file => !file || file.status !== 'needs_mapping')) throw new ValidationError()
      rateLimit.consume(user.email)
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
        const cwd = options.workspace ? await workspace(user, env) : await materialize(user, env, store, doc, body.context)
        if (abort.signal.aborted) return
        await runDataTurn({ options: {
          cwd,
          message: body.message,
          prompt: body.mode === 'onboard' ? onboardPrompt({ ...body.context, inbox: inboxAddress(user.email) }) : body.mode === 'ingest' ? ingestPrompt(ingestFiles.filter(file => file !== null), body.context) : systemPrompt(body.context),
          model: env.CLOSEOUT_AGENT_MODEL ?? 'opus',
          env,
          signal: abort.signal,
          timeoutMs: turnTimeoutMs(body.mode, env),
          }, runAgent, service: new DataService(store), email: user.email, doc,
          fileIds: body.mode === 'ingest' ? body.context.fileIds as string[] : undefined,
          sync: () => options.workspace ? workspace(user, env) : materialize(user, env, store, doc, body.context),
          emit(event) {
            if (abort.signal.aborted || done) return
            if ('done' in event) {
              done = true
              sessionId = event.sessionId
              clearInterval(heartbeat)
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

  return createHttpServer((request, response) => {
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 8787)
  const server = createServer()
  server.listen(port, listenHost(process.env), () => console.log(`Closeout Agent listening on port ${port}`))
}
