import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { PipelineTab } from '@/PipelineTab'
import { SignIn } from '@/SignIn'
import { sampleFeed } from '@/sampleFeed'
import {
  HttpError,
  canWrite,
  clearGoogleToken,
  fetchFeed,
  getGoogleToken,
  getToken,
  sendMessage,
  setSampleMode,
} from '@/api'
import { shortTime } from '@/lib/utils'
import type { Feed } from '@/types'

export default function App() {
  const [googleToken, setGoogleTokenState] = useState(() => getGoogleToken())
  const [sampleOnly, setSampleOnly] = useState(false)
  const [feed, setFeed] = useState<Feed | null>(null)
  const [sample, setSample] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [sendingCandidateId, setSendingCandidateId] = useState<string | null>(null)
  const sendTimers = useRef<number[]>([])
  const owner = canWrite()
  const authenticated = owner || Boolean(googleToken)

  const load = useCallback(async (background = false) => {
    if (sampleOnly) {
      setSampleMode(true)
      setFeed(sampleFeed)
      setSample(true)
      setInitialLoading(false)
      return
    }
    if (background) setRefetching(true)
    try {
      const next = await fetchFeed()
      setSampleMode(false)
      setFeed(next)
      setSample(false)
    } catch (error) {
      if (error instanceof HttpError && error.status === 401 && googleToken && !owner) {
        clearGoogleToken()
        setGoogleTokenState(null)
        setFeed(null)
        return
      }
      setSampleMode(true)
      setFeed(sampleFeed)
      setSample(true)
    } finally {
      setInitialLoading(false)
      setRefetching(false)
    }
  }, [googleToken, owner, sampleOnly])

  useEffect(() => {
    if (!authenticated && !sampleOnly) return
    void load()
    const interval = window.setInterval(() => void load(true), 60_000)
    return () => window.clearInterval(interval)
  }, [authenticated, load, sampleOnly])

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

  if (!authenticated && !sampleOnly && !getToken()) {
    return (
      <SignIn
        onSignedIn={(token) => setGoogleTokenState(token)}
        onSample={() => {
          setSampleOnly(true)
          setSampleMode(true)
          setFeed(sampleFeed)
          setSample(true)
          setInitialLoading(false)
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
          {sample && <span className="text-[11px] text-verify">SAMPLE DATA</span>}
          {!owner && <span className="text-[11px] text-muted-foreground">Read-only</span>}
          {feed?.updatedAt && (
            <span className="text-[12px] text-muted-foreground">
              Updated {shortTime(feed.updatedAt)}
            </span>
          )}
          {refetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Refresh pipeline"
            onClick={() => void load(true)}
          >
            <RefreshCw className="size-4" />
          </Button>
          {googleToken && !owner && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Sign out"
              onClick={() => {
                clearGoogleToken()
                setGoogleTokenState(null)
                setFeed(null)
                setSampleOnly(false)
              }}
            >
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <PipelineTab
          feed={feed}
          initialLoading={initialLoading}
          mobileDetail={mobileDetail}
          onMobileDetail={setMobileDetail}
          writable={owner}
          sendingCandidateId={sendingCandidateId}
          onSend={send}
        />
      </main>
    </div>
  )
}
