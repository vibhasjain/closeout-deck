import type { Plugin } from 'vite'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

interface ClaudeStreamEvent {
  type?: string
  event?: {
    type?: string
    delta?: { type?: string; text?: string }
  }
  session_id?: string
  is_error?: boolean
  result?: unknown
}

/** Dev-only. POST /api/chat {message, system, sessionId?} → SSE of {text} … {done, sessionId, error?}. */
export function chatPlugin(): Plugin {
  return {
    name: 'closeout-chat',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          const { message, system, sessionId } = JSON.parse(body) as { message: string; system: string; sessionId?: string }
          const id = sessionId ?? randomUUID()
          const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '',
            '--model', process.env.CLOSEOUT_CHAT_MODEL ?? 'sonnet', '--append-system-prompt', system,
            ...(sessionId ? ['--resume', id] : ['--session-id', id])]
          const env = { ...process.env }; delete env.CLAUDECODE   // allow spawning from inside a Claude Code session
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
          const send = (o: object) => res.write(`data: ${JSON.stringify(o)}\n\n`)
          // Outside the repo, so the CLI doesn't load project CLAUDE.md files and answer as a coding assistant.
          const child = spawn('claude', args, { env, cwd: tmpdir() })
          child.stdin.end(message)
          let buf = ''
          child.stdout.on('data', (chunk) => {
            buf += chunk
            const lines = buf.split('\n'); buf = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.trim()) continue
              let ev: ClaudeStreamEvent; try { ev = JSON.parse(line) as ClaudeStreamEvent } catch { continue }
              if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') send({ text: ev.event.delta.text })
              if (ev.type === 'result') send({ done: true, sessionId: ev.session_id ?? id, error: ev.is_error ? String(ev.result) : undefined })
            }
          })
          child.stderr.on('data', (c) => console.error('[chat]', String(c).trim()))
          child.on('error', (e) => { send({ done: true, sessionId: id, error: e.message }); res.end() })
          child.on('close', () => res.end())
          // Kill the CLI only when the BROWSER hangs up early. `req` fires 'close' as soon as the
          // request body is consumed, so watching it there would kill Claude before it ever replies.
          res.on('close', () => { if (!res.writableEnded) child.kill() })
        })
      })
    },
  }
}
