import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { delimiter, normalize, sep } from 'node:path'
import { promisify } from 'node:util'
import { readSessionId, writeSessionId } from './workspace.js'

export type ClaudeEvent = { text: string } | { done: true; sessionId: string; error?: string }
type DoneEvent = Extract<ClaudeEvent, { done: true }>

/** Ignore non-text CLI events; retain the browser's existing SSE payload shape. */
export function mapStreamLine(line: string, sessionId: string): ClaudeEvent | null {
  let value: unknown
  try { value = JSON.parse(line) } catch { return null }
  if (!value || typeof value !== 'object') return null
  const event = value as {
    type?: string
    event?: { type?: string; delta?: { type?: string; text?: unknown } }
    session_id?: unknown
    is_error?: boolean
    result?: unknown
    errors?: unknown[]
    subtype?: string
  }
  if (event.type === 'stream_event' && event.event?.type === 'content_block_delta'
    && event.event.delta?.type === 'text_delta' && typeof event.event.delta.text === 'string') {
    return { text: event.event.delta.text }
  }
  if (event.type === 'result') {
    const result: DoneEvent = {
      done: true,
      sessionId: typeof event.session_id === 'string' ? event.session_id : sessionId,
    }
    if (event.is_error) {
      result.error = typeof event.result === 'string' && event.result
        ? event.result
        : event.errors?.map(String).join('\n') || event.subtype || 'Claude could not complete this turn.'
    }
    return result
  }
  return null
}

export function claudeArgs(prompt: string, sessionId: string, resume: boolean, model: string): string[] {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', model, '--append-system-prompt', prompt,
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
  const childEnv = { ...env }
  delete childEnv.CLAUDECODE
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

interface RunOptions {
  cwd: string
  message: string
  prompt: string
  onEvent: (event: ClaudeEvent) => void
  signal?: AbortSignal
  model?: string
  env?: NodeJS.ProcessEnv
  /** Allows deterministic process-level tests without invoking the paid CLI. */
  command?: string
}

type Attempt = { result?: DoneEvent; stderr: string; code: number | null; aborted: boolean; streamed: boolean }

function runAttempt(options: RunOptions, sessionId: string, resume: boolean): Promise<Attempt> {
  return new Promise(resolve => {
    const env = options.env ?? process.env
    const child = spawn(options.command ?? 'claude', claudeArgs(
      options.prompt, sessionId, resume, options.model ?? env.CLOSEOUT_AGENT_MODEL ?? 'opus',
    ), { cwd: options.cwd, env: claudeEnv(env), stdio: ['pipe', 'pipe', 'pipe'] })
    let buffer = ''
    let stderr = ''
    let result: DoneEvent | undefined
    let streamed = false
    let finished = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let exitTimer: ReturnType<typeof setTimeout> | undefined
    const parseLine = (line: string) => {
      const event = mapStreamLine(line, sessionId)
      if (!event || options.signal?.aborted) return
      if ('done' in event) result = event
      else { streamed = true; options.onEvent(event) }
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
      resolve({ result, stderr, code, aborted: options.signal?.aborted ?? false, streamed })
    }
    const abort = () => {
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
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-32_768) })
    child.stdin.on('error', () => { /* close/error reports early process exits */ })
    child.on('error', error => { stderr = error.message; finish(null) })
    child.on('exit', code => {
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

export function missingSession(error: string): boolean {
  return /no (?:conversation|session) found|(?:conversation|session)[^\n]{0,120}(?:not found|does not exist|is missing)/i.test(error)
}

/** Call while holding this account's queue slot. Emits exactly one terminal event. */
export async function runClaude(options: RunOptions): Promise<void> {
  if (options.signal?.aborted) return
  const previous = await readSessionId(options.cwd)
  let sessionId = previous ?? randomUUID()
  if (!previous) await writeSessionId(options.cwd, sessionId)
  let attempt = await runAttempt(options, sessionId, Boolean(previous))
  if (attempt.aborted) return
  if (previous && !attempt.streamed && (attempt.result?.error || attempt.code !== 0)
    && missingSession(`${attempt.stderr}\n${attempt.result?.error ?? ''}`)) {
    sessionId = randomUUID()
    await writeSessionId(options.cwd, sessionId)
    attempt = await runAttempt(options, sessionId, false)
    if (attempt.aborted) return
  }
  if (attempt.result) {
    // We choose and persist the UUID; do not let CLI metadata change account scope.
    options.onEvent({ ...attempt.result, sessionId })
  } else {
    options.onEvent({
      done: true, sessionId,
      error: attempt.stderr.trim().slice(0, 1_000) || `Claude exited without a result (${attempt.code ?? 'unknown'}).`,
    })
  }
}
