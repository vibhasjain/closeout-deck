export const API_BASE = import.meta.env.PROD ? 'https://closeout-agent.fly.dev' : '/api'
import { expireSession, viewerSession } from '@/lib/viewerSession'

/** Shared authenticated transport for state, chat and time-entry data. */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = viewerSession()?.sessionToken
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (response.status === 401) expireSession()
  return response
}

export { cachedFetch, cachedJson, cacheResponse, clearResponseCache, hasWarmResponseCache, peekCached, prefetchGet, restoreResponseCache, savesData, startBootCache, subscribeCached, subscribeAllCached, supersedeCachedReads, CachedRequestError, type CacheMode } from '@/lib/responseCache'
