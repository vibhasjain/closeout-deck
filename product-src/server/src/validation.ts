export const MAX_MESSAGE_CHARS = 8_000
export const MAX_CONTEXT_CHARS = 60_000
export const MAX_DOC_BYTES = 1024 * 1024
export const MODES = ['chat', 'onboard', 'scribe', 'delegate', 'consolidate'] as const
export type ChatMode = typeof MODES[number]

export interface ChatBody {
  mode: ChatMode
  message: string
  context: Record<string, unknown>
}

export class ValidationError extends Error {
  constructor() {
    super('invalid_body')
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

// HTTP inputs are JSON.parse output. Keep this exported validator strict for other callers too.
function jsonString(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, (_key, item: unknown) => {
      if (item === undefined || typeof item === 'bigint' || typeof item === 'function'
        || typeof item === 'symbol' || (typeof item === 'number' && !Number.isFinite(item))) {
        throw new ValidationError()
      }
      return item
    })
    if (serialized === undefined) throw new ValidationError()
    return serialized
  } catch {
    throw new ValidationError()
  }
}

export function validateChatBody(body: unknown): ChatBody {
  if (!isPlainObject(body) || !MODES.includes(body.mode as ChatMode)
    || typeof body.message !== 'string' || !body.message.trim()
    || body.message.length > MAX_MESSAGE_CHARS || !isPlainObject(body.context)
    || jsonString(body.context).length > MAX_CONTEXT_CHARS) {
    throw new ValidationError()
  }
  return { mode: body.mode as ChatMode, message: body.message, context: body.context }
}

export interface StateBody {
  doc: Record<string, unknown>
  base_updated_at: string | null
}

export function validateStateBody(body: unknown): StateBody {
  if (!isPlainObject(body) || !isPlainObject(body.doc)
    || (body.base_updated_at !== null && typeof body.base_updated_at !== 'string')
    || Buffer.byteLength(jsonString(body.doc), 'utf8') > MAX_DOC_BYTES) {
    throw new ValidationError()
  }
  return { doc: body.doc, base_updated_at: body.base_updated_at as string | null }
}
