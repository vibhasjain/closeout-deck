export const API = 'https://agent-keyboard.fly.dev/sites/closeout-jobs'
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

export { valid }

export function remember(token) {
  cache.set(token, { ok: true, until: Date.now() + TTL })
}
