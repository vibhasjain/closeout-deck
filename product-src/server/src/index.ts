import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { authenticate, AuthError, InviteOnlyError, isAllowedEmail, signSession, validateSessionSecret, verifyGoogleIdToken } from './auth.ts'
import { AGENT_ERROR, getClaudeVersion, runClaude } from './claude.ts'
import { systemPrompt } from './prompts.ts'
import { GlobalSemaphore, QueueFullError, TurnRateLimit, UserQueue } from './queue.ts'
import { stateStoreFromEnv } from './state.ts'
import type { StateStore } from './state.ts'
import { isPlainObject, MAX_DOC_BYTES, validateChatBody, validateStateBody, ValidationError } from './validation.ts'
import type { ChatMode } from './validation.ts'
import { prepareWorkspace } from './workspace.ts'

const ALLOWED_ORIGINS = new Set(['https://closeoutcopilot.com', 'http://localhost:9000'])

export function listenHost(env: NodeJS.ProcessEnv): string {
  return env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'
}

export function turnTimeoutMs(mode: ChatMode, env: NodeJS.ProcessEnv): number {
  const configured = Number(env[`CLOSEOUT_${mode.toUpperCase()}_TIMEOUT_MS`])
  return Number.isFinite(configured) && configured > 0 ? configured : 180_000
}

function logFailure(error: unknown): void {
  console.error('Request failed:', error instanceof Error ? error.message : JSON.stringify(error))
}

interface ServerOptions {
  env?: NodeJS.ProcessEnv
  stateStore?: StateStore
  verifyGoogle?: typeof verifyGoogleIdToken
  claudeVersion?: () => Promise<string | null>
  runAgent?: typeof runClaude
  workspace?: typeof prepareWorkspace
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
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (request.method === 'GET' && path === '/health') {
      cachedVersion ??= version().catch(() => null)
      json(response, 200, { ok: true, claude: await cachedVersion })
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
    if (request.method === 'POST' && ['/live-session', '/dictate', '/firm'].includes(path)) {
      json(response, 501, { error: 'not_yet' })
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
        const result = await stateStore.put(user.email, body.doc, body.base_updated_at)
        json(response, result.status, result.row ?? { doc: null })
      }
      return
    }
    if (request.method === 'POST' && path === '/chat') {
      const body = validateChatBody(await readJson(request, 300_000))
      if (body.mode !== 'chat') {
        json(response, 501, { error: 'not_yet' })
        return
      }
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
        const cwd = await workspace(user, env)
        if (abort.signal.aborted) return
        await runAgent({
          cwd,
          message: body.message,
          prompt: systemPrompt(body.context),
          model: env.CLOSEOUT_AGENT_MODEL ?? 'opus',
          env,
          signal: abort.signal,
          timeoutMs: turnTimeoutMs(body.mode, env),
          onEvent(event) {
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
