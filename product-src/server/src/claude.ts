import { execFile, spawn } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { delimiter, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { cycleLabel, type Cycle } from '../../src/lib/cycles.ts'
import { readSessionId, writeSessionId } from './workspace.js'

export const AGENT_ERROR = 'The Closeout Agent hit a problem. Try again in a moment.'
export type ClaudeEvent = { text: string } | { trace: string } | { done: true; sessionId: string; final?: string; error?: string }
type DoneEvent = Extract<ClaudeEvent, { done: true }>
type StreamState = { hasText: boolean }

/** Ignore non-text CLI events and never expose provider errors to the browser. */
export function mapStreamLine(line: string, sessionId: string, state: StreamState = { hasText: false }): { text: string } | DoneEvent | null {
  let value: unknown
  try { value = JSON.parse(line) } catch { return null }
  if (!value || typeof value !== 'object') return null
  const event = value as {
    type?: string
    event?: { type?: string; content_block?: { type?: string }; delta?: { type?: string; text?: unknown } }
    session_id?: unknown
    is_error?: boolean
    result?: unknown
  }
  if (event.type === 'stream_event') {
    if (event.event?.type === 'content_block_start' && event.event.content_block?.type === 'text') {
      return state.hasText ? { text: '\n\n' } : null
    }
    if (event.event?.type === 'content_block_delta' && event.event.delta?.type === 'text_delta'
      && typeof event.event.delta.text === 'string') {
      if (event.event.delta.text) state.hasText = true
      return { text: event.event.delta.text }
    }
  }
  if (event.type === 'result') {
    return {
      done: true,
      sessionId: typeof event.session_id === 'string' ? event.session_id : sessionId,
      ...(event.is_error ? { error: AGENT_ERROR }
        : typeof event.result === 'string' ? { final: event.result } : {}),
    }
  }
  return null
}

const WHAT: Record<string, string> = { cycles: 'the closeout summary', findings: 'the findings', entries: 'the time entries', batches: 'the Payroll batch' }
const FIXED: Record<string, string> = { 'data/decisions.jsonl': 'the decisions', 'data/gaps.md': 'the open gaps', 'data/journey.md': 'the closeout history' }

/** A data read as a person says it, never with an id. Names come from the account records this turn's workspace was built from. */
export function dataTrace(cwd: string, rel: string): string | null {
  const read = (path: string) => { try { return readFileSync(join(cwd, path), 'utf8') } catch { return '' } }
  const name = (pattern: RegExp) => pattern.exec(read(rel))?.[1].replace(/\p{Cc}/gu, ' ').trim().slice(0, 80)
  if (FIXED[rel]) return `Read ${FIXED[rel]}`
  const [, folder, id] = /^data\/(cycles|findings|entries|batches|threads|disputes)\/([\w-]+)\.(?:json|jsonl|csv|md)$/.exec(rel) ?? []
  if (folder === 'threads') { const who = name(/^Counterparty: [^·\n]*· (.+?)(?: \([^()\n]*\))?$/m); return who ? `Read the thread with ${who}` : 'Read a thread' }
  if (folder === 'disputes') { const who = name(/^Worker: (.+)$/m); return who ? `Read the dispute from ${who}` : 'Read a dispute' }
  if (!folder || !/^\d{4}-\d{2}-\d{2}$/.test(id)) return null
  const day = (key: string) => new Date(`${key}T00:00:00`)
  const start = /"start":"(\d{4}-\d{2}-\d{2})"/.exec(read(`data/cycles/${id}.json`))?.[1]
  return `Read ${WHAT[folder]} for ${start ? cycleLabel({ start: day(start), end: day(id) } as Cycle) : `the week ending ${day(id).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}`
}

/**
 * Quiet trace frames for the chat: each Read of a workspace handbook becomes "Read handbooks/x.md",
 * and Reads under data/ become a human line (dataTrace), at most 3 of those per turn, including a resume retry.
 * Paths never reach the chat, and each trace is emitted once.
 */
export function createTraceMapper(cwd: string): (line: string) => { trace: string }[] {
  const seen = new Set<string>()
  // The CLI may report the resolved path (macOS /var → /private/var).
  let real = cwd
  try { real = realpathSync(cwd) } catch { /* the workspace always exists during a turn */ }
  let dataTraces = 0
  return line => {
    if (!line.includes('"tool_use"')) return []
    let value: { type?: string; message?: { content?: { type?: string; name?: string; input?: { file_path?: unknown } }[] } }
    try { value = JSON.parse(line) } catch { return [] }
    if (value?.type !== 'assistant' || !Array.isArray(value.message?.content)) return []
    const frames: { trace: string }[] = []
    for (const block of value.message.content) {
      if (block?.type !== 'tool_use' || block.name !== 'Read' || typeof block.input?.file_path !== 'string') continue
      const file = block.input.file_path
      const rel = normalize(!isAbsolute(file) ? file : relative(file.startsWith(real + sep) ? real : cwd, file)).split(sep).join('/')
      const kind = /^handbooks\/[^/]+\.md$/.test(rel) ? 'handbook' : /^data\/./.test(rel) ? 'data' : null
      if (!kind || seen.has(rel) || (kind === 'data' && dataTraces >= 3)) continue
      const trace = kind === 'data' ? dataTrace(cwd, rel) : `Read ${rel}`
      if (!trace) continue
      seen.add(rel)
      if (kind === 'data') dataTraces++
      frames.push({ trace })
    }
    return frames
  }
}

/** Each CLI attempt has its own text-block state, including across tool calls. */
export function createStreamMapper(sessionId: string): (line: string) => { text: string } | DoneEvent | null {
  const state: StreamState = { hasText: false }
  return line => mapStreamLine(line, sessionId, state)
}

export function claudeArgs(prompt: string, sessionId: string, resume: boolean, model: string, budgetUsd = '2'): string[] {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', model, '--max-budget-usd', budgetUsd, '--append-system-prompt', prompt,
    ...(resume ? ['--resume', sessionId] : ['--session-id', sessionId]),
    '--tools', 'Read', 'Grep', 'Glob', '--allowedTools', 'Read', 'Grep', 'Glob',
    // Restricted mode confines file tools to cwd; dontAsk denies any operation
    // that would need a permission prompt. MCP/skills cannot expand the toolset.
    '--restricted', '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--strict-mcp-config', '--disable-slash-commands', '--no-chrome',
    // A resumed conversation must receive this turn's current page context.
    '--system-prompt-snapshot', 'off',
  ]
}

export function claudeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {}
  // USER selects the macOS keychain account. Omitting it can select stale
  // standalone credentials even while the local CLI is correctly signed in.
  for (const key of ['PATH', 'HOME', 'USER', 'LANG', 'TZ', 'CLAUDE_CODE_OAUTH_TOKEN']) {
    if (env[key] !== undefined) childEnv[key] = env[key]
  }
  // npm run prepends local dependency bins, which can shadow the pinned/global
  // CLI with an older package inherited from an ancestor's node_modules.
  if (childEnv.PATH) {
    childEnv.PATH = childEnv.PATH.split(delimiter)
      .filter(entry => normalize(entry).split(sep).filter(Boolean).slice(-2).join(sep) !== `node_modules${sep}.bin`)
      .join(delimiter)
  }
  return childEnv
}

export async function getClaudeVersion(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)('claude', ['--version'], {
      env: claudeEnv(env), timeout: 5_000, maxBuffer: 8_192,
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export interface RunOptions {
  cwd: string
  message: string
  prompt: string
  onEvent: (event: ClaudeEvent) => void
  signal?: AbortSignal
  /** Wall-clock limit for the whole turn, including a possible fresh-session retry. */
  timeoutMs?: number
  model?: string
  env?: NodeJS.ProcessEnv
  /** Allows deterministic process-level tests without invoking the paid CLI. */
  command?: string
  /** Background work (memory consolidation): a new --session-id every run, never --resume, session.json untouched. */
  fresh?: boolean
}

type Attempt = {
  result?: DoneEvent
  stderr: string
  failureReason?: string
  code: number | null
  aborted: boolean
  streamed: boolean
}
const TURN_TIMEOUT = Symbol('turn_timeout')

function runAttempt(options: RunOptions, sessionId: string, resume: boolean, traceLine: ReturnType<typeof createTraceMapper>): Promise<Attempt> {
  return new Promise(resolve => {
    const env = options.env ?? process.env
    const child = spawn(options.command ?? 'claude', claudeArgs(
      options.prompt, sessionId, resume, options.model ?? env.CLOSEOUT_AGENT_MODEL ?? 'opus',
      env.CLOSEOUT_TURN_BUDGET_USD ?? '2',
    ), { cwd: options.cwd, env: claudeEnv(env), stdio: ['pipe', 'pipe', 'pipe'] })
    const mapLine = createStreamMapper(sessionId)
    let buffer = ''
    let stderr = ''
    let failureReason: string | undefined
    let result: DoneEvent | undefined
    let streamed = false
    let finished = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let exitTimer: ReturnType<typeof setTimeout> | undefined
    const parseLine = (line: string) => {
      if (!options.signal?.aborted) for (const frame of traceLine(line)) options.onEvent(frame)
      const event = mapLine(line)
      if (!event || options.signal?.aborted) return
      if ('done' in event) {
        result = event
        if (event.error) {
          const raw = JSON.parse(line) as { result?: unknown; errors?: unknown[]; subtype?: string }
          failureReason = typeof raw.result === 'string' && raw.result
            ? raw.result : raw.errors?.map(String).join('\n') || raw.subtype
        }
      } else {
        if (event.text) streamed = true
        options.onEvent(event)
      }
    }
    const finish = (code: number | null) => {
      if (finished) return
      finished = true
      if (buffer.trim()) parseLine(buffer)
      options.signal?.removeEventListener('abort', abort)
      clearTimeout(killTimer)
      clearTimeout(exitTimer)
      child.stdout.destroy()
      child.stderr.destroy()
      resolve({ result, stderr, failureReason, code, aborted: options.signal?.aborted ?? false, streamed })
    }
    const abort = () => {
      if (options.signal?.reason === TURN_TIMEOUT) {
        child.kill('SIGKILL')
        return
      }
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, 1_000)
      killTimer.unref()
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) parseLine(line)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(0, 32_768) })
    child.stdin.on('error', () => { /* close/error reports early process exits */ })
    child.on('error', error => { stderr = error.message; finish(null) })
    child.on('exit', code => {
      if (options.signal?.aborted) { finish(code); return }
      // A child inheriting stdio must not hold the account's queue slot forever.
      exitTimer = setTimeout(() => finish(code), 2_000)
      exitTimer.unref()
    })
    child.on('close', finish)
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
    else child.stdin.end(options.message)
  })
}

function firstLine(value: string): string {
  return value.split(/[\r\n]/, 1)[0]!.slice(0, 1_000)
}

function logFailure(attempt: Attempt): void {
  console.error(`Closeout Agent CLI failed: exit=${attempt.code ?? 'unknown'} stderr=${firstLine(attempt.stderr) || '(empty)'}`)
}

function failed(attempt: Attempt): boolean {
  return attempt.code !== 0 || !attempt.result || Boolean(attempt.result.error)
}

/** Call while holding this account's queue slot. Emits exactly one terminal event. */
export async function runClaude(options: RunOptions): Promise<void> {
  if (options.signal?.aborted) return
  const previous = options.fresh ? null : await readSessionId(options.cwd)
  let sessionId = previous ?? randomUUID()
  if (!previous && !options.fresh) await writeSessionId(options.cwd, sessionId)
  if (options.signal?.aborted) return
  const turn = new AbortController()
  const abort = () => turn.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => turn.abort(TURN_TIMEOUT), options.timeoutMs ?? 180_000)
  timer.unref()
  try {
    const attemptOptions = { ...options, signal: turn.signal }, traceLine = createTraceMapper(options.cwd)
    let attempt = await runAttempt(attemptOptions, sessionId, Boolean(previous), traceLine)
    if (options.signal?.aborted) return
    if (!attempt.aborted && failed(attempt)) logFailure(attempt)
    if (previous && !attempt.aborted && !attempt.streamed && failed(attempt)) {
      const reason = firstLine(attempt.stderr || attempt.failureReason || `CLI exited without a result (${attempt.code ?? 'unknown'})`)
      console.warn('Closeout Agent resume failed; starting a fresh session:', reason)
      sessionId = randomUUID()
      await writeSessionId(options.cwd, sessionId)
      if (options.signal?.aborted) return
      if (!turn.signal.aborted) {
        attempt = await runAttempt(attemptOptions, sessionId, false, traceLine)
        if (options.signal?.aborted) return
        if (!attempt.aborted && failed(attempt)) logFailure(attempt)
      }
    }
    if (turn.signal.reason === TURN_TIMEOUT) {
      logFailure(attempt)
      console.error(`Closeout Agent turn timed out after ${options.timeoutMs ?? 180_000}ms`)
    }
    if (turn.signal.aborted || failed(attempt)) {
      options.onEvent({ done: true, sessionId, error: AGENT_ERROR })
    } else {
      // We choose and persist the UUID; do not let CLI metadata change account scope.
      options.onEvent({ ...attempt.result!, sessionId })
    }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}
