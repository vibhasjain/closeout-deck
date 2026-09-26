import { createHash } from 'node:crypto'
import type { ServerResponse } from 'node:http'

/** Scoped, opaque validators. Weak tags also cover a cycle's content-addressed version before gzip. */
export function entityTag(email: string, resource: string, version: string): string {
  return `W/"${createHash('sha256').update(JSON.stringify([email, resource, version])).digest('hex')}"`
}

export function matchesTag(ifNoneMatch: string | undefined, tag: string): boolean {
  const opaque = tag.replace(/^W\//, '')
  return ifNoneMatch?.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === opaque) ?? false
}

/** Call only after authorization and resource lookup; a matching tag must never hide a 401/404. */
export function notModified(response: ServerResponse, ifNoneMatch: string | undefined, tag: string): boolean {
  response.setHeader('ETag', tag)
  response.setHeader('Cache-Control', 'private, no-cache')
  const vary = String(response.getHeader('Vary') ?? '').split(',').map(value => value.trim()).filter(Boolean)
  response.setHeader('Vary', [...new Set([...vary, 'Authorization', 'Accept-Encoding'])].join(', '))
  if (!matchesTag(ifNoneMatch, tag)) return false
  response.writeHead(304)
  response.end()
  return true
}

export function freshJson(response: ServerResponse, email: string, resource: string, ifNoneMatch: string | undefined, body: unknown): void {
  const text = JSON.stringify(body)
  if (notModified(response, ifNoneMatch, entityTag(email, resource, text))) return
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(text)
}
