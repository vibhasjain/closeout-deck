// HyperTrack employee gate for /product/*, sharing /answers and /job sessions.
const API = 'https://agent-keyboard.fly.dev/sites/closeout-jobs'
const COOKIE = 'ht_product_session'
const TTL = 10 * 60 * 1000
const cache = new Map() // ponytail: per-isolate cache; revocation lags up to 10 min.

async function valid(token) {
  if (typeof token !== 'string' || !token) return false
  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) return hit.ok
  cache.delete(token)
  try {
    const res = await fetch(`${API}/files/answers/answers.json`, { headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-0' } })
    await res.body?.cancel()
    cache.set(token, { ok: res.ok, until: Date.now() + TTL })
    return res.ok
  } catch { return false }
}

function cookie(context, value, maxAge) {
  context.cookies.set({ name: COOKIE, value, path: '/product', maxAge, httpOnly: true, secure: true, sameSite: 'Lax' })
}
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

function form() {
  return new Response(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Closeout</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script src="/job/config.js"></script>
<style>
:root { --background: 0 0% 100%; --foreground: 0 0% 9%; --muted: 0 0% 96%; --muted-foreground: 0 0% 42%; --border: 0 0% 90%; --sans: 'Inter', ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { font-family: var(--sans); font-size: 13px; line-height: 1.5; color: hsl(var(--foreground)); background: hsl(var(--background)); -webkit-font-smoothing: antialiased; }
.gate { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; text-align: center; color: hsl(var(--muted-foreground)); font-size: 12px; background: hsl(var(--muted)); }
.card { width: 100%; max-width: 360px; background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: .75rem; box-shadow: 0 1px 3px rgb(0 0 0 / .06); padding: 2rem 1.75rem 1.5rem; display: flex; flex-direction: column; align-items: center; gap: .5rem; text-align: center; }
.card-logo { height: 32px; margin-bottom: .5rem; }
.card-title { margin: 0; font-size: 18px; font-weight: 600; color: hsl(var(--foreground)); }
.card-sub { margin: 0 0 1rem; font-size: 13px; color: hsl(var(--muted-foreground)); }
.card-btn { min-height: 44px; display: flex; justify-content: center; }
.err { color: hsl(0 70% 45%); font-size: 12.5px; margin: 0; min-height: 1em; }
</style></head><body>
<div class="gate"><div class="card">
  <img src="/logo-small.svg" alt="HyperTrack" class="card-logo">
  <h1 class="card-title">Closeout</h1>
  <p class="card-sub">Sign in with your hypertrack.io Google account.</p>
  <div id="btn" class="card-btn"></div>
  <p id="gateErr" class="err" role="alert"></p>
</div></div>
<script>
;(async () => {
  const KEY = 'job:viewer-session:v1'
  const post = body => fetch('/product/__gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  let s
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null') } catch {}
  if (s && s.sessionToken && s.exp * 1000 > Date.now()) {
    try { const res = await post({ sessionToken: s.sessionToken, exp: s.exp }); if (res.status === 204) { location.reload(); return } } catch {}
    try { localStorage.removeItem(KEY) } catch {}
  }
  const error = () => { document.getElementById('gateErr').textContent = 'hypertrack.io accounts only.' }
  const go = () => {
    google.accounts.id.initialize({
      client_id: window.__GOOGLE_CLIENT_ID, auto_select: true,
      callback: async ({ credential }) => {
        try {
          const res = await post({ idToken: credential })
          if (!res.ok) return error()
          const session = await res.json(); try { localStorage.setItem(KEY, JSON.stringify(session)) } catch {}
          location.reload()
        } catch { error() }
      },
    })
    google.accounts.id.renderButton(document.getElementById('btn'), { theme: 'outline', size: 'large', text: 'signin_with' })
    google.accounts.id.prompt()
  }
  if (window.google) return go()
  const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.onload = go; sc.onerror = error; document.head.appendChild(sc)
})()
</script></body></html>`, { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } })
}

export default async (request, context) => {
  const path = new URL(request.url).pathname
  if (request.method === 'POST' && path === '/product/__gate') {
    const data = await request.json().catch(() => null)
    if (typeof data?.idToken === 'string' && data.idToken) {
      try {
        const res = await fetch(`${API}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: data.idToken }) })
        if (!res.ok) { await res.body?.cancel(); throw new Error('Session rejected') }
        const session = await res.json()
        const now = Math.floor(Date.now() / 1000)
        if (typeof session.sessionToken !== 'string' || !session.sessionToken || !Number.isFinite(session.exp) || session.exp <= now) throw new Error('Invalid session')
        cookie(context, session.sessionToken, session.exp - now)
        cache.set(session.sessionToken, { ok: true, until: Date.now() + TTL })
        return json(session)
      } catch { return json({ error: 'hypertrack.io accounts only' }, 403) }
    }
    if (!await valid(data?.sessionToken)) return json({ error: 'Sign in required' }, 401)
    const now = Math.floor(Date.now() / 1000)
    cookie(context, data.sessionToken, Number.isFinite(data.exp) && data.exp > now ? data.exp - now : 12 * 60 * 60)
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  }
  if (request.method === 'GET' && path === '/product/__logout') {
    cookie(context, '', 0)
    return new Response(null, { status: 303, headers: { location: '/product/', 'cache-control': 'no-store' } })
  }
  if (await valid(context.cookies.get(COOKIE))) {
    const res = await context.next()
    res.headers.set('x-robots-tag', 'noindex')
    return res
  }
  if (request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html')) return form()
  return new Response('Sign in required', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}
