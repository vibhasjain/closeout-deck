// Password gate for /report/* — the reliability report is unpublished WIP.
// Password lives in the REPORT_PASSWORD env var (this repo is public — never
// hardcode it). Correct password sets a 1-year cookie whose value is the
// password's SHA-256, so entering it once survives hard refreshes and
// rotating the env var invalidates every cookie.
const COOKIE = 'ht_report_ok'

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function form(error) {
  return new Response(
    `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Restricted</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #0a0a0a; color: #e5e5e5;
         font: 16px/1.5 "Space Grotesk", Inter, system-ui, sans-serif; }
  form { text-align: center; }
  p { color: #a3a3a3; margin: 0 0 16px; }
  input { background: #161618; color: #e5e5e5; border: 1px solid #333;
          border-radius: 8px; padding: 10px 14px; font: inherit; width: 220px; }
  input:focus { outline: none; border-color: #22c55e; }
  button { background: #22c55e; color: #0a0a0a; border: 0; border-radius: 8px;
           padding: 10px 18px; font: inherit; font-weight: 600; margin-left: 8px;
           cursor: pointer; }
  .err { color: #ef4444; margin-top: 12px; }
</style>
<form method="post">
  <p>This report is password protected.</p>
  <input type="password" name="password" autofocus autocomplete="current-password">
  <button>Enter</button>
  ${error ? '<div class="err">Wrong password.</div>' : ''}
</form>`,
    { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } },
  )
}

export default async (request, context) => {
  const password = Netlify.env.get('REPORT_PASSWORD')
  if (!password) return new Response('Report gate not configured.', { status: 503 })
  const token = await sha256Hex(password)

  if (context.cookies.get(COOKIE) === token) {
    const res = await context.next()
    res.headers.set('x-robots-tag', 'noindex')
    return res
  }

  if (request.method === 'POST') {
    const data = await request.formData().catch(() => null)
    if (data?.get('password') === password) {
      context.cookies.set({
        name: COOKIE,
        value: token,
        path: '/report',
        maxAge: 365 * 24 * 60 * 60,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      })
      return new Response(null, { status: 303, headers: { location: new URL(request.url).pathname } })
    }
    return form(true)
  }

  return form(false)
}
