# Closeout Desk

Standalone Vite + React 19 + TypeScript payroll prototype. The top bar has Timesheets, Payroll and Rules tabs, followed by a Settings gear, Agent toggle and account menu. Timesheets pairs flags with the shifts table; a shift opens a three-column modal for evidence, conversation and trail. Payroll owns the 26-cycle history, per-worker pay runs and batch sending. Settings puts calendar and inbox configuration beside Sources / Destinations connection tables. Agent opens a persistent drawer.

The bench engine computes payroll and discrepancies from deterministic synthetic shifts across 26 cycles. Cognito authentication and the local Claude chat are connected; vendor connections, payroll delivery, document-rule extraction and Thread message delivery are demonstrations backed by browser state. Uploaded timesheets supply intake metadata; they do not replace the synthetic engine data. Custom rules are saved in the rulebook but are not compiled into engine calculations. See [UX-FLOW.md](UX-FLOW.md) for the built flow and its limits.

## Routes

- `/timesheets` and `/timesheets/:shiftId?cycle=id`: flags, shifts and shift review.
- `/payroll`: all 26 pay cycles; `/payroll?cycle=id`: worker pay run, totals and batch summary.
- `/rules`: rulebook and rule detail; status remains in detail.
- `/settings?tab=sources` or `?tab=destinations`: configuration and system wiring.
- `/reconcile` and `/reconcile/:shiftId` redirect to Timesheets, preserving query context. `/connect` redirects to Settings, mapping its old `timesheets` / `payroll` tabs to `sources` / `destinations`.
- `/home` and unknown routes land on Timesheets; `/cycles/:id` opens the corresponding Payroll cycle. Setup and authentication gates still apply.

## Run locally

Use Node.js 20.19+ or 22.12+ and Yarn Classic. Run from this directory:

```bash
cp .env.sample .env
yarn install
yarn dev
```

Open <http://localhost:9000>. `.env.sample` contains the public Cognito client configuration. Sign in with email and password; Google SSO also requires this origin to be registered with the Cognito app client.

The agent chat needs a logged-in `claude` CLI on this machine, available on the dev server's `PATH`. The Vite middleware launches that CLI and streams its reply through `POST /api/chat`. It is available through `yarn dev`, not in the static build or `yarn preview`.

`CLOSEOUT_CHAT_MODEL` selects the CLI model and defaults to `sonnet`. Pass it to the dev-server process:

```bash
CLOSEOUT_CHAT_MODEL=sonnet yarn dev
```

## Checks and screenshots

```bash
yarn lint
yarn build
yarn test
yarn preview
```

For local screenshot QA, the explicit development-only flag skips the Cognito gate:

```bash
VITE_QA_BYPASS_AUTH=1 yarn dev --port 9500 --strictPort false
```

This bypass requires `import.meta.env.DEV`; it does not enable authentication bypass in production builds. In the browser console, seed the local demo state before navigating:

```js
// Main tabs. This replaces any existing prototype state in this browser.
localStorage.setItem('closeout-onboarding-v2', JSON.stringify({ forwarded: true }))
location.href = '/timesheets'

// Use { forwarded: false } and /setup/calendar for the setup screens.
```

Capture at 1440×900 and check density at 1280×800 using the prepared headless sweep:

```bash
node tasks/qa/capture-navigation-19.mjs
```

Playwright must already be installed; set `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path if it is outside this app. The script uses isolated browser state, captures Timesheets, Payroll and Settings at 1440×900, checks layout at 1280×800, and closes Chromium afterwards. QA screenshots and audits live in `tasks/qa/`; see `density-audit.md` for the current verification status. Stop the local dev server with:

```bash
lsof -ti tcp:9500 | xargs kill
```

Calendar settings, review decisions, connections, chat history and mediation threads are stored under `closeout-onboarding-v2` in localStorage. This prototype state belongs to the browser, not to a server account.
