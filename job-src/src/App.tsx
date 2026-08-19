import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui'
import { PipelineTab } from '@/PipelineTab'
import { SignIn } from '@/SignIn'
import {
  HttpError,
  SESSION_EXPIRED_EVENT,
  canWrite,
  fetchFeed,
  getViewerSession,
  resetAppStorage,
  sendMessage,
} from '@/api'
import type { Feed } from '@/types'

export default function App() {
  const [viewerSession, setViewerSession] = useState(() => getViewerSession())
  const [feed, setFeed] = useState<Feed | null>(null)
  const [feedError, setFeedError] = useState(false)
  const [signInNotice, setSignInNotice] = useState('')
  const [initialLoading, setInitialLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [sendingCandidateId, setSendingCandidateId] = useState<string | null>(null)
  const sendTimers = useRef<number[]>([])
  const loadGeneration = useRef(0)
  const owner = canWrite()
  const authenticated = owner || Boolean(viewerSession)

  const returnToSignIn = useCallback((notice = '') => {
    loadGeneration.current += 1
    resetAppStorage()
    setViewerSession(null)
    setFeed(null)
    setFeedError(false)
    setInitialLoading(true)
    setRefetching(false)
    setMobileDetail(false)
    setSignInNotice(notice)
    for (const timer of sendTimers.current) window.clearTimeout(timer)
    sendTimers.current = []
  }, [])

  useEffect(() => {
    const onSessionExpired = () => returnToSignIn('Session expired — sign in again.')
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
  }, [returnToSignIn])

  const load = useCallback(async (background = false) => {
    const generation = loadGeneration.current
    if (background) setRefetching(true)
    try {
      const next = await fetchFeed()
      if (generation !== loadGeneration.current) return
      setFeed(next)
      setFeedError(false)
    } catch (error) {
      if (generation !== loadGeneration.current) return
      if (error instanceof HttpError && (error.status === 401 || error.status === 403) && !owner) {
        returnToSignIn('Session expired — sign in again.')
        return
      }
      setFeedError(true)
    } finally {
      if (generation === loadGeneration.current) {
        setInitialLoading(false)
        setRefetching(false)
      }
    }
  }, [owner, returnToSignIn])

  useEffect(() => {
    if (!authenticated) return
    void load()
    const interval = window.setInterval(() => void load(true), 60_000)
    return () => window.clearInterval(interval)
  }, [authenticated, load])

  useEffect(() => () => {
    for (const timer of sendTimers.current) window.clearTimeout(timer)
  }, [])

  const scheduleRefetches = () => {
    sendTimers.current.push(window.setTimeout(() => void load(true), 5_000))
    sendTimers.current.push(window.setTimeout(() => void load(true), 15_000))
  }

  const send = async (text: string, candidateId: string) => {
    setSendingCandidateId(candidateId)
    try {
      await sendMessage(text)
      await load(true)
      scheduleRefetches()
    } finally {
      setSendingCandidateId(null)
    }
  }

  if (!authenticated) {
    return (
      <SignIn
        notice={signInNotice}
        onSignedIn={(session) => {
          loadGeneration.current += 1
          setSignInNotice('')
          setFeed(null)
          setFeedError(false)
          setInitialLoading(true)
          setViewerSession(session)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3 md:px-4">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          {mobileDetail && (
            <button
              onClick={() => setMobileDetail(false)}
              className="flex items-center gap-1 text-[13px] text-muted-foreground md:hidden"
            >
              <ChevronLeft className="size-4" /> Pipeline
            </button>
          )}
          <div className={`text-[15px] font-semibold tracking-tight ${mobileDetail ? 'hidden md:block' : ''}`}>
            Job<span className="text-muted-foreground">Pipeline</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {authenticated && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => returnToSignIn()}
            >
              Sign out
            </Button>
          )}
        </div>
      </header>

      {feedError && feed && (
        <div
          role="status"
          className="flex min-h-7 shrink-0 items-center justify-center gap-2 bg-nosource/10 px-3 text-[11.5px] font-medium text-nosource"
        >
          <span>Can't reach the feed — retrying</span>
          <Button size="xs" variant="ghost" className="h-6 px-2" onClick={() => returnToSignIn()}>
            Sign out &amp; reset
          </Button>
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        {feedError && !feed ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
            <p className="text-[13px] text-muted-foreground">Can't reach the feed.</p>
            <Button size="sm" variant="outline" disabled={refetching} onClick={() => void load(true)}>
              {refetching ? 'Retrying…' : 'Retry'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => returnToSignIn()}>
              Sign out &amp; reset
            </Button>
          </div>
        ) : (
          <PipelineTab
            feed={feed}
            initialLoading={initialLoading}
            mobileDetail={mobileDetail}
            onMobileDetail={setMobileDetail}
            writable={owner}
            sendingCandidateId={sendingCandidateId}
            onSend={send}
          />
        )}
      </main>
    </div>
  )
}
