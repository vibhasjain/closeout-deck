import type { Attachment, Candidate, Draft, Feed, Meeting, MeetingRecording, ThreadEntry, TrailEntry } from './types'
import { safeHttpUrl } from './lib/links'
import { parseStatus } from './lib/status'

const API = 'https://agent-keyboard.fly.dev'
const SITE = 'closeout-jobs'
const FEED_PATH = `/sites/${SITE}/feed`
const FILES_PATH = `/sites/${SITE}/files`
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

const blobUrls = new Map<string, string>()

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HttpError'
  }
}

function ownerSession(): { token: string; expiresAt: number } | null {
  try {
    const raw = localStorage.getItem(OWNER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { access_token?: unknown; expires_at?: unknown }
    const token = typeof parsed.access_token === 'string' ? parsed.access_token : ''
    if (!token) return null
    return { token, expiresAt: typeof parsed.expires_at === 'number' ? parsed.expires_at : Infinity }
  } catch {
    return null
  }
}

function ownerToken(): string | null {
  return ownerSession()?.token ?? null
}

// Agent Keyboard only refreshes its token when it runs something, so a stale
// copy is normal. Spending a 401 on it used to strand the page, so prefer the
// viewer session and keep the stale token as a last resort.
function freshOwnerToken(): string | null {
  const session = ownerSession()
  return session && session.expiresAt - 60 > Date.now() / 1000 ? session.token : null
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
  return key === OWNER_KEY || key === SESSION_KEY || key === 'job:right-pane-w' || key.startsWith(COMPOSER_KEY_PREFIX)
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

// OWNER_KEY is the Agent Keyboard login. Signing out of this dashboard — or
// losing its session — must never sign the owner out of the widget too.
export function resetAppStorage(): void {
  try {
    for (const key of storageKeys(sessionStorage)) {
      if (isGoogleTokenKey(key)) sessionStorage.removeItem(key)
    }
  } catch {
    /* sessionStorage unavailable */
  }
  try {
    for (const key of storageKeys(localStorage)) {
      if (key.startsWith(JOB_KEY_PREFIX) || isGoogleTokenKey(key)) localStorage.removeItem(key)
    }
  } catch {
    /* localStorage unavailable */
  }
}

export function getToken(): string | null {
  return freshOwnerToken() ?? getViewerSession()?.sessionToken ?? ownerToken()
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
  const meetingEntry = item.kind === 'meeting'
  const attachments = Array.isArray(item.attachments)
    ? item.attachments.map(attachment).filter((item): item is Attachment => item !== null)
    : []
  return {
    id: string(item.id, `thread-${index}`),
    dir: meetingEntry ? 'internal' : dir,
    at: string(item.at),
    ...(meetingEntry ? {
      kind: 'meeting' as const,
      loomUrl: safeHttpUrl(item.loomUrl) ?? '',
      loomId: string(item.loomId),
    } : {}),
    ...(typeof item.subject === 'string' ? { subject: item.subject } : {}),
    text: string(item.text),
    attachments,
  }
}

function meetingRecording(value: unknown): MeetingRecording | null {
  const item = object(value)
  const loomUrl = safeHttpUrl(item.loomUrl)
  const loomId = string(item.loomId)
  if (!loomUrl || !loomId) return null
  const durationSec = typeof item.durationSec === 'number' && Number.isFinite(item.durationSec)
    ? item.durationSec
    : undefined
  return {
    loomUrl,
    loomId,
    ...(string(item.title) ? { title: string(item.title) } : {}),
    ...(string(item.recordedAt) ? { recordedAt: string(item.recordedAt) } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(string(item.summaryPath) ? { summaryPath: string(item.summaryPath) } : {}),
    ...(string(item.transcriptPath) ? { transcriptPath: string(item.transcriptPath) } : {}),
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
  const status = parseStatus(item.status)
  const thread = Array.isArray(item.thread)
    ? item.thread.map((entry, entryIndex) => threadEntry(entry, entryIndex))
    : []
  const flags = Array.isArray(item.flags) ? item.flags.filter((flag): flag is string => typeof flag === 'string') : []
  const trail = Array.isArray(item.trail)
    ? item.trail.map(trailEntry).filter((entry): entry is TrailEntry => entry !== null)
    : []
  const linkedinUrl = safeHttpUrl(item.linkedinUrl)
  const recordedMeeting = meetingRecording(item.meeting)
  return {
    id: string(item.id, `c-malformed-${index}`),
    name: string(item.name, 'Unknown candidate'),
    email: string(item.email),
    ...(linkedinUrl ? { linkedinUrl } : {}),
    appliedAt: string(item.appliedAt),
    source: item.source === 'linkedin' ? 'linkedin' : 'email',
    status,
    ...(string(item.meetingAt) ? { meetingAt: string(item.meetingAt) } : {}),
    ...(string(item.meetingEnd) ? { meetingEnd: string(item.meetingEnd) } : {}),
    ...(safeHttpUrl(item.meetLink) ? { meetLink: safeHttpUrl(item.meetLink)! } : {}),
    summary: string(item.summary),
    flags,
    thread,
    ...(recordedMeeting ? { meeting: recordedMeeting } : {}),
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
  if (status !== 401) return
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

export async function loadFile(path: string, mimeType?: string): Promise<string> {
  const cacheKey = `${path}\u0000${mimeType ?? ''}`
  const cached = blobUrls.get(cacheKey)
  if (cached) return cached
  // Feed paths are cloud-relative, while the files route is files-relative.
  const routePath = path.startsWith('files/') ? path.slice('files/'.length) : path
  const encodedPath = routePath.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`${API}${FILES_PATH}/${encodedPath}`, { headers: authHeaders() })
  handleViewerUnauthorized(res.status)
  if (!res.ok) throw new HttpError(res.status, `${FILES_PATH}/${routePath} -> ${res.status}`)
  const responseBlob = await res.blob()
  const blob = mimeType && responseBlob.type !== mimeType
    ? new Blob([responseBlob], { type: mimeType })
    : responseBlob
  const url = URL.createObjectURL(blob)
  blobUrls.set(cacheKey, url)
  return url
}

export function revokeFiles(): void {
  for (const url of blobUrls.values()) URL.revokeObjectURL(url)
  blobUrls.clear()
}
