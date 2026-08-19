import type { Attachment, Candidate, Draft, Feed, Meeting, Status, ThreadEntry, TrailEntry } from './types'

const API = 'https://agent-keyboard.fly.dev'
const SITE = 'closeout-jobs'
const FEED_PATH = `/sites/${SITE}/feed`
const FILES_PATH = `/sites/${SITE}/files`
const MESSAGES_PATH = `/sites/${SITE}/messages`
const SESSION_PATH = `/sites/${SITE}/session`
const OWNER_KEY = 'agent-keyboard-auth'
const SESSION_KEY = 'job:viewer-session:v1'
const COMPOSER_KEY_PREFIX = 'job:composer:v1:'
const JOB_KEY_PREFIX = 'job:'
const NETWORK_RETRY_DELAY_MS = 3_000

export const SESSION_EXPIRED_EVENT = 'job:session-expired'

export interface ViewerSession {
  sessionToken: string
  exp: number
  email: string
}

const STATUS = new Set<Status>([
  'new', 'drafted', 'sent', 'awaiting-reply', 'calendly-sent',
  'meeting-scheduled', 'met', 'disqualified',
])
const blobUrls = new Map<string, string>()

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HttpError'
  }
}

function ownerToken(): string | null {
  try {
    const raw = localStorage.getItem(OWNER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { access_token?: unknown }
    return typeof parsed.access_token === 'string' && parsed.access_token ? parsed.access_token : null
  } catch {
    return null
  }
}

function viewerSession(value: unknown): ViewerSession | null {
  const item = object(value)
  const sessionToken = string(item.sessionToken)
  const exp = typeof item.exp === 'number' ? item.exp : Number.NaN
  const email = string(item.email)
  return sessionToken && Number.isFinite(exp) && exp * 1000 > Date.now() && email
    ? { sessionToken, exp, email }
    : null
}

export function getViewerSession(): ViewerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = viewerSession(JSON.parse(raw))
    if (!session) localStorage.removeItem(SESSION_KEY)
    return session
  } catch {
    return null
  }
}

function storeViewerSession(session: ViewerSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    /* localStorage unavailable; App keeps the session in memory */
  }
}

function storageKeys(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key !== null)
}

function isGoogleTokenKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return normalized.includes('google') && normalized.includes('token')
}

function isCurrentLocalStorageKey(key: string): boolean {
  return key === OWNER_KEY || key === SESSION_KEY || key.startsWith(COMPOSER_KEY_PREFIX)
}

export function purgeLegacyStorage(): void {
  try {
    for (const key of storageKeys(sessionStorage)) {
      if (isGoogleTokenKey(key)) sessionStorage.removeItem(key)
    }
  } catch {
    /* sessionStorage unavailable */
  }
  try {
    for (const key of storageKeys(localStorage)) {
      if (!isCurrentLocalStorageKey(key)) localStorage.removeItem(key)
    }
  } catch {
    /* localStorage unavailable */
  }
}

export function resetAppStorage(): void {
  try {
    sessionStorage.clear()
  } catch {
    /* sessionStorage unavailable */
  }
  try {
    for (const key of storageKeys(localStorage)) {
      if (key === OWNER_KEY || key.startsWith(JOB_KEY_PREFIX) || isGoogleTokenKey(key)) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    /* localStorage unavailable */
  }
}

export function getToken(): string | null {
  return ownerToken() ?? getViewerSession()?.sessionToken ?? null
}

export function canWrite(): boolean {
  return ownerToken() !== null
}

function object(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function attachment(value: unknown): Attachment | null {
  const item = object(value)
  const name = string(item.name)
  const path = string(item.path)
  return name && path ? { name, path } : null
}

function threadEntry(value: unknown, index: number): ThreadEntry {
  const item = object(value)
  const rawDir = string(item.dir)
  const dir: ThreadEntry['dir'] = rawDir === 'out' || rawDir === 'internal' ? rawDir : 'in'
  const attachments = Array.isArray(item.attachments)
    ? item.attachments.map(attachment).filter((item): item is Attachment => item !== null)
    : []
  return {
    id: string(item.id, `thread-${index}`),
    dir,
    at: string(item.at),
    ...(typeof item.subject === 'string' ? { subject: item.subject } : {}),
    text: string(item.text),
    attachments,
  }
}

function draft(value: unknown): Draft | null {
  if (value == null) return null
  const item = object(value)
  if (!string(item.id)) return null
  return {
    id: string(item.id),
    subject: string(item.subject),
    text: string(item.text),
    createdAt: string(item.createdAt),
    rationale: string(item.rationale),
  }
}

function trailEntry(value: unknown): TrailEntry | null {
  const item = object(value)
  const rawAction = string(item.action)
  const actions = ['ingested', 'drafted', 'revised', 'sent', 'status'] as const
  const action = actions.find((candidate) => candidate === rawAction)
  return action ? { at: string(item.at), action, detail: string(item.detail) } : null
}

function candidate(value: unknown, index: number): Candidate {
  const item = object(value)
  const rawStatus = string(item.status)
  const status = STATUS.has(rawStatus as Status) ? rawStatus as Status : 'new'
  const thread = Array.isArray(item.thread)
    ? item.thread.map((entry, entryIndex) => threadEntry(entry, entryIndex))
    : []
  const flags = Array.isArray(item.flags) ? item.flags.filter((flag): flag is string => typeof flag === 'string') : []
  const trail = Array.isArray(item.trail)
    ? item.trail.map(trailEntry).filter((entry): entry is TrailEntry => entry !== null)
    : []
  return {
    id: string(item.id, `c-malformed-${index}`),
    name: string(item.name, 'Unknown candidate'),
    email: string(item.email),
    appliedAt: string(item.appliedAt),
    source: item.source === 'linkedin' ? 'linkedin' : 'email',
    status,
    summary: string(item.summary),
    flags,
    thread,
    draft: draft(item.draft),
    trail,
  }
}

function meeting(value: unknown): Meeting | null {
  const item = object(value)
  const rawStatus = string(item.status)
  const status = rawStatus === 'done' || rawStatus === 'canceled' ? rawStatus : 'scheduled'
  const candidateId = string(item.candidateId)
  return candidateId ? { candidateId, at: string(item.at), source: string(item.source), status } : null
}

function normalizeFeed(value: unknown): Feed {
  const item = object(value)
  const candidates = Array.isArray(item.candidates)
    ? item.candidates.map((entry, index) => candidate(entry, index))
    : []
  const meetings = Array.isArray(item.meetings)
    ? item.meetings.map(meeting).filter((entry): entry is Meeting => entry !== null)
    : []
  return { updatedAt: string(item.updatedAt), candidates, meetings }
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handleViewerUnauthorized(status: number): void {
  if (status !== 401 || ownerToken()) return
  resetAppStorage()
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

async function fetchFeedResponse(): Promise<Response> {
  try {
    return await fetch(`${API}${FEED_PATH}`, { headers: authHeaders() })
  } catch (error) {
    if (!getToken()) throw error
    await new Promise((resolve) => window.setTimeout(resolve, NETWORK_RETRY_DELAY_MS))
    if (!getToken()) throw error
    return fetch(`${API}${FEED_PATH}`, { headers: authHeaders() })
  }
}

export async function createViewerSession(idToken: string): Promise<ViewerSession> {
  const res = await fetch(`${API}${SESSION_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  if (!res.ok) throw new HttpError(res.status, `${SESSION_PATH} -> ${res.status}`)
  const session = viewerSession(await res.json())
  if (!session) throw new Error('Invalid viewer session response')
  storeViewerSession(session)
  return session
}

export async function fetchFeed(): Promise<Feed> {
  const res = await fetchFeedResponse()
  handleViewerUnauthorized(res.status)
  if (!res.ok) throw new HttpError(res.status, `${FEED_PATH} -> ${res.status}`)
  return normalizeFeed(await res.json())
}

export async function loadFile(path: string): Promise<string> {
  const cached = blobUrls.get(path)
  if (cached) return cached
  // Feed paths are cloud-relative, while the files route is files-relative.
  const routePath = path.startsWith('files/') ? path.slice('files/'.length) : path
  const encodedPath = routePath.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`${API}${FILES_PATH}/${encodedPath}`, { headers: authHeaders() })
  handleViewerUnauthorized(res.status)
  if (!res.ok) throw new HttpError(res.status, `${FILES_PATH}/${routePath} -> ${res.status}`)
  const url = URL.createObjectURL(await res.blob())
  blobUrls.set(path, url)
  return url
}

export function revokeFiles(): void {
  for (const url of blobUrls.values()) URL.revokeObjectURL(url)
  blobUrls.clear()
}

export async function sendMessage(text: string): Promise<void> {
  const token = ownerToken()
  if (!token) throw new HttpError(401, 'Owner access required')
  const res = await fetch(`${API}${MESSAGES_PATH}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, page: '/job', idemKey: crypto.randomUUID() }),
  })
  if (!res.ok) throw new HttpError(res.status, `${MESSAGES_PATH} -> ${res.status}`)
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let errorMessage: string | null = null
  // ponytail: The feed poll is the source of truth, so we drain rather than parse frames.
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value) buffer += decoder.decode(value, { stream: !done })
      if (done) {
        buffer += decoder.decode()
        if (buffer) buffer += '\n\n'
      }
      for (;;) {
        const boundary = buffer.indexOf('\n\n')
        if (boundary === -1) break
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const lines = frame.split('\n')
        const event = lines.find((line) => line.startsWith('event:'))?.slice('event:'.length).trim()
        if (event !== 'error') continue
        const rawData = lines.find((line) => line.startsWith('data:'))?.slice('data:'.length).trim()
        try {
          const data = object(rawData ? JSON.parse(rawData) : null)
          errorMessage = string(data.detail) || string(data.kind) || 'Agent run failed'
        } catch {
          errorMessage = 'Agent run failed'
        }
      }
      if (done) break
    }
  } catch {
    /* A later feed poll catches up after a dropped stream. */
  }
  if (errorMessage) throw new Error(errorMessage)
}
