/* HyperTrack solutioning widget — panel module (M3 PR3 diagram peek + PR4
 * capture flows + production readiness). Open/close chrome (PR1) + the
 * anonymous conversation (PR2): opening from the loader's prefetch cache, lazy
 * session creation on first interaction, SSE-streamed turns, restore on reload,
 * chips, and the full landing_widget_* PostHog taxonomy. PR3 adds the real
 * diagram peek: the affordance strip opens an overlay that lazy-loads the
 * solution-diagram bundle (window.HTSolutionDiagram — the SAME DiagramCanvas
 * the dashboard solutioner renders) and mounts the latest stored blueprint.
 * PR4 adds inline capture affordances (email / US-phone SMS handoff / signup
 * CTA) rendered from reserved action: choice ids with graceful degradation to
 * chips, the invisible Turnstile challenge warmed during BOOTING so a token is
 * ready at /session, and the migrate-param signup link. Dynamically imported by
 * solutioner-loader.js on launcher click. */

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const SEND_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
// Sitemap/diagram glyph for the subtle header "view diagram" affordance.
const DIAGRAM_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v3M6 16v-2.5h12V16"/></svg>';

// Turnstile site key arrives per-host from the loader (ctx.turnstileSiteKey).
// Empty = skip captcha entirely (the server also skips verification while it
// has no secret configured); localhost resolves to '' in the loader.
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_TOKEN_TTL_MS = 4 * 60 * 1000; // Cloudflare tokens expire ~5min; refresh past 4.

const STILL_THINKING_MS = 10000; // "Still thinking…" if no text yet
const NO_BYTE_TIMEOUT_MS = 45000; // abort a silent stream
const MAX_INPUT_CHARS = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const state = {
  status: 'closed', // panel visibility: 'closed' | 'open'
  // Conversation machine: 'boot' | 'opening' | 'creating' | 'streaming' | 'awaiting' | 'limited'
  convo: 'boot',
  booted: false,
  ctx: {},
  panel: null,
  bodyEl: null,
  inputEl: null,
  sendEl: null,
  statusEl: null,
  peekEl: null,
  backdropEl: null,
  modalEl: null,
  viewportEl: null,
  resetEl: null,
  openedAt: 0,
  scrollY: 0,
  locked: false,
  autoStarted: false, // opened via the pre-expand path (trigger:'auto')
  peekMode: false,    // mobile compact peek (non-modal); promotes to the full sheet on engage
  compact: false,     // pre-expand compact height (desktop docked or mobile peek) until engage
  engaged: false,     // user's first action fired (one-shot landing_widget_engaged)
  // conversation data
  sessionId: null,
  creating: null, // in-flight session-create promise (serializes double-sends)
  phase: null,
  variantId: null,
  turn: 0,
  abort: null,
  lastSend: null, // {message, choiceId} for retry
  pendingChips: null,
  diagram: null,
  peekShown: false,
  modalOpen: false,
  modalOpenedAt: 0,
  diagramMod: null, // memoized loader promise for window.HTSolutionDiagram (the bundle)
  diagramHandle: null, // mount handle from window.HTSolutionDiagram.mount()
  renderedDiagram: null, // identity of the blueprint currently in the DOM
  diagramRerenderTimer: 0, // debounce id for live blueprint deltas while the modal is open
  stillTimer: 0,
  byteTimer: 0,
  gotText: false,
  // Turnstile token cache: token + when it was minted, plus the live widget id
  // and an in-flight execution promise (so concurrent session-creates share one).
  captchaToken: null,
  captchaAt: 0,
  captchaWidgetId: null,
  captchaExec: null,
  captchaFailEl: null
};

/* --- analytics ---------------------------------------------------------- */

function breakpoint() {
  const w = window.innerWidth;
  return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
}

function capture(name, props) {
  if (typeof state.ctx.capture === 'function') {
    state.ctx.capture(name, props);
    return;
  }
  try {
    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture(name, props || {});
    }
  } catch (e) { /* silent */ }
}

function track(name, props) {
  capture(name, Object.assign({
    widget_version: state.ctx.widgetVersion,
    variant_id: state.variantId || null,
    session_id: state.sessionId || null,
    anonymous_id: state.ctx.anonId || null,
    phase: state.phase || null,
    breakpoint: breakpoint()
  }, props || {}));
}

function trackError(errorType, httpStatus) {
  track('landing_widget_error', { error_type: errorType, http_status: httpStatus || null });
}

function touchActive() {
  try { localStorage.setItem('ht_sol_last_active', String(Date.now())); } catch (e) { /* silent */ }
}

function isMobile() {
  return window.matchMedia('(max-width: 639.98px)').matches;
}

function root() {
  return state.ctx.root || document.getElementById('ht-solutioner');
}

/* --- API ---------------------------------------------------------------- */

function api(path) {
  return (state.ctx.apiBase || '') + '/api/solutioning/public' + path;
}

function openingFromCache() {
  try {
    const raw = sessionStorage.getItem(state.ctx.openingCacheKey);
    if (!raw) return null;
    const hit = JSON.parse(raw);
    if (hit && hit.data && hit.at && Date.now() - hit.at < 60 * 60 * 1000) return hit.data;
  } catch (e) { /* silent */ }
  return null;
}

async function fetchOpening() {
  const url = api('/opening') + '?surface=' + (state.ctx.surface || 'landing_widget') +
    '&distinct_id=' + encodeURIComponent(state.ctx.distinctId || state.ctx.anonId);
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error('opening failed'), { httpStatus: res.status });
  const data = await res.json();
  try {
    sessionStorage.setItem(state.ctx.openingCacheKey, JSON.stringify({ at: Date.now(), data }));
    localStorage.setItem('ht_sol_variant', data.variant_id || '');
  } catch (e) { /* silent */ }
  return data;
}

async function apiCreateSession() {
  const body = {
    anonymous_id: state.ctx.anonId,
    distinct_id: state.ctx.distinctId || state.ctx.anonId
  };
  const token = await getCaptchaToken();
  if (token) {
    body.captcha_token = token;
    // Turnstile tokens are single-use; drop it so the next create re-executes.
    state.captchaToken = null;
    state.captchaAt = 0;
  }
  const res = await fetch(api('/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw Object.assign(new Error('session failed'), { httpStatus: res.status });
  return res.json();
}

async function apiDeleteSession() {
  await fetch(api('/session'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anonymous_id: state.ctx.anonId })
  });
}

/* --- Turnstile (invisible, lazy; only when a site key is configured) ------
 * The challenge runs once during BOOTING so a token is ready at /session
 * creation (POST captcha_token). Tokens are cached and re-executed past
 * TURNSTILE_TOKEN_TTL_MS. The widget renders into an offscreen holder kept in
 * the panel (invisible/managed mode shows no UI on success). On failure we do
 * one silent retry, then surface a visible "verification failed" retry row.
 * Empty key (localhost) skips everything — getCaptchaToken resolves null. */

let turnstileLoad = null;

function turnstileKey() {
  return state.ctx.turnstileSiteKey || '';
}

function loadTurnstile() {
  if (turnstileLoad) return turnstileLoad;
  turnstileLoad = new Promise((resolve) => {
    if (window.turnstile) { resolve(); return; }
    const s = document.createElement('script');
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve(); // resolve anyway; token path degrades to null
    document.head.appendChild(s);
  });
  return turnstileLoad;
}

function tokenFresh() {
  return state.captchaToken && (Date.now() - state.captchaAt) < TURNSTILE_TOKEN_TTL_MS;
}

// Render-and-execute one invisible challenge into an offscreen holder; resolves
// the token (or null on error/timeout). Each call uses a fresh holder so a
// stale widget id can't leak between executions.
function runTurnstile(key) {
  return loadTurnstile().then(() => new Promise((resolve) => {
    if (!window.turnstile) { resolve(null); return; }
    let settled = false;
    const holder = document.createElement('div');
    holder.className = 'htw-turnstile';
    if (state.panel) state.panel.appendChild(holder);
    const done = (token) => {
      if (settled) return;
      settled = true;
      try { if (state.captchaWidgetId != null) window.turnstile.remove(state.captchaWidgetId); } catch (e) { /* silent */ }
      state.captchaWidgetId = null;
      holder.remove();
      resolve(token);
    };
    try {
      state.captchaWidgetId = window.turnstile.render(holder, {
        sitekey: key,
        size: 'invisible',
        callback: (token) => done(token),
        'error-callback': () => done(null),
        'timeout-callback': () => done(null)
      });
    } catch (e) {
      done(null);
    }
    setTimeout(() => done(null), 20000);
  }));
}

// Returns a usable captcha token for session-create, or null when captcha is
// disabled for this host. Caches the token; one silent retry on failure, then
// a visible retry affordance. Concurrent callers share one execution.
function getCaptchaToken() {
  const key = turnstileKey();
  if (!key) return Promise.resolve(null);
  if (tokenFresh()) return Promise.resolve(state.captchaToken);
  if (state.captchaExec) return state.captchaExec;

  state.captchaExec = runTurnstile(key)
    .then((token) => token || runTurnstile(key)) // one silent retry
    .then((token) => {
      if (token) {
        clearCaptchaFailure();
        state.captchaToken = token;
        state.captchaAt = Date.now();
      } else {
        showCaptchaFailure();
        track('landing_widget_captcha_failed', {});
      }
      return token;
    })
    .catch(() => null)
    .finally(() => { state.captchaExec = null; });
  return state.captchaExec;
}

// Kick the invisible challenge off during BOOTING so the token is warm before
// the first send. Fire-and-forget; failures surface their own retry row.
function warmCaptcha() {
  if (!turnstileKey()) return;
  if (tokenFresh() || state.captchaExec) return;
  getCaptchaToken();
}

function showCaptchaFailure() {
  if (state.captchaFailEl || !state.bodyEl) return;
  const row = document.createElement('div');
  row.className = 'htw-retry htw-captcha-fail';
  const msg = document.createElement('span');
  msg.textContent = 'Verification failed.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'htw-retry-btn';
  btn.textContent = 'Retry';
  btn.addEventListener('click', () => {
    clearCaptchaFailure();
    getCaptchaToken();
  });
  row.appendChild(msg);
  row.appendChild(btn);
  state.bodyEl.appendChild(row);
  state.captchaFailEl = row;
  scrollToBottom();
}

function clearCaptchaFailure() {
  if (state.captchaFailEl) {
    state.captchaFailEl.remove();
    state.captchaFailEl = null;
  }
}

/* --- minimal markdown (textContent-based — never innerHTML of model output) */

function inlineMd(parent, text) {
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith('**')) {
      const b = document.createElement('strong');
      b.textContent = tok.slice(2, -2);
      parent.appendChild(b);
    } else {
      const mm = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(tok);
      let url = null;
      try { url = new URL(mm[2]); } catch (e) { /* renders as text below */ }
      // Reject credential-bearing URLs (userinfo host-spoofing) and anything
      // non-http(s); the raw token renders as plain text instead.
      if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
        parent.appendChild(document.createTextNode(tok));
      } else {
        const a = document.createElement('a');
        a.textContent = mm[1];
        a.href = url.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        parent.appendChild(a);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function renderMarkdown(el, text) {
  el.textContent = '';
  for (const block of String(text).split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) continue;
    const isUl = lines.every((l) => /^\s*[-*•]\s+/.test(l));
    const isOl = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    if (isUl || isOl) {
      const list = document.createElement(isUl ? 'ul' : 'ol');
      for (const l of lines) {
        const li = document.createElement('li');
        inlineMd(li, l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''));
        list.appendChild(li);
      }
      el.appendChild(list);
    } else {
      const p = document.createElement('p');
      lines.forEach((l, i) => {
        if (i) p.appendChild(document.createElement('br'));
        inlineMd(p, l);
      });
      el.appendChild(p);
    }
  }
}

/* --- transcript rendering ------------------------------------------------ */

// Soft scroll respects a reader who scrolled up (only sticks when already
// near the bottom); user-initiated moments pass force=true.
function scrollToBottom(force) {
  const el = state.bodyEl;
  if (!el) return;
  if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
    el.scrollTop = el.scrollHeight;
  }
}

function addBubble(role, text) {
  const el = document.createElement('div');
  el.className = 'htw-msg htw-msg-' + role;
  if (role === 'assistant') renderMarkdown(el, text);
  else el.textContent = text;
  state.bodyEl.appendChild(el);
  scrollToBottom(role === 'user');
  return el;
}

// Reserved choice-id → inline capture affordance. The backend (web_widget
// agent) drives capture conversationally today and does not emit these ids,
// but the contract is forward-compatible: any choice whose id matches renders
// the affordance instead of a plain chip; unknown action: ids and all normal
// ids fall through to chips. See README / PR body for the contract.
const CAPTURE_ACTIONS = {
  'action:capture_email': 'email',
  'action:capture_phone_sms': 'phone_sms',
  'action:signup_link': 'signup'
};

function captureType(choice) {
  return (choice && typeof choice.id === 'string') ? CAPTURE_ACTIONS[choice.id] || null : null;
}

let captureSeq = 0;
function captureFieldId(kind) {
  captureSeq += 1;
  return 'htw-cap-' + kind + '-' + captureSeq;
}

// Renders a choices payload: reserved action: ids become inline affordances
// (each its own block); everything else collects into one chip row. Muted
// (superseded) renders all as inert chips. On `restore`, capture actions are
// never built as live inline inputs — a reloaded transcript shouldn't surface
// a stale, pre-filled capture field; the agent re-offers in a fresh turn (the
// action falls through to a plain chip).
function addChips(choices, opts) {
  if (!Array.isArray(choices) || !choices.length) return null;
  const muted = !!(opts && opts.muted);
  const restore = !!(opts && opts.restore);
  const plain = [];
  let firstNode = null;
  for (const c of choices) {
    if (!c || !c.label) continue;
    const kind = (muted || restore) ? null : captureType(c);
    if (kind) {
      const block = buildCaptureAffordance(kind, c);
      if (block) {
        state.bodyEl.appendChild(block);
        if (!firstNode) firstNode = block;
        track('landing_widget_capture_shown', { capture_type: kind });
        continue;
      }
    }
    plain.push(c); // normal choice OR unknown action: id (graceful degrade)
  }
  let chipRow = null;
  if (plain.length) {
    chipRow = document.createElement('div');
    chipRow.className = 'htw-chips';
    for (const c of plain) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'htw-chip';
      chip.textContent = c.label;
      if (c.description) chip.title = c.description;
      if (muted) chip.disabled = true;
      else chip.addEventListener('click', () => onChipClick(chipRow, chip, c));
      chipRow.appendChild(chip);
    }
    state.bodyEl.appendChild(chipRow);
    if (!firstNode) firstNode = chipRow;
  }
  scrollToBottom();
  return firstNode;
}

// Disable an affordance block after it's been used so the same capture point
// can't be submitted twice (mirrors chip one-shot behaviour).
function retireAffordance(block) {
  block.classList.add('htw-cap-done');
  for (const el of block.querySelectorAll('input, button')) el.disabled = true;
}

// In-flight guard shared with onSubmit/onChipClick: a capture input must not
// fire while a stream/create is running or after the demo ceiling.
function convoBusy() {
  return state.convo === 'streaming' || state.convo === 'creating' || state.convo === 'limited';
}

// Shared finalizer for a validated capture submit. `value` is the message sent
// to the agent — exactly what typing it would do. NEVER pass the value into
// props; only the non-PII `captureType` tag goes to analytics.
function submitCapture(block, value, choiceId, event, capType) {
  retireAffordance(block);
  muteAllChips();
  touchActive();
  track(event, { capture_type: capType });
  addBubble('user', value);
  state.turn++;
  state.lastSend = { message: value, choiceId };
  streamTurn(value, choiceId);
}

function buildCaptureAffordance(kind, choice) {
  if (kind === 'email') return buildEmailCapture(choice);
  if (kind === 'phone_sms') return buildPhoneCapture(choice);
  if (kind === 'signup') return buildSignupCapture(choice);
  return null;
}

// Inline email input + submit. On submit, the email is sent as the user
// message (exactly what typing it would do) so the backend's capture_contact
// tool fires model-side. The email value is NEVER put into analytics props.
function buildEmailCapture(choice) {
  const block = document.createElement('form');
  block.className = 'htw-capture htw-capture-email';
  const label = document.createElement('label');
  label.className = 'htw-capture-label';
  label.textContent = choice.label;
  block.appendChild(label);
  const rowEl = document.createElement('div');
  rowEl.className = 'htw-capture-row';
  const input = document.createElement('input');
  input.type = 'email';
  input.className = 'htw-capture-input';
  input.placeholder = 'you@company.com';
  input.autocomplete = 'email';
  input.setAttribute('aria-label', 'Work email');
  input.maxLength = 254;
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'htw-capture-submit';
  submit.textContent = 'Send';
  rowEl.appendChild(input);
  rowEl.appendChild(submit);
  block.appendChild(rowEl);
  const err = document.createElement('span');
  err.className = 'htw-capture-err';
  err.hidden = true;
  block.appendChild(err);

  const id = input.id = captureFieldId('email');
  label.htmlFor = id;

  block.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.disabled || convoBusy()) return;
    const val = input.value.trim();
    if (!EMAIL_RE.test(val) || val.length > 254) {
      err.textContent = 'Enter a valid email address.';
      err.hidden = false;
      input.focus();
      return;
    }
    err.hidden = true;
    submitCapture(block, val, choice.id, 'landing_widget_contact_shared', 'email');
  });
  return block;
}

// Inline US phone input reusing the hero form's usDigits/formatUS logic. On
// submit, the formatted number is sent as the user message → the agent's
// offer_sms_continuation path (M4b) provisions the SMS rail and streams a
// verbatim text confirmation. Phone value is NEVER in analytics props.
function buildPhoneCapture(choice) {
  const block = document.createElement('form');
  block.className = 'htw-capture htw-capture-phone';
  const label = document.createElement('label');
  label.className = 'htw-capture-label';
  label.textContent = choice.label;
  block.appendChild(label);
  const rowEl = document.createElement('div');
  rowEl.className = 'htw-capture-row';
  const input = document.createElement('input');
  input.type = 'tel';
  input.className = 'htw-capture-input';
  input.placeholder = '(555) 555-5555';
  input.inputMode = 'numeric';
  input.autocomplete = 'tel-national';
  input.setAttribute('aria-label', 'U.S. mobile number, 10 digits');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'htw-capture-submit';
  submit.textContent = 'Text me';
  rowEl.appendChild(input);
  rowEl.appendChild(submit);
  block.appendChild(rowEl);
  const err = document.createElement('span');
  err.className = 'htw-capture-err';
  err.hidden = true;
  block.appendChild(err);

  const id = input.id = captureFieldId('phone');
  label.htmlFor = id;

  input.addEventListener('input', () => { input.value = formatUS(usDigits(input.value)); });

  block.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.disabled || convoBusy()) return;
    const digits = usDigits(input.value);
    if (digits.length !== 10) {
      err.textContent = 'Enter a valid 10-digit U.S. mobile number.';
      err.hidden = false;
      input.focus();
      return;
    }
    err.hidden = true;
    submitCapture(block, formatUS(digits), choice.id, 'landing_widget_sms_handoff', 'phone');
  });
  return block;
}

// Real signup CTA carrying the migrate params so a created account joins the
// solutioning funnel (POST /migrate adopts the anon session post-auth).
function buildSignupCapture(choice) {
  const block = document.createElement('div');
  block.className = 'htw-capture htw-capture-signup';
  const a = document.createElement('a');
  a.className = 'htw-capture-cta';
  a.href = signupUrl();
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = choice.label || 'Create a free account';
  a.addEventListener('click', () => {
    track('landing_widget_signup_clicked', { source: 'capture_action' });
  });
  block.appendChild(a);
  return block;
}

// US phone helpers — ported verbatim from index.html's hero capture form so
// inline phone validation matches the page's existing behaviour exactly.
function usDigits(value) {
  let d = (value || '').replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  return d.slice(0, 10);
}

function formatUS(d) {
  if (d.length > 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  if (d.length > 3) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
  if (d.length > 0) return '(' + d.slice(0, 3);
  return '';
}

function signupUrl() {
  const params = new URLSearchParams();
  if (state.sessionId) params.set('sol_session', state.sessionId);
  if (state.ctx.anonId) params.set('sol_anon', state.ctx.anonId);
  const qs = params.toString();
  return 'https://dashboard.hypertrack.com/signup' + (qs ? '?' + qs : '');
}

function muteChips(row, selectedChip) {
  for (const chip of row.querySelectorAll('.htw-chip')) {
    chip.disabled = true;
    if (chip === selectedChip) chip.classList.add('htw-chip-selected');
  }
}

// Chips/affordances are one-shot per conversation point: any new send (chip,
// free text, or a capture affordance) retires every still-active control so
// stale choice_ids / capture inputs can't be submitted later.
function muteAllChips() {
  for (const chip of state.bodyEl.querySelectorAll('.htw-chip:not(:disabled)')) {
    chip.disabled = true;
  }
  for (const block of state.bodyEl.querySelectorAll('.htw-capture:not(.htw-cap-done)')) {
    // Signup is a plain link with nothing to submit — leave it usable.
    if (block.classList.contains('htw-capture-signup')) continue;
    retireAffordance(block);
  }
}

function setStatusLine(mode, text) {
  if (!state.statusEl) return;
  state.statusEl.hidden = false;
  if (mode === 'dots') {
    state.statusEl.innerHTML =
      '<span class="htw-dots" aria-label="Assistant is typing"><i></i><i></i><i></i></span>';
  } else {
    state.statusEl.textContent = '';
    const span = document.createElement('span');
    span.className = 'htw-status-text';
    span.textContent = text;
    state.statusEl.appendChild(span);
  }
  state.bodyEl.appendChild(state.statusEl); // keep pinned under the latest message
  scrollToBottom();
}

function hideStatusLine() {
  if (state.statusEl) state.statusEl.hidden = true;
}

function addRetryRow(label) {
  const row = document.createElement('div');
  row.className = 'htw-retry';
  const msg = document.createElement('span');
  msg.textContent = label || 'Something went wrong.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'htw-retry-btn';
  btn.textContent = 'Retry';
  btn.addEventListener('click', () => {
    row.remove();
    if (state.lastSend) resend();
    else boot(true);
  });
  row.appendChild(msg);
  row.appendChild(btn);
  state.bodyEl.appendChild(row);
  scrollToBottom();
}

function addLimitCard(scope) {
  const card = document.createElement('div');
  card.className = 'htw-msg htw-msg-assistant htw-limit';
  const p = document.createElement('p');
  p.textContent = "You've hit today's demo limit — leave an email and we'll pick this up.";
  const links = document.createElement('p');
  links.className = 'htw-limit-links';
  const mail = document.createElement('a');
  mail.href = 'mailto:help@hypertrack.com?subject=Solution%20design%20follow-up';
  mail.textContent = 'Email us';
  const sep = document.createTextNode(' · ');
  const signup = document.createElement('a');
  signup.href = signupUrl(); // carries sol_session + sol_anon migrate params
  signup.target = '_blank';
  signup.rel = 'noopener noreferrer';
  signup.textContent = 'Create a free account';
  signup.addEventListener('click', () => track('landing_widget_signup_clicked', { source: 'rate_limit' }));
  links.appendChild(mail);
  links.appendChild(sep);
  links.appendChild(signup);
  card.appendChild(p);
  card.appendChild(links);
  state.bodyEl.appendChild(card);
  scrollToBottom();
  state.convo = 'limited';
  setInputEnabled(false);
  track('landing_widget_rate_limited', { scope });
}

function setInputEnabled(on) {
  if (!state.inputEl) return;
  state.inputEl.disabled = !on;
  if (state.sendEl) state.sendEl.disabled = !on;
}

/* --- blueprint peek affordance ------------------------------------------ */

function showPeek() {
  if (!state.peekEl) return;
  const had = !state.peekEl.hidden;
  state.peekEl.hidden = false;
  if (!had && !state.peekShown) {
    state.peekShown = true;
    // Warm the lazy renderer chunk so the first peek click paints instantly.
    diagramModule().catch(function () { /* retried on click */ });
    track('landing_widget_peek_affordance_shown', {});
  }
}

function hidePeek() {
  if (state.peekEl) state.peekEl.hidden = true;
  state.peekShown = false;
}

// The diagram is the REAL dashboard solutioner component (React + DiagramCanvas)
// shipped as one self-contained IIFE that assigns window.HTSolutionDiagram. We
// inject it as a classic <script> exactly once (on first modal open) and resolve
// when the global API is present. Lazy: nothing loads until the user peeks.
function diagramModule() {
  if (!state.diagramMod) {
    state.diagramMod = new Promise(function (resolve, reject) {
      if (window.HTSolutionDiagram) { resolve(window.HTSolutionDiagram); return; }
      var src = (state.ctx && state.ctx.diagramUrl) || './solution-diagram.bundle.js';
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () {
        if (window.HTSolutionDiagram) resolve(window.HTSolutionDiagram);
        else reject(new Error('HTSolutionDiagram missing after bundle load'));
      };
      s.onerror = function () { reject(new Error('failed to load diagram bundle')); };
      document.head.appendChild(s);
    }).catch(function (e) { state.diagramMod = null; throw e; });
  }
  return state.diagramMod;
}

// Render the latest blueprint into the modal viewport using the REAL dashboard
// DiagramCanvas (window.HTSolutionDiagram). The component owns pan/zoom, the
// +/- controls, the dotted grid, drag user-select suppression, and auto-fit —
// on first mount AND on every blueprint change — so the widget no longer
// re-derives any of that. A new blueprint re-runs the bundle's layout + edge
// router (heavy), so the live path stays debounced (scheduleLiveRerender).
function renderDiagramNow() {
  if (!state.viewportEl || !state.diagram) return;
  if (state.renderedDiagram === state.diagram && state.diagramHandle) return; // already painted
  diagramModule().then(function (api) {
    if (!state.modalOpen || !state.diagram || !state.viewportEl) return; // closed/reset mid-load
    if (state.diagramHandle) {
      api.update(state.diagramHandle, state.diagram);
    } else {
      state.viewportEl.textContent = ''; // clear any prior fallback message
      state.diagramHandle = api.mount(state.viewportEl, state.diagram);
    }
    state.renderedDiagram = state.diagram;
  }).catch(function () {
    // Bundle failed to load — degrade to a plain message, never a blank modal.
    if (!state.viewportEl) return;
    state.viewportEl.textContent = '';
    var p = document.createElement('p');
    p.className = 'htw-diagram-fallback';
    p.textContent = 'Diagram preview unavailable — keep chatting and we’ll share it with you.';
    state.viewportEl.appendChild(p);
  });
}

// Debounced live re-render for streamed blueprint deltas while the modal is open.
// A burst of deltas coalesces into one heavy layout/route pass (~200ms after the
// last one), so we don't re-run the O(edges²) router many times in quick
// succession. state.diagram always holds the latest, so the trailing render is
// correct.
var LIVE_RERENDER_MS = 200;
function scheduleLiveRerender() {
  if (!state.modalOpen) return;
  if (state.diagramRerenderTimer) clearTimeout(state.diagramRerenderTimer);
  state.diagramRerenderTimer = setTimeout(function () {
    state.diagramRerenderTimer = 0;
    if (state.modalOpen) renderDiagramNow();
  }, LIVE_RERENDER_MS);
}

function openDiagramModal() {
  if (!state.diagram) return;
  if (!state.backdropEl) buildDiagramModal();
  if (!state.backdropEl || state.modalOpen) return;
  state.backdropEl.hidden = false;
  state.modalOpen = true;
  state.modalOpenedAt = Date.now();
  if (!isMobile()) lockScroll(); // mobile already locks the page for the sheet
  if (state.modalEl) state.modalEl.focus({ preventScroll: true });
  renderDiagramNow();
  track('landing_widget_diagram_peeked', {
    node_count: state.diagram && Array.isArray(state.diagram.nodes) ? state.diagram.nodes.length : null
  });
}

function closeDiagramModal() {
  if (!state.backdropEl || !state.modalOpen) return;
  state.backdropEl.hidden = true;
  var dwellMs = state.modalOpenedAt ? Date.now() - state.modalOpenedAt : 0;
  state.modalOpen = false;
  state.modalOpenedAt = 0;
  if (state.diagramRerenderTimer) { clearTimeout(state.diagramRerenderTimer); state.diagramRerenderTimer = 0; }
  // The modal locks page scroll on desktop (the panel itself doesn't); release
  // it unless the mobile sheet still needs the lock for an open panel.
  if (!(isMobile() && state.status === 'open')) unlockScroll();
  if (state.peekEl && !state.peekEl.hidden) state.peekEl.focus({ preventScroll: true });
  track('landing_widget_diagram_peek_closed', { dwell_ms: dwellMs });
}

/* --- SSE client (vanilla port of embed's parseSSE) ------------------------ */

function inferEventType(data) {
  if ('content' in data) return 'text';
  if ('text' in data) return 'thinking';
  if ('diagram' in data) return 'blueprint';
  if ('choices' in data) return 'quick_choices';
  if ('phase' in data) return 'phase';
  if ('message' in data) return 'error';
  return 'unknown';
}

async function readSSE(res, onEvent, onByte) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onByte();
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith('data: ')) continue;
      let data;
      try {
        data = JSON.parse(line.slice(6));
      } catch (e) {
        currentEvent = '';
        continue;
      }
      onEvent(currentEvent || inferEventType(data), data);
      currentEvent = '';
    }
  }
}

/* --- conversation machine ------------------------------------------------ */

function hasStoredSession() {
  try { return localStorage.getItem('ht_sol_session') === '1'; } catch (e) { return false; }
}

function rememberSession() {
  try { localStorage.setItem('ht_sol_session', '1'); } catch (e) { /* silent */ }
}

function forgetSession() {
  try { localStorage.removeItem('ht_sol_session'); } catch (e) { /* silent */ }
}

async function boot(force) {
  if (state.booted && !force) return;
  state.booted = true;
  state.convo = 'boot';
  warmCaptcha(); // mint a Turnstile token while the opening loads (no-op on localhost)
  try {
    state.variantId = state.variantId || localStorage.getItem('ht_sol_variant') || null;
  } catch (e) { /* silent */ }

  if (hasStoredSession()) {
    setInputEnabled(false);
    try {
      const sess = await apiCreateSession(); // resumes on the same anonymous_id
      restoreFromSession(sess);
      track('landing_widget_session_restored', { message_count: (sess.messages || []).length });
      state.convo = 'awaiting';
      setInputEnabled(true);
      return;
    } catch (err) {
      if (err && err.httpStatus === 429) {
        trackError('rate_limited', 429);
        addLimitCard('session');
        return;
      }
      trackError('restore_failed', err && err.httpStatus);
      addRetryRow('Couldn’t restore your conversation.');
      state.lastSend = null; // retry row falls back to boot(true)
      return;
    }
  }
  await showOpening();
}

// Confirm to the backend that the opening actually rendered (desktop auto-open,
// mobile peek, or launcher open) so it counts real render impressions, not
// serves — the optimizer's exposure/reconcile guardrail depends on the two
// counters measuring the same thing (see closeout-copilot#768). Fire-and-forget,
// non-blocking, once per visitor: sessionStorage dedupe keyed by the same
// distinct_id used for GET /opening, and the server dedupes authoritatively.
function pingImpression() {
  const distinctId = state.ctx.distinctId || state.ctx.anonId;
  if (!distinctId) return;
  const key = 'ht_sol_impression:' + distinctId;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch (e) { /* storage blocked — still ping once; the server dedupes */ }
  const url = api('/opening/impression');
  const body = JSON.stringify({ distinct_id: distinctId });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch (e) { /* fall through to fetch */ }
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true
    }).catch(function () { /* silent */ });
  } catch (e) { /* silent */ }
}

async function showOpening() {
  const cached = openingFromCache();
  let data = cached;
  let source = 'cache';
  if (!data) {
    source = 'network';
    setStatusLine('dots');
    try {
      data = await fetchOpening();
    } catch (err) {
      hideStatusLine();
      trackError('opening_failed', err && err.httpStatus);
      addRetryRow('Couldn’t load the assistant.');
      state.lastSend = null;
      return;
    }
    hideStatusLine();
  }
  state.variantId = data.variant_id || state.variantId;
  addBubble('assistant', data.opening_message);
  addChips(data.choices, {});
  state.convo = 'opening';
  setInputEnabled(true);
  track('landing_widget_opening_shown', { source });
  pingImpression(); // confirm the render to the backend (once per visitor)
}

// Restore port of web-dashboard embed/src/state/solutioning.state.ts: strip
// [Selected:] prefixes, lift show_quick_choices tool_calls into chips. Chips
// from a text-less trailing assistant message still land on the LAST
// assistant bubble (closeout#641's bug was dropping those).
function restoreFromSession(sess) {
  state.sessionId = sess.session_id;
  state.phase = sess.phase || state.phase;
  state.turn = 0; // recounted from the replayed user messages (boot can re-run)

  const items = [];
  let trailingChips = null;
  for (const m of sess.messages || []) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const text = typeof m.content === 'string' ? m.content
      : Array.isArray(m.content)
        ? m.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('')
        : '';
    let chips = null;
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc && tc.function && tc.function.name === 'show_quick_choices') {
          try {
            const args = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
            if (args && Array.isArray(args.choices)) chips = args.choices;
          } catch (e) { /* ignore malformed arguments */ }
        }
      }
    }
    const displayText = m.role === 'user' ? text.replace(/^\[Selected: [^\]]+\]\s*/, '') : text;
    if (m.role === 'assistant' && !displayText) {
      if (chips) trailingChips = chips; // tool-call-only turn: keep its chips
      continue;
    }
    if (m.role === 'user') state.turn++;
    items.push({ role: m.role, text: displayText, chips });
    trailingChips = null; // any later real message supersedes a chips-only turn
  }

  // Active chips = the conversation's final assistant output: either a
  // trailing chips-only turn (rendered last, after any user message) or chips
  // on a final assistant bubble. Everything older renders muted.
  for (let i = 0; i < items.length; i++) {
    addBubble(items[i].role, items[i].text);
    if (items[i].chips) {
      const active = !trailingChips && items[i].role === 'assistant' && i === items.length - 1;
      addChips(items[i].chips, { muted: !active, restore: true });
    }
  }
  if (trailingChips) addChips(trailingChips, { restore: true });

  if (sess.blueprint) {
    state.diagram = sess.blueprint;
    showPeek();
  }
}

function ensureSession() {
  if (state.sessionId) return Promise.resolve();
  if (state.creating) return state.creating; // concurrent sends share one create
  state.convo = 'creating';
  const t0 = Date.now();
  state.creating = apiCreateSession().then((sess) => {
    state.sessionId = sess.session_id;
    state.phase = sess.phase || state.phase;
    rememberSession();
    track('landing_widget_session_created', { ms: Date.now() - t0 });
  }).finally(() => { state.creating = null; });
  return state.creating;
}

function clearTimers() {
  if (state.stillTimer) { clearTimeout(state.stillTimer); state.stillTimer = 0; }
  if (state.byteTimer) { clearTimeout(state.byteTimer); state.byteTimer = 0; }
}

function armByteTimer(controller) {
  if (state.byteTimer) clearTimeout(state.byteTimer);
  state.byteTimer = setTimeout(() => {
    controller.htwTimedOut = true;
    controller.abort();
  }, NO_BYTE_TIMEOUT_MS);
}

function onChipClick(row, chip, choice) {
  if (state.convo === 'streaming' || state.convo === 'creating' || state.convo === 'limited') return;
  if (state.peekMode || state.compact) engage('option'); // leave the compact pre-expand first
  muteChips(row, chip);
  markEngaged();
  track(state.turn === 0 ? 'landing_widget_first_choice_clicked' : 'landing_widget_choice_clicked', {
    choice_id: choice.id,
    label: choice.label,
    turn: state.turn + 1
  });
  send(choice.label, choice.id);
}

function onSubmit() {
  if (state.convo === 'streaming' || state.convo === 'creating' || state.convo === 'limited') return;
  if (!state.inputEl || state.inputEl.disabled) return;
  const text = state.inputEl.value.trim().slice(0, MAX_INPUT_CHARS);
  if (!text) return;
  state.inputEl.value = '';
  if (state.peekMode || state.compact) engage('input'); // safety: submitting leaves the compact state
  markEngaged();
  track('landing_widget_message_sent', { length: text.length, turn: state.turn + 1 });
  send(text, null);
}

async function send(message, choiceId) {
  touchActive();
  muteAllChips();
  addBubble('user', message);
  state.turn++;
  state.lastSend = { message, choiceId };
  await streamTurn(message, choiceId);
}

// Retry path: the user bubble is already in the transcript; don't re-add or
// re-count the turn.
async function resend() {
  if (!state.lastSend) return;
  await streamTurn(state.lastSend.message, state.lastSend.choiceId);
}

async function streamTurn(message, choiceId) {
  state.convo = 'streaming';
  setInputEnabled(false);
  setStatusLine('dots');
  state.gotText = false;
  state.pendingChips = null;
  let hadBlueprint = false;
  let sseError = null;
  const t0 = Date.now();

  try {
    await ensureSession();
  } catch (err) {
    clearTimers();
    hideStatusLine();
    if (err && err.httpStatus === 429) {
      addLimitCard('session');
      return;
    }
    const type = err && err.httpStatus === 403 ? 'captcha' : 'session_failed';
    trackError(type, err && err.httpStatus);
    addRetryRow('Couldn’t start the conversation.');
    state.convo = 'awaiting';
    setInputEnabled(true);
    return;
  }

  state.convo = 'streaming'; // ensureSession sets 'creating'
  const controller = new AbortController();
  state.abort = controller;
  state.stillTimer = setTimeout(() => {
    if (!state.gotText) setStatusLine('text', 'Still thinking…');
  }, STILL_THINKING_MS);
  armByteTimer(controller);

  let assistantEl = null;
  let buf = '';
  let rafPending = false;

  try {
    const body = { anonymous_id: state.ctx.anonId, message };
    if (choiceId) body.choice_id = choiceId;
    const res = await fetch(api('/session/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (res.status === 429) {
      clearTimers();
      hideStatusLine();
      addLimitCard('message');
      return;
    }
    if (!res.ok || !res.body) {
      throw Object.assign(new Error('message failed'), { httpStatus: res.status });
    }

    await readSSE(res, (event, data) => {
      switch (event) {
        case 'text':
          buf += data.content || '';
          state.gotText = true;
          hideStatusLine();
          if (!assistantEl) assistantEl = addBubble('assistant', '');
          // rAF-coalesced: re-rendering the full buffer per chunk is O(n²)
          if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(() => {
              rafPending = false;
              renderMarkdown(assistantEl, buf);
              scrollToBottom();
            });
          }
          break;
        case 'thinking':
          if (data.text) setStatusLine('text', data.text);
          break;
        case 'tool_start':
          setStatusLine('text', data.tool ? 'Running ' + data.tool + '…' : 'Working…');
          break;
        case 'tool_end':
          break;
        case 'quick_choices':
          state.pendingChips = data.choices || null;
          break;
        case 'blueprint':
          state.diagram = data.diagram;
          hadBlueprint = true;
          showPeek();
          if (state.modalOpen) scheduleLiveRerender(); // debounced live update while the modal is open
          track('landing_widget_diagram_updated', {
            node_count: data.diagram && Array.isArray(data.diagram.nodes)
              ? data.diagram.nodes.length : null
          });
          break;
        case 'phase':
          state.phase = data.phase || state.phase;
          break;
        case 'error':
          sseError = data.message || 'error';
          break;
        case 'done':
        default:
          break;
      }
    }, () => armByteTimer(controller));

    clearTimers();
    hideStatusLine();
    if (assistantEl) renderMarkdown(assistantEl, buf); // final synchronous render
    if (sseError) {
      trackError('sse_error', null);
      addRetryRow('The assistant hit a snag.');
    } else {
      const hadChoices = !!state.pendingChips;
      if (state.pendingChips) addChips(state.pendingChips, {});
      state.pendingChips = null;
      state.lastSend = null;
      track('landing_widget_turn_completed', {
        latency_ms: Date.now() - t0,
        turn: state.turn,
        had_blueprint: hadBlueprint,
        had_choices: hadChoices
      });
    }
  } catch (err) {
    clearTimers();
    hideStatusLine();
    if (controller.signal.aborted) {
      if (controller.htwTimedOut) {
        trackError('timeout', null);
        addRetryRow('That took too long.');
      } else if (!controller.htwSilent) {
        // aborted by close — keep partial text, offer retry on reopen
        addRetryRow('Interrupted.');
      }
    } else {
      trackError(err && err.httpStatus ? 'http' : 'network', err && err.httpStatus);
      addRetryRow('Connection hiccup.');
    }
  } finally {
    if (state.abort === controller) state.abort = null;
    state.convo = state.convo === 'limited' ? 'limited' : 'awaiting';
    if (state.convo !== 'limited') {
      setInputEnabled(true);
      if (!isMobile() && state.status === 'open') state.inputEl.focus({ preventScroll: true });
    }
  }
}

function abortStream(silent) {
  if (state.abort) {
    if (silent) state.abort.htwSilent = true;
    state.abort.abort();
  }
}

async function resetConversation() {
  abortStream(true);
  clearTimers();
  hideStatusLine();
  track('landing_widget_reset', { turns: state.turn });
  try { await apiDeleteSession(); } catch (e) { /* silent */ }
  forgetSession();
  state.sessionId = null;
  state.phase = null;
  state.turn = 0;
  state.diagram = null;
  state.lastSend = null;
  state.pendingChips = null;
  hidePeek();
  closeDiagramModal();
  // A reset blueprint is gone — tear down the mounted DiagramCanvas (unmount the
  // React root before clearing the host node) so a new one mounts cleanly.
  if (state.diagramHandle && window.HTSolutionDiagram) {
    try { window.HTSolutionDiagram.unmount(state.diagramHandle); } catch (e) { /* silent */ }
  }
  state.renderedDiagram = null;
  state.diagramHandle = null;
  if (state.viewportEl) state.viewportEl.textContent = '';
  state.captchaFailEl = null; // body is about to be cleared; drop the dangling ref
  if (state.bodyEl) {
    state.bodyEl.textContent = '';
    state.bodyEl.appendChild(state.statusEl);
    state.statusEl.hidden = true;
  }
  await showOpening();
}

/* --- panel chrome (PR1 shell + #118 review fixes) ------------------------- */

function buildPanel() {
  const panel = document.createElement('div');
  panel.className = 'htw-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Design my solution');
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.innerHTML =
    '<div class="htw-header">' +
      '<div class="htw-title">Design my solution</div>' +
      '<div class="htw-header-actions">' +
        '<button type="button" class="htw-peek" aria-label="View solution diagram" title="View solution diagram" hidden>' +
          DIAGRAM_ICON +
          '<span class="htw-peek-dot" aria-hidden="true"></span>' +
        '</button>' +
        '<button type="button" class="htw-reset">Start over</button>' +
        '<button type="button" class="htw-close" aria-label="Close">' + CLOSE_ICON + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="htw-body" aria-live="polite"></div>' +
    '<div class="htw-input-row">' +
      '<input class="htw-input" type="text" placeholder="or describe it your way…" maxlength="' + MAX_INPUT_CHARS + '" disabled aria-label="Message">' +
      '<button type="button" class="htw-send" aria-label="Send" disabled>' + SEND_ICON + '</button>' +
    '</div>';

  panel.querySelector('.htw-close').addEventListener('click', () => close('button'));
  state.bodyEl = panel.querySelector('.htw-body');
  state.inputEl = panel.querySelector('.htw-input');
  state.sendEl = panel.querySelector('.htw-send');
  state.peekEl = panel.querySelector('.htw-peek');
  state.resetEl = panel.querySelector('.htw-reset');

  state.statusEl = document.createElement('div');
  state.statusEl.className = 'htw-status';
  state.statusEl.hidden = true;
  state.bodyEl.appendChild(state.statusEl);

  state.inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  });
  state.sendEl.addEventListener('click', onSubmit);
  state.peekEl.addEventListener('click', openDiagramModal);
  state.resetEl.addEventListener('click', resetConversation);

  window.addEventListener('pagehide', () => abortStream(true));
  return panel;
}

// The diagram modal is a separate fixed-position layer (backdrop + dialog) that
// floats above the whole page — not docked inside the chat panel. Built lazily
// on first open and appended to the widget root so the namespaced CSS applies.
// Zoom/pan controls live inside the embedded DiagramCanvas, not in this shell.
function buildDiagramModal() {
  const rootEl = root();
  if (!rootEl) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'htw-modal-backdrop';
  backdrop.hidden = true;
  // The inner viewport hosts the REAL DiagramCanvas (window.HTSolutionDiagram),
  // which renders its own dotted grid, pan/zoom, and +/- controls. The modal
  // only provides the shell (backdrop, header, close, Escape, scroll-lock).
  backdrop.innerHTML =
    '<div class="htw-modal" role="dialog" aria-modal="true" aria-label="Solution diagram" tabindex="-1">' +
      '<div class="htw-modal-head">' +
        '<span class="htw-modal-title">Your solution diagram</span>' +
        '<button type="button" class="htw-modal-close" aria-label="Close diagram">' + CLOSE_ICON + '</button>' +
      '</div>' +
      '<div class="htw-diagram-viewport"></div>' +
    '</div>';

  state.backdropEl = backdrop;
  state.modalEl = backdrop.querySelector('.htw-modal');
  state.viewportEl = backdrop.querySelector('.htw-diagram-viewport');

  // Backdrop click closes; clicks inside the dialog don't bubble out.
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDiagramModal();
  });
  backdrop.querySelector('.htw-modal-close').addEventListener('click', closeDiagramModal);

  rootEl.appendChild(backdrop);
}

// Trap container = the open diagram modal (when up) else the chat panel.
function trapContainer() {
  return (state.modalOpen && state.modalEl) ? state.modalEl : state.panel;
}

function focusables() {
  return Array.from(
    trapContainer().querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter((el) => !el.disabled && el.offsetParent !== null);
}

function trapFocus(event) {
  const container = trapContainer();
  const items = focusables();
  if (!items.length) {
    event.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    // Root focus counts as the trap boundary (#118 review): Shift+Tab from the
    // just-focused root must wrap to the end, not escape the dialog.
    if (active === first || active === container || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last || !container.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

function onKeydown(event) {
  if (state.status !== 'open') return;
  if (event.key === 'Escape') {
    if (state.modalOpen) {
      event.stopPropagation();
      closeDiagramModal();
      return;
    }
    const mobile = isMobile();
    // #118 review: only the modal mobile sheet swallows Escape; the desktop
    // panel is non-modal, so it closes only when focus is inside it and lets
    // page handlers (nav dropdowns, etc.) see the key.
    if (mobile) {
      event.stopPropagation();
      close('escape');
    } else if (state.panel.contains(event.target)) {
      close('escape');
    }
    return;
  }
  // Trap Tab inside the mobile sheet, and inside the diagram modal on any size
  // (it's a true modal layer covering the page).
  if (event.key === 'Tab' && (isMobile() || state.modalOpen)) trapFocus(event);
}

// iOS-safe scroll lock (#118 review): overflow:hidden alone doesn't stop iOS
// rubber-banding, so the body is position:fixed at the saved offset while the
// sheet is open.
function lockScroll() {
  if (state.locked) return;
  state.locked = true;
  state.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.style.setProperty('--htw-lock-top', -state.scrollY + 'px');
  document.documentElement.classList.add('ht-sol-lock');
}

function unlockScroll() {
  if (!state.locked) return;
  state.locked = false;
  document.documentElement.classList.remove('ht-sol-lock');
  document.documentElement.style.removeProperty('--htw-lock-top');
  window.scrollTo(0, state.scrollY);
}

// Mobile sheet tracks the visual viewport: height pins to vv.height and the
// sheet translates by vv.offsetTop so the on-screen keyboard can't push the
// top-anchored sheet out of alignment (#118 review).
function syncViewport() {
  if (!state.panel || state.status !== 'open') return;
  if (state.peekMode) return; // the compact peek is sized by CSS, not the sheet math
  if (isMobile() && window.visualViewport) {
    const vv = window.visualViewport;
    state.panel.style.height = Math.round(vv.height) + 'px';
    state.panel.style.transform = 'translateY(' + Math.round(vv.offsetTop) + 'px)';
  } else {
    state.panel.style.height = '';
    state.panel.style.transform = '';
  }
}

function onResize() {
  if (state.status !== 'open') return;
  if (state.peekMode) return; // peek is a fixed compact card; no modal/sheet switching
  const mobile = isMobile();
  state.panel.setAttribute('aria-modal', mobile ? 'true' : 'false');
  // The diagram modal also needs the page scroll-locked; don't unlock under it.
  if (mobile || state.modalOpen) lockScroll();
  else unlockScroll();
  syncViewport();
  // Re-fit the open diagram: viewport size changes (rotate, resize, desktop ↔
  // mobile) change how much we can scale into the modal viewport. The embedded
  // DiagramCanvas recomputes auto-fit against the new container size.
  if (state.modalOpen && state.diagramHandle && window.HTSolutionDiagram) {
    window.HTSolutionDiagram.refit(state.diagramHandle);
  }
}

export function open(ctx) {
  const passive = !!(ctx && ctx.passive);         // pre-expand must not steal focus/scroll
  const autoCompact = !!(ctx && ctx.autoCompact); // pre-expand opens compact (content height)
  if (ctx) state.ctx = Object.assign({}, state.ctx, ctx);
  if (state.status === 'open') return;
  const rootEl = root();
  if (!rootEl) return;

  if (!state.panel) {
    state.panel = buildPanel();
    rootEl.appendChild(state.panel);
  }

  const peek = autoCompact && isMobile(); // mobile: non-modal peek that defers the opened event
  const compact = autoCompact;            // desktop + mobile: compact height until the user engages
  state.autoStarted = state.ctx.trigger === 'auto';
  state.peekMode = peek;
  state.compact = compact;

  state.status = 'open';
  state.openedAt = Date.now();

  rootEl.classList.add('htw-open');
  if (compact) state.panel.classList.add('htw-compact');
  state.panel.hidden = false;
  const mobile = isMobile();
  // The mobile peek is non-modal: no aria-modal, no scroll lock, no sheet sizing,
  // no focus trap — passive until the user engages. Desktop compact is already
  // the non-modal docked panel; it just opens at content height.
  state.panel.setAttribute('aria-modal', (mobile && !peek) ? 'true' : 'false');
  if (mobile && !peek) lockScroll();
  if (!peek) syncViewport();

  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }

  if (!passive) state.panel.focus({ preventScroll: true });

  if (state.autoStarted) {
    capture('landing_widget_auto_shown', {
      mode: peek ? 'peek' : 'panel',
      widget_version: state.ctx.widgetVersion,
      breakpoint: breakpoint()
    });
  }
  // The full-open event. In peek mode it's deferred to engage() so the funnel
  // separates "saw the peek" from "opened the full panel".
  if (!peek) {
    capture('landing_widget_opened', {
      trigger: state.ctx.trigger || 'launcher',
      ms_since_seen: state.ctx.seenAt ? Date.now() - state.ctx.seenAt : null,
      widget_version: state.ctx.widgetVersion
    });
  }

  touchActive();
  boot();
  scrollToBottom();

  if (compact) wireEngagement();
}

// autoStart is the loader's pre-expand entry point. Both desktop and mobile open
// compact (content height, no empty gap): mobile as the non-modal peek, desktop
// as a snug docked panel. Both tag trigger:'auto' so the funnel separates them
// from launcher opens.
export function autoStart(ctx) {
  if (state.status === 'open') return;
  // Defense in depth — the loader already skips returning conversations.
  if (hasStoredSession()) return;
  open(Object.assign({}, ctx || {}, { trigger: 'auto', passive: true, autoCompact: true }));
}

// Engage = leave the compact pre-expand for the full-size conversation view.
// Mobile: promote the non-modal peek to the full modal sheet and fire the
// deferred landing_widget_opened(trigger:'auto'). Desktop: grow the docked panel
// from content height to full height (opened already fired at load).
function engage(via) {
  if (!state.compact && !state.peekMode) return;
  const wasPeek = state.peekMode;
  state.peekMode = false;
  state.compact = false;
  teardownEngagement();

  if (wasPeek) {
    if (state.panel) state.panel.classList.remove('htw-compact');
    const mobile = isMobile();
    state.panel.setAttribute('aria-modal', mobile ? 'true' : 'false');
    if (mobile) lockScroll();
    syncViewport();
    capture('landing_widget_opened', {
      trigger: 'auto',
      ms_since_seen: state.ctx.seenAt ? Date.now() - state.ctx.seenAt : null,
      widget_version: state.ctx.widgetVersion,
      engage_via: via || null
    });
  } else {
    // Desktop compact -> full: animate the height; opened already fired at load.
    growDesktopPanel();
  }
}

// FLIP the docked desktop/tablet panel from its compact content height to the
// full conversation height. CSS transitions the height at >=640px only, so the
// mobile sheet's viewport-driven resizes stay instant.
function growDesktopPanel() {
  const panel = state.panel;
  if (!panel) return;
  if (isMobile()) { panel.classList.remove('htw-compact'); return; }
  try {
    const from = panel.offsetHeight;
    panel.classList.remove('htw-compact'); // full height now comes from CSS
    const to = panel.offsetHeight;
    if (to <= from) { panel.style.height = ''; return; }
    panel.style.height = from + 'px';
    void panel.offsetHeight; // reflow at the start height before animating
    requestAnimationFrame(function () {
      panel.style.height = to + 'px';
      const clear = function () {
        panel.style.height = '';
        panel.removeEventListener('transitionend', clear);
      };
      panel.addEventListener('transitionend', clear);
      setTimeout(clear, 400); // fallback if transitionend doesn't fire
    });
  } catch (e) {
    panel.classList.remove('htw-compact');
    panel.style.height = '';
  }
}

// One-shot: the user's first real action (option click or first message),
// separate from opening the panel.
function markEngaged() {
  if (state.engaged) return;
  state.engaged = true;
  track('landing_widget_engaged', {
    trigger: state.ctx.trigger || 'launcher',
    turn: state.turn + 1
  });
}

function rememberDismissed() {
  try { sessionStorage.setItem('ht_sol_dismissed', '1'); } catch (e) { /* silent */ }
}

/* --- Pre-expand engagement (compact -> full) ---------------------------- */

function onEngageInputFocus() { engage('input'); }

// Mobile peek only, non-modal: a click anywhere off the card dismisses it back
// to the launcher (capture phase; a click inside is left to its own handler).
function peekOutsideClick(event) {
  if (!state.peekMode) return;
  if (state.panel && state.panel.contains(event.target)) return;
  close('auto_dismiss');
}

function wireEngagement() {
  // Focusing the input engages (grows on desktop, promotes the peek on mobile).
  if (state.inputEl) state.inputEl.addEventListener('focus', onEngageInputFocus);
  // Tap-away dismiss is peek-only; the desktop docked panel ignores outside clicks.
  if (state.peekMode) document.addEventListener('click', peekOutsideClick, true);
}

function teardownEngagement() {
  if (state.inputEl) state.inputEl.removeEventListener('focus', onEngageInputFocus);
  document.removeEventListener('click', peekOutsideClick, true);
}

export function close(method) {
  if (state.status !== 'open') return;
  state.status = 'closed';

  // Minimize is orthogonal to the conversation, but an in-flight stream is
  // aborted (partial text stays; the catch path adds a retry row).
  abortStream(false);
  closeDiagramModal();

  // A pre-expand dismissed before the user engaged reports as auto_dismiss, so
  // the funnel separates it from a launcher open the user opened then closed.
  let closeMethod = method || 'button';
  if (state.autoStarted && !state.engaged &&
      (closeMethod === 'button' || closeMethod === 'escape' || closeMethod === 'backdrop')) {
    closeMethod = 'auto_dismiss';
  }

  teardownEngagement();
  state.peekMode = false;
  state.compact = false;
  if (state.panel) state.panel.classList.remove('htw-compact');
  rememberDismissed(); // suppress the pre-expand for the rest of the session

  const rootEl = root();
  // Only pull focus back to the launcher if focus was actually inside the
  // widget (close button, Escape, a chip). A passive pre-expand the user never
  // touched — dismissed by tapping the page — keeps focus where it was.
  const focusWasInWidget = !!(rootEl && rootEl.contains(document.activeElement));
  state.panel.hidden = true;
  state.panel.style.height = '';
  state.panel.style.transform = '';
  if (rootEl) rootEl.classList.remove('htw-open');
  unlockScroll();

  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('resize', onResize);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', syncViewport);
    window.visualViewport.removeEventListener('scroll', syncViewport);
  }

  const launcher = state.ctx.launcher;
  if (focusWasInWidget && launcher && typeof launcher.focus === 'function') {
    launcher.focus({ preventScroll: true });
  }

  capture('landing_widget_closed', {
    open_duration_ms: Date.now() - state.openedAt,
    close_method: closeMethod,
    widget_version: state.ctx.widgetVersion
  });
}
