/**
 * Hard no-zoom EVERYWHERE — mobile and desktop. iOS Safari ignores `user-scalable=no` /
 * `maximum-scale`, so we block it in JS: pinch-zoom via the Safari gesture events +
 * multi-touch touchmove. Desktop trackpad pinch arrives as ctrl+wheel; keyboard zoom as
 * cmd/ctrl plus/minus/0 (best-effort — some browsers reserve it). Double-tap zoom is
 * blocked by `touch-action: pan-x pan-y` on * (CSS) plus a touchend guard here, and
 * focus-zoom by 16px inputs (CSS). A visualViewport watchdog re-clamps scale to 1 if
 * a zoom ever slips through — iOS otherwise persists it across reloads.
 */
const prevent = (e: Event) => e.preventDefault()

export function installNoZoom() {
  // No native right-click menu anywhere — the product's own row menus handle it.
  document.addEventListener('contextmenu', prevent)

  for (const evt of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(evt, prevent, { passive: false })
  }
  // Desktop: trackpad pinch fires wheel events with ctrlKey set.
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault()
    },
    { passive: false },
  )
  // Best-effort keyboard zoom block (cmd/ctrl +, -, =, 0).
  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.metaKey || e.ctrlKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault()
    },
    { passive: false },
  )
  document.addEventListener(
    'touchmove',
    (e) => {
      // any pinch (2+ fingers, or a non-1 scale) is a zoom attempt -> kill it
      const scale = (e as TouchEvent & { scale?: number }).scale
      if (e.touches.length > 1 || (scale !== undefined && scale !== 1)) e.preventDefault()
    },
    { passive: false },
  )
  // Double-tap zoom is single-touch and never fires gesture events, so the handlers
  // above can't see it: swallow the second tap unless it lands on something clickable
  // (controls, or anything under cursor:pointer — cursor inherits).
  let lastTouchEnd = 0
  document.addEventListener(
    'touchend',
    (e) => {
      const now = performance.now()
      if (now - lastTouchEnd < 350 && e.target instanceof Element) {
        const clickable =
          e.target.closest('button, a, input, select, textarea, label') ||
          getComputedStyle(e.target).cursor === 'pointer'
        if (!clickable) e.preventDefault()
      }
      lastTouchEnd = now
    },
    { passive: false },
  )
  // iOS keeps page zoom across reloads and ignores maximum-scale for user zoom, so any
  // zoom that slips through sticks forever (the blockers above even stop the pinch back
  // out). Rewriting the viewport meta makes Safari re-clamp the scale to 1.
  const meta = document.querySelector('meta[name="viewport"]')
  const metaContent = meta?.getAttribute('content') ?? ''
  const resetZoom = () => {
    const vv = window.visualViewport
    if (!meta || !vv || Math.abs(vv.scale - 1) < 0.02) return
    meta.setAttribute('content', `${metaContent}, minimum-scale=1.0`)
    requestAnimationFrame(() => meta.setAttribute('content', metaContent))
  }
  window.visualViewport?.addEventListener('resize', resetZoom)
  window.addEventListener('pageshow', resetZoom)
}
