import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react'
import { cn } from '@/lib/utils'

const RIGHT_PANE_STORAGE_KEY = 'job:right-pane-w'
const RIGHT_PANE_MIN_WIDTH = 320

function defaultRightPaneWidth(): number {
  if (typeof window === 'undefined') return 420
  return Math.min(
    window.innerWidth * 0.6,
    Math.max(420, (window.innerWidth - RIGHT_PANE_MIN_WIDTH) / 2),
  )
}

function clampRightPaneWidth(width: number): number {
  if (typeof window === 'undefined') return Math.max(RIGHT_PANE_MIN_WIDTH, Math.round(width))
  const maxWidth = Math.max(RIGHT_PANE_MIN_WIDTH, window.innerWidth * 0.6)
  return Math.round(Math.min(Math.max(width, RIGHT_PANE_MIN_WIDTH), maxWidth))
}

function initialRightPaneWidth(): number {
  if (typeof window === 'undefined') return defaultRightPaneWidth()
  try {
    const storedWidth = Number.parseFloat(window.localStorage.getItem(RIGHT_PANE_STORAGE_KEY) ?? '')
    if (Number.isFinite(storedWidth)) return clampRightPaneWidth(storedWidth)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return clampRightPaneWidth(defaultRightPaneWidth())
}

function persistRightPaneWidth(width: number): void {
  try {
    window.localStorage.setItem(RIGHT_PANE_STORAGE_KEY, String(width))
  } catch {
    // Resizing should keep working even when storage is unavailable.
  }
}

export function ThreePaneLayout({
  mobileDetail,
  left,
  middle,
  right,
  separatorLabel,
}: {
  mobileDetail: boolean
  left: ReactNode
  middle: ReactNode
  right: (pane: { paneRef: Ref<HTMLElement>; desktopWidth: number }) => ReactNode
  separatorLabel: string
}) {
  const [rightPaneWidth, setRightPaneWidth] = useState(initialRightPaneWidth)
  const [resizingRightPane, setResizingRightPane] = useState(false)
  const hasPersistedRightPaneWidth = useRef(false)
  const rightPaneRef = useRef<HTMLElement>(null)
  const resizeFrame = useRef<number | null>(null)
  const resizeState = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    latestWidth: number
  } | null>(null)
  const previousDocumentStyles = useRef<{ userSelect: string; cursor: string } | null>(null)

  useEffect(() => {
    try {
      hasPersistedRightPaneWidth.current = Number.isFinite(
        Number.parseFloat(window.localStorage.getItem(RIGHT_PANE_STORAGE_KEY) ?? ''),
      )
    } catch {
      // Treat unavailable storage like an unpersisted width.
    }

    const updateAdaptiveWidth = () => {
      if (hasPersistedRightPaneWidth.current) return
      setRightPaneWidth(clampRightPaneWidth(defaultRightPaneWidth()))
    }

    window.addEventListener('resize', updateAdaptiveWidth)
    return () => window.removeEventListener('resize', updateAdaptiveWidth)
  }, [])

  const setPaneWidth = useCallback((width: number, persist = false) => {
    const nextWidth = clampRightPaneWidth(width)
    rightPaneRef.current?.style.setProperty('--right-pane-width', `${nextWidth}px`)
    if (persist) {
      hasPersistedRightPaneWidth.current = true
      setRightPaneWidth(nextWidth)
      persistRightPaneWidth(nextWidth)
    }
    return nextWidth
  }, [])

  const finishResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeState.current
    if (!drag || event.pointerId !== drag.pointerId) return
    if (resizeFrame.current !== null) {
      window.cancelAnimationFrame(resizeFrame.current)
      resizeFrame.current = null
    }
    setPaneWidth(drag.latestWidth, true)
    resizeState.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const previous = previousDocumentStyles.current
    if (previous) {
      document.documentElement.style.userSelect = previous.userSelect
      document.documentElement.style.cursor = previous.cursor
      previousDocumentStyles.current = null
    }
    setResizingRightPane(false)
  }, [setPaneWidth])

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !rightPaneRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startWidth = rightPaneRef.current.getBoundingClientRect().width
    resizeState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      latestWidth: startWidth,
    }
    previousDocumentStyles.current = {
      userSelect: document.documentElement.style.userSelect,
      cursor: document.documentElement.style.cursor,
    }
    document.documentElement.style.userSelect = 'none'
    document.documentElement.style.cursor = 'col-resize'
    setResizingRightPane(true)
  }, [])

  const resizePane = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeState.current
    if (!drag || event.pointerId !== drag.pointerId) return
    drag.latestWidth = clampRightPaneWidth(drag.startWidth + drag.startX - event.clientX)
    if (resizeFrame.current !== null) return
    resizeFrame.current = window.requestAnimationFrame(() => {
      resizeFrame.current = null
      const activeDrag = resizeState.current
      if (activeDrag) setPaneWidth(activeDrag.latestWidth)
    })
  }, [setPaneWidth])

  const resetPaneWidth = useCallback(() => {
    setPaneWidth(defaultRightPaneWidth(), true)
  }, [setPaneWidth])

  useEffect(() => () => {
    if (resizeFrame.current !== null) window.cancelAnimationFrame(resizeFrame.current)
    const previous = previousDocumentStyles.current
    if (previous) {
      document.documentElement.style.userSelect = previous.userSelect
      document.documentElement.style.cursor = previous.cursor
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full">
      <div
        className={cn(
          'w-full shrink-0 flex-col border-r md:flex md:w-[320px]',
          mobileDetail ? 'hidden md:flex' : 'flex',
        )}
      >
        {left}
      </div>

      <div className={cn('min-w-0 flex-1 flex-col md:flex', mobileDetail ? 'flex' : 'hidden')}>
        {middle}
      </div>

      <div
        role="separator"
        aria-label={separatorLabel}
        aria-orientation="vertical"
        title="Drag to resize · Double-click to reset"
        className={cn(
          'group relative hidden w-[7px] shrink-0 cursor-col-resize touch-none md:block',
          resizingRightPane && 'bg-muted/60',
        )}
        onPointerDown={startResize}
        onPointerMove={resizePane}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onLostPointerCapture={finishResize}
        onDoubleClick={resetPaneWidth}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-muted-foreground/50',
            resizingRightPane && 'bg-muted-foreground/60',
          )}
        />
      </div>

      {right({ paneRef: rightPaneRef, desktopWidth: rightPaneWidth })}
    </div>
  )
}
