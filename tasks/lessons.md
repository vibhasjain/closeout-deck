
## 2026-08-19 — "get it done" overrides standing don't-commit rule
- When the user explicitly says "do all of it / don't ask", the CLAUDE.md
  "user commits" rule is overridden for that task — commit, push, deploy, verify.
- Before declaring a deploy blocked on a dead local token, check the repo's real
  deploy path first: agent-keyboard deploys via GitHub Actions on push to main;
  no local flyctl auth needed. (Local ~/.fly token IS expired — fm2_ macaroon 403s.)
- Server-side ops on agent-keyboard without fly access: drive them through the
  bar itself as owner (creds in ~/.claude/sessions/agent-keyboard-login.json,
  Supabase URL/anon key are public in widget.js; password-grant → Bearer token).

## 2026-08-19 — don't ship a cosmetic fix over a known state bug
- The tilde-hide scroll-freeze was foreseeable (noted the widget's body scroll
  lock while building the toggle) but I only fixed the visual shift
  (scrollbar-gutter). If a hide/close path can leave another component's
  page-level state (scroll locks, position:fixed, listeners) engaged, release
  that state in the hide path itself — display:none never cleans up.

## 2026-08-21 — "Fix it" on a live site means deploy it, and verify on the deployed URL
- User reported a bug on the live /job page. I fixed + built locally and stopped ("don't commit" rule). User: "still not working, did you test it on live?" then "WHAT ARE YOU WAITING FOR".
- Rule: when the bug report is about a LIVE URL, the deliverable is the live URL working. Reproduce on live first (dev-browser), fix, verify locally, then say in ONE line that it needs a commit to deploy — don't bury that at the end. If the user is clearly in "just fix it" mode, ask the commit question up front, not after a second round.
- Rule: widget-in-shadow-DOM + global keydown handlers → always check `e.composedPath()[0]`, not `e.target`.

## 2026-08-26 — Carry the user's tool preferences into every subagent brief
- **What happened:** the global CLAUDE.md says "always use dev-browser, never Playwright/chrome MCP" for browser verification. I wrote a Codex build brief that told Codex it could take Playwright screenshots. User corrected: "use dev browser not playwright".
- **Rule:** when delegating to any lane (Codex, Sonnet, Opus, Workflow), the brief must restate the user's standing tool/workflow preferences that apply to that lane (browser = dev-browser only; don't open a visible browser; don't commit; image compression rules). A subagent has no CLAUDE.md context — the brief is its CLAUDE.md.
- **Also:** browser verification is the orchestrator's job (dev-browser skill), not the builder's; tell builders to skip screenshots entirely.

## 2026-08-26 — Don't assume the project CLAUDE.md theme rule still reflects the site
- **What happened:** I recommended dark mocks because project CLAUDE.md says "dark theme, green accent". User: "light mocks on a light page". The homepage, /job and /healthcare had all already gone light; the dark rule is legacy for pitch.html.
- **Rule:** before proposing a visual direction for a new page, check what the *most recent* pages on the site actually do, and treat a CLAUDE.md style rule that the newest pages contradict as stale — ask, don't assume. (Memory saved: payroll-page-light-theme.)
