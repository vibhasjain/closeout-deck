import { valid } from '../lib/ak-session.js'

const HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  let input
  try { input = await req.json() } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const sessionId = typeof input?.sessionId === 'string' ? input.sessionId : crypto.randomUUID()
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(`data: ${JSON.stringify({ done: true, sessionId, error: 'Chat is unavailable: ANTHROPIC_API_KEY is not configured' })}\n\n`, { headers: HEADERS })
  }
  const token = req.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!(await valid(token))) {
    return Response.json({ error: 'Sign in with your hypertrack.io account' }, { status: 401 })
  }
  const { message, system, history = [] } = input ?? {}
  if (typeof message !== 'string' || message.length > 8000 || typeof system !== 'string' || system.length > 60000 ||
      !Array.isArray(history) || history.length > 40 || history.some((m) => !m || !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string' || m.text.length > 8000)) {
    return Response.json({ error: 'Invalid chat input' }, { status: 400 })
  }
  const messages = []
  for (const { role, text } of [...history, { role: 'user', text: message }]) {
    if (!text.trim() || (!messages.length && role === 'assistant')) continue
    const previous = messages.at(-1)
    if (previous?.role === role) previous.content += `\n\n${text}`
    else messages.push({ role, content: text })
  }
  if (!messages.length) return Response.json({ error: 'A message is required' }, { status: 400 })

  const abort = new AbortController()
  let ended = false
  const readableStream = new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
      const finish = (error) => {
        if (ended) return
        send({ done: true, sessionId, ...(error ? { error } : {}) })
        ended = true
        controller.close()
      }
      let reader
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: Deno.env.get('CLOSEOUT_CHAT_MODEL') || 'claude-sonnet-5', max_tokens: 1024, system, messages, stream: true }),
          signal: abort.signal,
        })
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}))
          finish((typeof data?.error?.message === 'string' && data.error.message.slice(0, 200)) || `Chat is unavailable (${res.status})`)
          return
        }
        reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        const consume = (frame) => {
          const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
          if (!data || ended) return
          const event = JSON.parse(data)
          const type = event.type || frame.match(/^event:\s*(.+)$/m)?.[1].trim()
          if (type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') send({ text: event.delta.text })
          if (type === 'message_stop') finish()
          if (type === 'error') finish((typeof event.error?.message === 'string' && event.error.message.slice(0, 200)) || 'Chat is unavailable right now')
        }
        while (!ended) {
          const { value, done } = await reader.read()
          buffer += decoder.decode(value, { stream: !done })
          const frames = buffer.split(/\r?\n\r?\n/)
          buffer = frames.pop() ?? ''
          for (const frame of frames) consume(frame)
          if (done) {
            if (buffer.trim()) consume(buffer)
            finish('Chat stream ended unexpectedly')
            break
          }
        }
      } catch {
        finish('Chat is unavailable right now')
      } finally {
        await reader?.cancel().catch(() => {})
      }
    },
    cancel() { ended = true; abort.abort() },
  })
  return new Response(readableStream, { headers: HEADERS })
}

export const config = { path: '/api/chat' }
