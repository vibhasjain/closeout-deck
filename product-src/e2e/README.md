# Clip smoke

Run from `product-src`:

```sh
npm run smoke:clip
```

The command starts the real HTTP server with new in-memory data, journey, memory,
and conditional state stores; seeds its sample data; starts Vite on a free loopback
port; and launches headless Chromium. It closes them and removes temporary data on
completion. No application `.env`, production API key, Supabase, model process,
Google authentication, microphone, or live call is used. Agent/live/firm callbacks
reject; non-loopback server sockets/fetches and external browser requests are blocked.
External font/preconnect links and the shared job config script are removed only
from Vite's served test HTML. Thus fonts use the browser's local fallback.

Playwright resolves from the project's installed dependency first, then the owner's
installed dev-browser skill path documented in `clip-smoke.mjs`. An absent package
or browser produces a failing report; the guard does not download tooling.

At 1440×1080, 1440×900, and 390×844, the runner covers Payroll Review and Collect,
Timesheets, a time-entry sheet, Rules, Profile, all five Rulebook sections, Settings
and every connector tile, account navigation, every sample Issues carousel slide,
Evidence, the next-step row, six onboarding states, and the actual CallScreen with
a mocked session. Phone account actions live inside the navigation drawer. Each
onboarding state uses a fresh browser context for an isolated development identity.
These are render checks: no payroll action, email, upload, or agent request is sent.

`clip-smoke-report.json` records each surface, dimensions, measurements, failure
reasons, and screenshot paths. `clip-smoke-failures/` contains outlined crops. Both
are ignored by Git. The command exits 1 on a defect, missing surface, browser error,
unexpected server call, or execution-budget failure. Exit 0 means every check passed.

The detector examines rendered scroll content, excluding inactive carousel slides
until visited, invisible reserved ActionButton labels, and screen-reader-only text.
Single-line CSS ellipsis is the only automatic truncation exception. There are no
product-defect suppressions. Any future false-positive exception must exactly match
surface, viewport, stable element description, kind and finding reason, with a
reviewed `justification` in `clip-smoke-allowlist.mjs`. Generated screenshot markers
are deliberately never used to match exceptions.

Seven isolated browser fixtures calibrate the detector at the start of every run:
clean exclusions, clipped controls and small icons, card wrappers, page overflow,
forbidden text, phone control height, and native textarea wrapping. Native fields
use their current values; multiline textareas are measured with an invisible
temporary mirror, including soft wraps and empty lines.

## Automatic merge and push checks

`hooks/post-merge` runs after a merge; `hooks/pre-push` blocks pushes on failure.
Hook installation is separate from the tracked code. Do not set a shared hooks path
in this repository: it has parallel worktrees. After reviewing any existing hooks,
enable worktree-specific configuration and install in the intended worktree:

```sh
git config extensions.worktreeConfig true
git config --worktree core.hooksPath product-src/e2e/hooks
```

The post-merge hook cannot roll back a merge. The pre-push hook enforces the check
before a push. Neither hook commits, pushes, deploys, or changes product code.

## Main baseline and regression proof

The lane base `6554404` fails on four real existing defects. Main `c3cc70c` fixes
the phone-header obstruction but still fails on three existing defects: a 13px
sidebar icon, a 12px Rulebook upload icon, and a 32px phone Evidence action. These
remain failures, with an empty allowlist. A clean render exits 0; these baselines
exit 1 until product fixes land in another lane.

The owner's archive report at
`/Users/vibes/Documents/closeout-archive-2026-09-25/plan-inputs/CLIP-SMOKE-REPORT.md`
contains the exact revisions, measurements, screenshots, runtimes, gate results,
and the proof run with the original connect-option CSS temporarily restored. The
CSS was restored byte-for-byte afterward. Current main is checked in an isolated
source snapshot; this lane is neither rebased nor merged.
