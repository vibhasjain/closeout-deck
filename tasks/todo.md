# /report page + scoped Agent Keyboard demo access (from voicenote 2026-08-19)

Goal: host the reliability report at closeoutcopilot.com/report behind password
`hyp3rtrack` (asked once, remembered), with Agent Keyboard on it, and give the
boss a login that can edit that page and only that page.

## closeout-deck (this repo)
- [x] `report/` — 4 S3 pages copied (index, on-time-light, on-time-healthcare, no-show-benchmark); AK widget tag + noindex on each
- [x] `netlify/edge-functions/report-gate.js` — server-side password gate on /report(/*), 1-year cookie, password from `REPORT_PASSWORD` env
- [x] `netlify.toml` — edge function entries for /report and /report/*
- [x] `netlify env:set REPORT_PASSWORD hyp3rtrack` (site linked to closeoutcopilot)

## agent-keyboard (~/agent-keyboard)
- [x] `auth.ts` — allowed-emails.json entries may be scoped `{email, sites, pathPrefix}`; scope on AuthedUser; `allowsSite()`
- [x] `index.ts` — scoped users 403'd off other sites (messages/follow-ups/uploads/restart/compact/conversation/jobs/stream/cancel; /sites filtered; /jobs-feed denied); path-scope server note rides every prompt + follow-up; fixed pre-existing hole where a follow-up could target another site's job
- [x] `invite.mjs` + SKILL.md — `--sites` / `--path` flags; re-inviting replaces the entry
- [x] `SELF_HOSTING.md` — scoped-users note
- [x] `src/dev/scope-check.ts` — passes; `npm run typecheck` clean; gate behavior-tested with node harness (6 scenarios)

## Review
- Password gate is server-side (edge function) — content never served without the
  cookie; password lives only in Netlify env (repo is PUBLIC). Note: the report
  HTML itself sits in this public repo, so it's gated on the site but visible to
  anyone browsing the GitHub repo. Flagged to user.
- Path scope (report/ only) is a server-authored prompt constraint, not a hard
  sandbox — the agent runs bypassPermissions in the repo checkout. Site scope IS
  hard (auth-level). Every change is an auditable, revertible git commit.
- NOT committed/deployed (repo rule): user commits both repos, runs
  `fly deploy` in ~/agent-keyboard/server, then invites the boss from the bar.
