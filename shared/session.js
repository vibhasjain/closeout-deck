// One Google sign-in for /product, /answers and /job. They share an origin, so they share localStorage:
// every sign-in exchanges the same Google credential with BOTH backends and every sign-out clears both.
//   jobs     → Agent Keyboard, site closeout-jobs (/answers, /job)  → localStorage job:viewer-session:v1
//   closeout → the Closeout agent (/product)                          → localStorage closeout:session:v1
// Plain script: /answers loads it with <script src="/shared/session.js">; the Vite apps import it for its
// side effect. Either way it sets globalThis.CloseoutSession. Types: session.d.ts next to this file.
;(function () {
  'use strict'
  var KEYS = { jobs: 'job:viewer-session:v1', closeout: 'closeout:session:v1' }
  var URLS = {
    jobs: 'https://agent-keyboard.fly.dev/sites/closeout-jobs/session',
    closeout: 'https://closeout-agent.fly.dev/session',
  }
  var GSI = 'https://accounts.google.com/gsi/client'

  // Only the fields every app reads; anything else in the response is dropped.
  function clean(s) {
    if (!s || typeof s !== 'object') return null
    if (typeof s.sessionToken !== 'string' || !s.sessionToken) return null
    if (typeof s.exp !== 'number' || !isFinite(s.exp) || s.exp * 1000 <= Date.now()) return null
    if (typeof s.email !== 'string' || !s.email) return null
    var out = { sessionToken: s.sessionToken, exp: s.exp, email: s.email }
    if (typeof s.name === 'string') out.name = s.name
    if (typeof s.picture === 'string') out.picture = s.picture
    return out
  }

  function get(which) {
    try { return clean(JSON.parse(localStorage.getItem(KEYS[which]) || 'null')) } catch (e) { return null }
  }

  function any() { return get('jobs') || get('closeout') }

  function mint(which, credential) {
    return fetch(URLS[which], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: credential }),
    }).then(function (res) {
      if (!res.ok) return { session: null, status: res.status }
      return res.json().then(function (body) {
        var s = clean(body)
        if (s) try { localStorage.setItem(KEYS[which], JSON.stringify(s)) } catch (e) { /* storage off: the page keeps it in memory */ }
        return { session: s, status: s ? res.status : 0 }
      })
    }).catch(function () { return { session: null, status: 0 } })
  }

  // Both exchanges run in parallel and neither failure blocks the other.
  function exchange(credential) {
    return Promise.all([mint('jobs', credential), mint('closeout', credential)]).then(function (r) {
      return { jobs: r[0], closeout: r[1] }
    })
  }

  function google() {
    var w = typeof window !== 'undefined' ? window : null
    return w && w.google && w.google.accounts && w.google.accounts.id ? w.google.accounts.id : null
  }

  function signOut() {
    for (var k in KEYS) try { localStorage.removeItem(KEYS[k]) } catch (e) { /* storage off */ }
    try { var id = google(); if (id) id.disableAutoSelect() } catch (e) { /* GSI not loaded */ }
  }

  function loadGoogle() {
    if (google()) return Promise.resolve(google())
    return new Promise(function (resolve, reject) {
      var sc = document.querySelector('script[src="' + GSI + '"]')
      if (!sc) { sc = document.createElement('script'); sc.src = GSI; sc.async = true; document.head.appendChild(sc) }
      sc.addEventListener('load', function () { google() ? resolve(google()) : reject(new Error('gsi')) })
      sc.addEventListener('error', function () { reject(new Error('gsi')) })
    })
  }

  // Silent Google One Tap (auto_select): a credential only if Google signs the user in without a click.
  // ponytail: Google allows one auto sign-in per ~10 minutes; after that this resolves null and the page
  // shows its normal sign-in button.
  function silentCredential(clientId, timeoutMs) {
    if (!clientId) return Promise.resolve(null)
    return loadGoogle().then(function (id) {
      return new Promise(function (resolve) {
        var done = false
        var timer = setTimeout(function () { try { id.cancel() } catch (e) { /* noop */ } finish(null) }, timeoutMs || 6000)
        function finish(v) { if (done) return; done = true; clearTimeout(timer); resolve(v) }
        id.initialize({ client_id: clientId, auto_select: true, callback: function (r) { finish((r && r.credential) || null) } })
        id.prompt(function (n) {
          if ((n.isSkippedMoment && n.isSkippedMoment()) || (n.isNotDisplayed && n.isNotDisplayed())) finish(null)
        })
      })
    }).catch(function () { return null })
  }

  // The page needs `which`. Have it → done. Only the other one → mint it silently. Neither → null (show sign-in).
  function ensure(which, clientId) {
    var own = get(which)
    if (own) return Promise.resolve(own)
    if (!any()) return Promise.resolve(null)
    return silentCredential(clientId).then(function (credential) {
      if (!credential) return null
      return exchange(credential).then(function (r) { return r[which].session })
    })
  }

  globalThis.CloseoutSession = { KEYS: KEYS, get: get, any: any, exchange: exchange, ensure: ensure, signOut: signOut }
})()
