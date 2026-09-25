# Closeout

Vite + React 19 + TypeScript app at `/product/`. Payroll brings together pay cycles, time entry review and pay runs; Rules and Settings hold the rulebook and connections. The Closeout Agent sits beside every page. The bench uses synthetic data; connections, Payroll delivery and mediation delivery remain demonstrations backed by browser state.

## Run locally

Use Node.js 22.12+ and a global Claude Code CLI 2.1.282 on your `PATH`, authenticated locally or through `CLAUDE_CODE_OAUTH_TOKEN`. From this directory:

```bash
npm install
npm --prefix server install
CLOSEOUT_DEV_EMAIL=dev@hypertrack.io npm run dev:server
```

In a second terminal, run `npm run dev` and visit <http://localhost:9000/product/>. Vite proxies `/api/*` to the Node server on port 8787, removing `/api`. Development renders the app without a session; the server's email bypass is disabled in production.

Optional server settings go in `server/.env`. Production requires `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `ALLOWED_DOMAINS`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`. `/job/config.js` supplies the public Google client ID. Google sign-in stores a 30-day session under `closeout:session:v1`; `/job` and `/answers` keep their existing session.

## Chat and state

`POST /api/chat` streams Claude Code responses using a server-owned prompt and the current page context. `CLOSEOUT_AGENT_MODEL` selects the model (default `opus`). The server maintains each account's conversation and read-only workspace; `scribe`, `delegate` and `consolidate` are reserved for later phases. Production routes `/api/*` through Netlify to the Fly app `closeout-agent`. `npm run preview` serves static files only.

Workspaces live under `/data/accounts` in production and the OS temporary directory's `closeout-agent/accounts` locally; `CLOSEOUT_DATA_DIR` can override the local data root. HOME remains unchanged. The server ignores npm-injected dependency bins when launching the global CLI.

The server exposes authenticated `GET /state` and conditional `PUT /state` endpoints backed by Supabase. The app's current prototype state still lives under `closeout-onboarding-v2` in localStorage; server synchronization is not connected in this phase.

## Checks

```bash
npm test
npm run lint
npm run build
npm --prefix server test
npm --prefix server run typecheck
```
