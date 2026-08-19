import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, LogOut } from 'lucide-react'
import { FilterChips } from '@/components/FilterChips'
import { Button } from '@/components/ui'
import { PipelineTab } from '@/PipelineTab'
import { SignIn } from '@/SignIn'
import { PIPELINE_FILTERS, type PipelineFilter } from '@/lib/filter'
import {
  HttpError,
  SESSION_EXPIRED_EVENT,
  canWrite,
  fetchFeed,
  getViewerSession,
  resetAppStorage,
} from '@/api'
import type { Feed } from '@/types'

// The dashboard is read-only: sending, revising and everything else runs
// through the Agent Keyboard widget, and the poll below shows the result.
function loadAgentKeyboard(): void {
  if (document.querySelector('script[data-job-agent-keyboard]')) return
  const script = document.createElement('script')
  script.src = 'https://agent-keyboard.fly.dev/widget.js'
  script.dataset.site = 'closeout-jobs'
  script.dataset.jobAgentKeyboard = 'true'
  script.defer = true
  document.body.appendChild(script)
}

export default function App() {
  const [viewerSession, setViewerSession] = useState(() => getViewerSession())
  const [feed, setFeed] = useState<Feed | null>(null)
  const [feedError, setFeedError] = useState(false)
  const [signInNotice, setSignInNotice] = useState('')
  const [initialLoading, setInitialLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [filter, setFilter] = useState<PipelineFilter>('drafted')
  // The Agent Keyboard token survives a sign-out now, so remember the click.
  const [signedOut, setSignedOut] = useState(false)
  const loadGeneration = useRef(0)
  const owner = canWrite()
  const authenticated = !signedOut && (owner || Boolean(viewerSession))
  const filterCounts = useMemo<Record<PipelineFilter, number>>(() => {
    const candidates = feed?.candidates ?? []
    return {
      all: candidates.length,
      new: candidates.filter((candidate) => candidate.status === 'new').length,
      drafted: candidates.filter((candidate) => candidate.status === 'drafted').length,
      'awaiting-reply': candidates.filter((candidate) => candidate.status === 'awaiting-reply').length,
      disqualified: candidates.filter((candidate) => candidate.status === 'disqualified').length,
    }
  }, [feed])

  const returnToSignIn = useCallback((notice = '') => {
    loadGeneration.current += 1
    resetAppStorage()
    setSignedOut(true)
    setViewerSession(null)
    setFeed(null)
    setFeedError(false)
    setInitialLoading(true)
    setRefetching(false)
    setMobileDetail(false)
    setSignInNotice(notice)
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
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
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
  }, [returnToSignIn])

  useEffect(() => {
    if (!authenticated) return
    void load()
    const interval = window.setInterval(() => void load(true), 10_000)
    return () => window.clearInterval(interval)
  }, [authenticated, load])

  useEffect(() => {
    if (owner || viewerSession?.email === 'vibes@hypertrack.io') loadAgentKeyboard()
  }, [owner, viewerSession])

  if (!authenticated) {
    return (
      <SignIn
        notice={signInNotice}
        autoSignIn={Boolean(signInNotice)}
        onSignedIn={(session) => {
          loadGeneration.current += 1
          setSignedOut(false)
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

        <div className="hidden min-w-0 flex-1 items-center md:flex">
          <FilterChips
            options={PIPELINE_FILTERS}
            value={filter}
            onChange={setFilter}
            counts={filterCounts}
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
          {authenticated && (
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground/60 hover:text-foreground"
              onClick={() => returnToSignIn()}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut aria-hidden="true" />
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
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
            onClick={() => returnToSignIn()}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut aria-hidden="true" />
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
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground/60 hover:text-foreground"
              onClick={() => returnToSignIn()}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <PipelineTab
            feed={feed}
            initialLoading={initialLoading}
            mobileDetail={mobileDetail}
            onMobileDetail={setMobileDetail}
            filter={filter}
            onFilter={setFilter}
            filterCounts={filterCounts}
          />
        )}
      </main>
    </div>
  )
}
