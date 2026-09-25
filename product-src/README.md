# Closeout

Vite + React 19 + TypeScript app at `/product/`. Payroll brings together pay cycles, time entry review and pay runs; Rules and Settings hold the rulebook and connections. The Closeout Agent sits beside every page. The bench uses synthetic data; connections, Payroll delivery and mediation delivery remain demonstrations backed by browser state.

## Run locally

Use Node.js 22.12+ and a global Claude Code CLI 2.1.282 on your `PATH`, authenticated locally or through `CLAUDE_CODE_OAUTH_TOKEN`. From this directory:

```bash
npm install
npm --prefix server install
NODE_ENV=development ALLOWED_DOMAINS=hypertrack.io SESSION_SECRET="$(openssl rand -hex 32)" CLOSEOUT_DEV_EMAIL=dev@hypertrack.io npm run dev:server
```

In a second terminal, run `npm run dev` and visit <http://localhost:9000/product/>. Vite proxies `/api/*` to the Node server on port 8787, removing `/api`. Development renders the app without a session; the server's email bypass requires explicit `NODE_ENV=development`, a loopback connection, and an allowed email domain. Outside production the server listens only on `127.0.0.1`.

Optional server settings go in `server/.env`. Production requires `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `ALLOWED_DOMAINS`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`. Startup requires a `SESSION_SECRET` of at least 32 UTF-8 bytes in every environment. `/job/config.js` supplies the public Google client ID. Google sign-in requires a matching, allowed hosted-domain claim and stores a 7-day session under `closeout:session:v1`; `/job` and `/answers` keep their existing session. The server rechecks allowed domains on every authenticated request.

## Chat and state

`POST /api/chat` streams Claude Code responses using a server-owned prompt and the current page context. `CLOSEOUT_AGENT_MODEL` selects the model (default `opus`). The server maintains each account's conversation and read-only workspace; `scribe`, `delegate` and `consolidate` are reserved for later phases. Production calls `https://closeout-agent.fly.dev` directly through the client's shared `API_BASE`; development uses the Vite `/api` proxy. `npm run preview` serves static files only.

Turns have a 180-second wall-clock limit (`CLOSEOUT_CHAT_TIMEOUT_MS`; other modes use `CLOSEOUT_<MODE>_TIMEOUT_MS` when enabled) and a CLI budget of $2 (`CLOSEOUT_TURN_BUDGET_USD`). Each email can attempt 30 turns per sliding ten minutes. Global admission allows three turns, counting reserved account waiters, with a 30-second wait before HTTP 429. Admission happens before SSE so overload can return an HTTP status; admitted requests get immediate headers and 15-second keepalives while waiting for their account. Each account allows one running and one waiting turn. Leaving the chat aborts the request; conversation history has no clear control.

Workspaces live under `/data/accounts` in production and the OS temporary directory's `closeout-agent/accounts` locally; `CLOSEOUT_DATA_DIR` can override the local data root. HOME remains unchanged. The server ignores npm-injected dependency bins when launching the global CLI.

The container entrypoint briefly runs as root to create and chown the persistent `/data` mount, then uses `gosu` to exec the server as `node`. `HOME=/data` remains writable for Claude session files. CLI children receive only `PATH`, `HOME`, `LANG`, `TZ`, and `CLAUDE_CODE_OAUTH_TOKEN`.

The server exposes authenticated `GET /state` and conditional `PUT /state` endpoints backed by Supabase. The app's current prototype state still lives under `closeout-onboarding-v2` in localStorage; server synchronization is not connected in this phase.

## Data backbone and deployment

The authenticated `/files` and `/data/*` routes normalize uploaded timesheets, persist entries and run the engine per workweek. `POST /data/sample` renders CSV files and sends them through the same pipeline. The desk UI still uses its existing synthetic path until session B. `GET /health` includes the imported engine's `engineSha`.

Migration `server/supabase/migrations/0002_closeout_data.sql` creates the data tables and private `closeout-files` Storage bucket. Apply it separately before using the Supabase datastore; all new tables have RLS enabled with no policies. Local tests use the in-memory datastore.

The Docker build context is this `product-src/` directory. From here, the exact deployment command is:

```bash
fly deploy . -c server/fly.toml --dockerfile server/Dockerfile
```

The context whitelist includes only the server and the shared engine, cycle and sample modules; it excludes environment files, dependencies, tests and migrations. The production entrypoint still drops to the `node` user, and the CLI environment allowlist and `NODE_ENV=production` remain in place.

## Checks

```bash
npm test
npm run lint
npm run build
npm --prefix server test
npm --prefix server run typecheck
```
