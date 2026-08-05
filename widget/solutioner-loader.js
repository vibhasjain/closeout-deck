/* HyperTrack solutioning widget — loader (default-on).
 * Renders for everyone by default. Kill switch: ?solutioner=0 in the URL OR
 * localStorage ht_sol_off disables it. ht_sol_qa + ?solutioner_api= stay as
 * QA-only hooks (localhost API target override), not the visibility gate.
 * Owns identity (anon id + distinct id), the opening prefetch cache, the
 * per-host Turnstile site key, and the launcher; the panel module owns the
 * conversation + capture affordances. */
(function () {
  'use strict';

  var WIDGET_VERSION = '20260702e';
  var SURFACE = 'landing_widget';
  // Cloudflare Turnstile site key. Bot protection for public /session creation
  // (the backend verifies the token only when TURNSTILE_SECRET_KEY is set;
  // empty secret => skipped). Same key for prod + staging origins; localhost
  // gets '' so the invisible challenge is skipped entirely in dev.
  var TURNSTILE_SITE_KEY = '0x4AAAAAADjoPh9HBX07Bz1n';
  var script = document.currentScript;
  var BASE = script && script.src ? script.src.slice(0, script.src.lastIndexOf('/') + 1) : 'widget/';
  var CSS_URL = BASE + 'solutioner.css?v=' + WIDGET_VERSION;
  var JS_URL = BASE + 'solutioner.js?v=' + WIDGET_VERSION;
  // The diagram is now the SAME component the dashboard solutioner renders,
  // bundled (React + the real DiagramCanvas) into one self-contained IIFE that
  // exposes window.HTSolutionDiagram. No hand-written vanilla port to re-polish.
  var DIAGRAM_URL = BASE + 'solution-diagram.bundle.js?v=' + WIDGET_VERSION;
  var ANON_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7-day sliding window
  var OPENING_TTL_MS = 60 * 60 * 1000;       // 1h opening cache

  // Default-on: render for everyone. Kill switch: ?solutioner=0 in the URL OR
  // localStorage ht_sol_off (set once, sticks for return visits).
  function enabled() {
    try {
      if (new URLSearchParams(location.search).get('solutioner') === '0') return false;
      if (window.localStorage && localStorage.getItem('ht_sol_off')) return false;
    } catch (e) { /* silent — default to enabled */ }
    return true;
  }

  // QA-only override (?solutioner_api=http://localhost:8031): requires the
  // ht_sol_qa flag AND a localhost target — a crafted public link must never
  // be able to redirect the conversation (identity + message text) to a
  // foreign origin. Default: the phone-capture form's hostname switch.
  function apiBase() {
    try {
      if (window.localStorage && localStorage.getItem('ht_sol_qa')) {
        var qa = new URLSearchParams(location.search).get('solutioner_api');
        if (qa && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(qa)) {
          return qa.replace(/\/+$/, '');
        }
      }
    } catch (e) { /* silent */ }
    var host = location.hostname;
    return (host === 'localhost' || host === '127.0.0.1') ? 'http://localhost:8001'
      : /(^|\.)hypertrack\.(com|io|ai)$/.test(host) ? 'https://agents.labs.hypertrack.ai'
      : 'https://staging.agents.labs.hypertrack.ai';
  }

  // Per-host Turnstile site key. localhost/127.0.0.1 get '' so the challenge is
  // skipped in dev (matches the backend's empty-secret skip); every deployed
  // origin — prod (hypertrack.com/.io/.ai), staging (*.htdev.hypertrack.com,
  // which matches the prod suffix), and the unlisted *.cloudfront.net mirrors —
  // gets the real key.
  function turnstileSiteKey() {
    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return '';
    return TURNSTILE_SITE_KEY;
  }

  function uuidv4() {
    try {
      if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = Array.prototype.map.call(bytes, function (b) {
        return (b + 256).toString(16).slice(1);
      }).join('');
      return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
        hex.slice(16, 20) + '-' + hex.slice(20);
    } catch (e) {
      // Non-crypto fallback — only hit on ancient browsers.
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
  }

  // Anonymous id with a 7-day sliding TTL (ht_sol_last_active). distinct_id is
  // computed ONCE per page load and reused for /opening and /session so the
  // sticky variant assignment pins to the same visitor key.
  function identity() {
    var anonId = null;
    try {
      var now = Date.now();
      var last = parseInt(localStorage.getItem('ht_sol_last_active') || '0', 10);
      anonId = localStorage.getItem('ht_sol_anon_id');
      if (!anonId || !last || now - last > ANON_TTL_MS) {
        anonId = uuidv4();
        localStorage.setItem('ht_sol_anon_id', anonId);
        localStorage.removeItem('ht_sol_session');
        localStorage.removeItem('ht_sol_variant');
      }
      localStorage.setItem('ht_sol_last_active', String(now));
    } catch (e) {
      anonId = anonId || uuidv4(); // storage unavailable — per-page identity
    }
    var distinctId = null;
    try {
      if (window.posthog && typeof window.posthog.get_distinct_id === 'function') {
        distinctId = window.posthog.get_distinct_id();
      }
    } catch (e) { /* silent */ }
    distinctId = (typeof distinctId === 'string' && distinctId) ? distinctId : anonId;
    try {
      if (window.posthog && typeof window.posthog.register === 'function') {
        window.posthog.register({ ht_sol_anon_id: anonId });
      }
    } catch (e) { /* silent */ }
    return { anonId: anonId, distinctId: distinctId.slice(0, 255) };
  }

  function capture(name, props) {
    try {
      if (window.posthog && typeof window.posthog.capture === 'function') {
        window.posthog.capture(name, props || {});
      }
    } catch (e) { /* silent */ }
  }

  function breakpoint() {
    var w = window.innerWidth;
    return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  }

  function openingCacheKey(distinctId) {
    return 'ht_sol_opening:' + SURFACE + ':' + distinctId;
  }

  // Idle prefetch of the opening variant so first open renders instantly.
  // Resolves true once a usable opening is cached (already-warm or freshly
  // fetched), false otherwise — the pre-expand chains on this so it never
  // paints a spinner.
  function prefetchOpening(api, id) {
    try {
      var raw = sessionStorage.getItem(openingCacheKey(id.distinctId));
      if (raw) {
        var hit = JSON.parse(raw);
        if (hit && hit.at && Date.now() - hit.at < OPENING_TTL_MS &&
            hit.data && hit.data.opening_message) {
          return Promise.resolve(true);
        }
      }
    } catch (e) { /* fall through to fetch */ }
    var url = api + '/api/solutioning/public/opening?surface=' + SURFACE +
      '&distinct_id=' + encodeURIComponent(id.distinctId);
    return fetch(url).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (data) {
      if (!data || !data.opening_message) return false;
      try {
        sessionStorage.setItem(
          openingCacheKey(id.distinctId),
          JSON.stringify({ at: Date.now(), data: data })
        );
        localStorage.setItem('ht_sol_variant', data.variant_id || '');
      } catch (e) { /* silent */ }
      return true;
    }).catch(function () { return false; });
  }

  // Pre-expand guardrails. prefers-reduced-motion and a per-session dismissal
  // both fall back to launcher-only; a returning visitor mid-conversation is
  // handled by the hasSession check at the call site.
  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function autoDismissedThisSession() {
    try {
      return !!(window.sessionStorage && sessionStorage.getItem('ht_sol_dismissed') === '1');
    } catch (e) { return false; }
  }

  // window.load, then idle (1.5s ceiling either way) — never compete with page render.
  function whenSettled(cb) {
    function idle() {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(function () { cb(); }, { timeout: 1500 });
      } else {
        setTimeout(cb, 1500);
      }
    }
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
  }

  function addLink(rel, href, as) {
    var l = document.createElement('link');
    l.rel = rel;
    l.href = href;
    if (as) l.as = as;
    document.head.appendChild(l);
  }

  function inject() {
    if (document.getElementById('ht-solutioner')) return;

    // Stylesheet now (the launcher needs it); prefetch the panel module for first click.
    addLink('stylesheet', CSS_URL);
    addLink('prefetch', JS_URL, 'script');

    var API_BASE = apiBase();
    var id = identity();

    var root = document.createElement('div');
    root.id = 'ht-solutioner';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'htw-launcher';
    btn.setAttribute('aria-label', 'Design my solution');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 1 1 16.1-3.8z"/></svg>' +
      '<span class="htw-launcher-label">Design my solution</span>';
    root.appendChild(btn);
    document.body.appendChild(root);

    // Repeat visitor with an existing conversation → unread dot on the launcher.
    var hasSession = false;
    try { hasSession = localStorage.getItem('ht_sol_session') === '1'; } catch (e) { /* silent */ }
    if (hasSession) {
      var dot = document.createElement('span');
      dot.className = 'htw-dot';
      dot.setAttribute('aria-hidden', 'true');
      btn.appendChild(dot);
    }

    var seenAt = Date.now();
    capture('landing_widget_seen', { widget_version: WIDGET_VERSION, breakpoint: breakpoint() });

    function panelCtx(trigger) {
      return {
        root: root,
        launcher: btn,
        trigger: trigger,
        seenAt: seenAt,
        widgetVersion: WIDGET_VERSION,
        capture: capture,
        apiBase: API_BASE,
        surface: SURFACE,
        anonId: id.anonId,
        distinctId: id.distinctId,
        turnstileSiteKey: turnstileSiteKey(),
        openingCacheKey: openingCacheKey(id.distinctId),
        diagramUrl: DIAGRAM_URL
      };
    }

    var modPromise = null;
    function loadModule() {
      if (!modPromise) modPromise = import(JS_URL);
      return modPromise;
    }

    btn.addEventListener('click', function () {
      // Record the click at the top so it lands even if the module import fails.
      capture('landing_widget_launcher_clicked', { widget_version: WIDGET_VERSION, breakpoint: breakpoint() });
      var d = btn.querySelector('.htw-dot');
      if (d) d.remove();
      loadModule().then(function (mod) {
        mod.open(panelCtx('launcher'));
      }).catch(function () { modPromise = null; });
    });

    // Pre-expand (default-on): a fresh visitor arrives with the opening already
    // showing instead of a bare launcher. Skipped for a returning visitor with
    // an in-progress conversation, when reduced-motion is preferred, or after a
    // dismissal this session. Renders only from the prefetched opening so it
    // never shows a spinner; if the prefetch isn't usable, we stay launcher-only.
    function shouldAutoExpand() {
      if (hasSession) return false;
      if (prefersReducedMotion()) return false;
      if (autoDismissedThisSession()) return false;
      return true;
    }

    prefetchOpening(API_BASE, id).then(function (ready) {
      if (!ready || !shouldAutoExpand()) return;
      loadModule().then(function (mod) {
        if (typeof mod.autoStart === 'function') mod.autoStart(panelCtx('auto'));
      }).catch(function () { modPromise = null; });
    });
  }

  if (enabled()) whenSettled(inject);
})();
