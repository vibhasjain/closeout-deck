
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

## 2026-08-31 — Prototypes ship on the site, in the ShopStream design language
- **What happened:** I built the rule-compiler prototype as Claude artifacts with a new light design. User: "Unpublish the Claude artifact thing… build the new thing on our website" + "use that exact design language" — the ShopStream three-pane system (shopstream-cx), specifically the casebuilder pattern (clickable rule citations opening a source drawer, not a third pane).
- **Rule 1:** deliverables for this user default to real pages on closeoutcopilot.com (repo dirs like /bench, /payroll), not Claude artifacts. Artifacts are fine only as scratch previews.
- **Rule 2:** for tool/workbench UIs, the house design language is ShopStream's: strict B&W Inter 13.5px, color only as status dots (solid green / verify amber / pending blue / nosource red / internal orange), 320px queue + detail + aux pane, h-12 topbar, h-14 toolbars, border-l-2 selected rows, tinted .cite highlights → 480px right drawer, dashed-orange mono "whisper" cards, master/detail mobile. Transcribed CSS lives in shopstream-cx/casebuilder/web/styles.css.
- **Rule 3:** no full-page tab switches for related data — tabs are allowed, but each tab is itself a three-pane layout, and cross-references open in the drawer.
- **Addendum (same day):** casebuilder ≠ the reference — user wants the *original* ShopStream app's restraint. Operational spec from the correction: ONE tag design for everything (CitedText's chip: grayscale mono 10px, 1px border, muted bg, invert on hover); color only as 6px dots on states needing a human (amber flag/review, blue held); pass/neutral states are plain muted text, never pills; topbar = logo only, no wordmark text; aux-pane headers one quiet word; highlights gray not orange; the orange dashed whisper reserved for genuine agent↔operator back-channel moments only.
- **Addendum 2 (same day):** "eight fonts" = treatment sprawl, not families. The /job app is the type reference: Inter for ALL UI text (tags, statuses, notes, buttons, callouts included); mono ONLY for data — ids, clock times, money, meta lines, code blocks — plus exactly one label treatment (mono 10.5 uppercase tracking-wide muted). Links are muted underlines (decoration-border, darken on hover), never blue. No colored callout boxes; a compiler question is the quote idiom (2px left hairline, italic-adjacent, Inter). Before styling any new surface: census the reference app's treatments (grep text-[..px]/font-mono/uppercase) and stay inside its set.
- **Addendum 3 (same day, casing + affordances):** Tags are Title Case (Every Word), and every status is a tag — Pass/Applied/Human/N/A included, never bare text. All other UI text is sentence case; lowercase starts only for code tokens. Anything clickable that opens something (source docs, "Open in Rulebook") is a standard outline button, never a floating underlined link. All pills fully rounded; colored tags are tinted pills (job client/agency idiom), never a colored dot inside a neutral pill. Queue toolbars: one row — magnifier icon left of filter chips that swaps into the search input on click; no standalone search bars, no explainer sentences in toolbars.

## 2026-09-08 — Codex lane must actually run at ultra; verify the log header, monitor the run
- **What happened:** I routed the bench build through the `/codex:rescue` forwarder; its wrapper caps `--effort` at xhigh, so the run went out at xhigh. User: "fire that shit on ultra bro why the fuck did we do extra high". I killed/restored and relaunched.
- **Rule:** for Codex work, launch `codex exec` directly: `-m gpt-6-astra -c model_reasoning_effort=ultra -c service_tier=fast -s workspace-write -o <last.md> - < prompt.txt`, then `grep "reasoning effort: ultra"` in the log header within the first seconds — if it isn't ultra, kill it before it edits anything. Don't trust a forwarder to pick the effort.
- **Rule:** "keep an eye on these" = a Monitor that emits one line/min (log bytes, file mtimes, last line) and prints the final report on exit; check any new error-line count immediately. Snapshot the tree before killing a run that may have written files, and regenerate the baseline deterministically (from HEAD) rather than trusting a half-written state.
- **Rule:** Codex follow-ups go to the same session via `codex exec … resume <session-id> - < fix.txt`; a tight numbered defect list with a measurable target (e.g. `table.scrollWidth <= pane clientWidth at 1440×900`) came back correct in 3 minutes.

## 2026-09-08 — Third-party logos in a connections list are uniform icon tiles, not proportional wordmarks
- **What happened:** I rendered vendor wordmarks height-fitted (48×20) and grayscale per the ShopStream restraint rule. User: "why the fuck are the logos all different sizes… use the brand color, just standardize them."
- **Rule:** integration/connection lists use the app-icon idiom: one fixed square tile per vendor (32px rows, 44px headers, radius 8/10, 1px border), the vendor's square icon mark in full brand colour, name text beside it. Never wordmarks of varying aspect, never grayscale on third-party brand marks — the restraint rule is for OUR chrome, not their logos. Source icons from apple-touch-icon / favicon endpoints, which are already square and standardized; make a contact sheet and look at it before shipping.
- **Rule:** connection screens are not "the product": Connect (sub-tabs per system type) → the work screen → rules. One payroll system per customer; many timekeeping sources (one per client site). Don't give each connection type its own top-level tab.

## 2026-09-08 — Composer chrome: no explainer text, placeholder only
- **What happened:** the custom-rule composer had a label ("Write it the way you'd tell a new payroll clerk"), a placeholder, AND a helper line ("A synthetic compile previews…"). User: "three fucking placeholder text… just the one inside the text box is enough." And the "Add rule" text button should be a plus icon button.
- **Rule:** one hint per input, and it lives in the placeholder. No labels or helper sentences on a single-field composer. Toolbar "add" affordances are a `.icon-btn` with a plus glyph, not a text button. Applies to every builder brief: say "placeholder only, no label, no helper copy" explicitly.

## 2026-09-11 — Batch image generation on the Codex lane: fan out one session per image from the start
- **What happened:** I ran 12 storyboard frames in ONE `codex exec` session (for cross-frame consistency); ~3 min/frame. User: "dawg launch parallel codex's shit is taking too long". Nine parallel single-frame sessions finished the remaining 9 in ~5 minutes, and consistency was fine because the STYLE block is identical text — the session gives no extra consistency.
- **Rule:** for N independent generations (images, clips, per-file drafts), launch N `codex exec` sessions in parallel immediately; sequential only when a step truly needs the previous output. Verify `reasoning effort: ultra` in each log header.
- **Rule:** when extracting slugs with awk from a "### 01 · slug" line, the middle dot is its own field — print the field, then test on one line before launching nine jobs (I launched with empty slugs and had to kill/relaunch).
- **Rule:** dev-browser checks against python http.server: the stylesheet gets heuristically cached between runs — version the `<link href="x.css?v=N">` or the fix you just made won't show in the re-verify.

## 2026-09-11 — Story decks: illustration only, one point once, no sprite close
- **What happened:** I extended /story with 8 product-component screenshots, 2 data-beat screenshots and the house sprite close slide. User: "the last slide fucking sucks", "you're repeating yourself too much", "fuck UI… we're just using the same illustration language… even when we want to show UI we abstract it away into illustrations", "30 slides might be a little intense".
- **Rule:** in a narrative/storyboard deck, every slide is a frame in the one illustration language — product is shown as an abstracted scene (digital worker at a virtual browser, flag → clause → chalkboard rule), never as screenshots. Real brand marks come in as an HTML overlay of our logo tiles, not from the image model.
- **Rule:** one point, one frame. Before adding a slide, check whether an earlier frame already made that point (three sources, every source side by side) and cut it. Aim for ~20, not 30.
- **Rule:** don't end on the generic sprite/tagline slide; end on the strongest frame of the story with its own line.
- **Rule:** headline copy must be concrete enough that the user can picture it; "Every punch beside every other source" failed that test.

## 2026-09-16 — Enterprise imagery: humans first, technology quiet
- **What happened:** two rounds of website art were rejected. Round 1 ("Green Risograph Monumentalism") read as Orwellian/depression-era: colossal buildings, tiny figures, gloom. Round 2 over-corrected into sci-fi: giant wireframe agents, holographic towers, "youngsters climbing a futuristic ladder". CEO: "AI overlord imagery… will scare our customers away"; "our world is that workforce is on the field, and hq is human + machine"; the storyboard deck "worked because it captured human emotion".
- **Rule:** for HyperTrack marketing art, the subject is always a person with a readable face: a worker in the field or an ops person at HQ, large in frame, calm and capable. Technology is a lit phone, a laptop glow, a wall map with pins, a thin green line. Never wireframe/holographic people, robots, towers, temples, crowds of tiny figures, paper mountains. Style (riso, cream, green) can stay; content carries the emotion.
- **Rule:** before generating a set, write the emotion each image must evoke next to its headline, and check the prompt against the headline ("fastest growing companies" ≠ a factory at dawn). Prompting is the whole game.
- **Rule:** generate a portrait 9:16 variant (subject top 55%, bottom open for type) alongside every landscape hero-style image so phones get full-bleed art with overlaid copy instead of image-then-text.
- **Rule:** never load the Agent Keyboard widget on a page that is a proposal for a third-party site; keep 1,000,000-shift and per-shift language to one mention; pricing is per pay run, not per shift; no logos without confirmed naming rights (Instawork, Clipboard Health are out).

## 2026-09-17 — Image operators accept their own second attempt; the orchestrator still has to look
- **What happened:** v7 art ran as six parallel Codex sessions with a "regenerate once, accept the second regardless" rule. Two of six (both fortune frames) came back as desaturated photographs on white paper with a yellow sunrise, and the operator accepted them as instructed. I caught it only because I viewed a contact sheet before wiring them in.
- **Rule:** always view every generated image (contact sheet, landscape + portrait) before building on it; "accept the second attempt" is the operator's stop rule, not mine. When re-running, name the defect in the brief and append a corrective paragraph to the prompt ("hand-drawn illustration, contour lines and halftone, paper is cream never white, no sun, no warm tones") — that fixed it in one pass.
- **Rule:** COMPOSITION-TOP does not actually keep the top 45% empty when the subject is "large in frame"; faces land around 33%. Do not rely on the image to clear the headline: hang the art below the copy in CSS (top offset + object-position top + mask fade) and let the viewport crop the bottom.
- **Rule:** when a plan hands me a source URL and a number, try to verify both. Here the SIA URL was not a real page and a search summary of the real report gave 2.4%, not the 7% from the meeting. Ship the owner's number, tag it data-confirm, and put the discrepancy at the top of the final message.

## 2026-09-17 — Read the art against the headline before shipping; a "what" block needs product, not prose
- **What happened:** r5 hero shipped with workers asleep on a bus under "The fastest growing staffing companies…". User: "it shows people sleeping. And we're trying to say fastest growing." The plan's scene literally said "other shift workers dozing" and I executed it, even though the Sep 16 lesson already says to check the prompt against the headline. Then the "what we do" block shipped as three text columns: "Visuals man… can't just say stuff", "the what is the hero… it's a mini version of an extended product page… don't just relegate the whole thing, pick stuff from it". And "What our customers say." + a logo line: "Don't need to say this at all, the customer tiles are enough."
- **Rule:** a plan written by the owner is still checked against the owner's standing lessons. Before generating, read every SCENE next to its headline and ask "what would a skeptic say this picture means?" Sleeping, tired, slumped, waiting, queuing = never under a growth/speed headline. Fix the scene and say so, don't execute it.
- **Rule:** when a meeting says "cut feature detail from the homepage", it means cut the length, not the product. The "what" section is the hero of the lower page: emblem + one line + a LIVE product vignette per step, the tool emblems as a team strip, primary CTA to the product page. Never ship a what/how block that is only text columns.
- **Rule:** no section headers that only announce the section ("What our customers say."). If the tiles are self-evident, they stand alone.
- **Rule:** the station emblems (assets/art/st, STYLE-B) are the owner's preferred abstraction language for product concepts; reuse them before generating anything new.

## 2026-09-18 — "Use that header" was ambiguous; I picked a reading and built on it
- **What happened:** user: "why do we have two different headers… just use that header". I read "that" as the live hypertrack.com header, pasted it in with Tailwind and shipped (PR #328). They meant the opposite: OUR new header becomes the global one. An hour of work reverted in #329.
- **Rule:** when a pronoun decides the direction of a change ("that header", "this one", "the old way") and the two readings are opposite, ask one short question before building. It costs ten seconds; the wrong reading cost two PRs. Signal I missed: the user had just spent a day designing the new header (SWS dropdown, transparent, Book a demo) — they were never going to throw it away.
- **Rule:** in a script that checks "is X already set?", never test for a string that also appears in the content being injected (the fragment's own comment contained `data-ht-header="overlay"`, so the check was always true). Match the actual tag.

## 2026-09-19 — Secrets: make the refusal impossible instead of arguing with it
- **What happened:** a colleague pasted an OpenAI key into a Claude chat to generate deck images; Claude told him to rotate it and refused to use it. Owner: "this is just fucking embarrassing… is there not a skill file I can pass him that'll just make this work?"
- **Rule:** when someone non-technical needs Claude to use a credential, never route the secret through the conversation. Ship a skill whose setup script stores the key in the macOS Keychain (hidden `read -s`, run in Terminal) and whose worker script reads it; SKILL.md tells Claude it never needs to see the key and what to say on `NO_KEY`. Test the whole path live before handing it over, and state the quality gap honestly (API `gpt-image-1` is flatter than the Codex-pipeline frames).
- **Rule (zsh):** `"$f[0]"` is a zsh array subscript, not ImageMagick's frame selector. Write `"${f}[0]"`.

## 2026-09-24 — /answers gate: `hidden` lost to `display:flex`
- **What happened:** shipped /answers with `<div class="gate" hidden>`-style toggling while `.gate`/`.app` had `display:flex`. Signed-in viewers (session reused from /job) got the gate text stuck on screen, no login button, table pushed below the fold. User: "there is no login button bro". I had only syntax-checked the JS, never rendered the signed-in path.
- **Rule:** any page that toggles with the `hidden` attribute gets `[hidden]{display:none!important}` up front.
- **Rule:** for an auth-gated page, verify BOTH paths headless before saying done: signed-out (button renders) and signed-in (inject the real data + call render, screenshot desktop and 375px). Project "don't open a browser" means no visible windows, not no verification.

## 2026-09-24 — "Put this in the top bar" meant the title, not the widget
- **What happened:** user sent a screenshot from another site with "right align this and put it in the top bar". I decided "this" was the Agent Keyboard pill and CSS-forced the widget into the /answers top bar. They meant the page title line. User: "WHY THE FUCK IS AGKB FLOATING IN THE TOP RIGHT… THAT SHOULD BE IN THE REGULAR BOTTOM RIGHT POSITION".
- **Rule:** never move the Agent Keyboard widget off its default bottom-right position unless the user names it explicitly. It is chrome, not page content.
- **Rule:** when a screenshot comes from a different site than the one being edited, "this" most likely refers to a pattern on OUR page. Ask one short question if the referent is not visible in our page (same rule as 2026-09-18).

## 2026-09-24 — /answers data fixes kept reverting ("WHY CAPS IN THE NAME", "unidentified Traba speakers")
- **What happened:** I cleaned names in my local scratch answers.json and uploaded it, then later edits by the Fly agent (LinkedIn task) and re-uploads from stale copies brought JACOB LAUFER and the "unidentified … Merged Audio" entry back. The owner saw the same bug twice.
- **Rule:** once a dataset has a canonical home (here: cloud/files/answers/answers.json in closeout-jobs-worker on Fly), every fix is applied THERE (pull, edit, commit, push), never to a local copy that later gets re-uploaded.
- **Rule:** every data-quality fix also becomes a guard in code (the sync's merge step and the page render), so the next writer can't reintroduce it.

## 2026-09-25 — "Latest voice note" lives in Voicenotes, not only Downloads
- **What happened:** the owner said "pull my latest voice note… in my downloads folder, the latest video in the transcript." I read only the Downloads .srt (the Jack & Jill walkthrough) and never checked the Voicenotes MCP, where the owner's 16-minute build brief (11:36) was. It surfaced 90 minutes later, after four clarifying questions and three design lenses had assumed the wrong backend. Owner: "Wait a minute, my 1136 brief, you didn't have that at the beginning of this thing?"
- **Rule:** "voice note" means check the Voicenotes MCP (`list_notes` for today) AND Downloads before planning anything. Read every note from the session's day in full.

## 2026-09-25 — Newest-tech picks get no fallback
- **What happened:** I planned GPT-Live-1 with a fallback to gpt-realtime-2.1. Owner: "There is no falling back, bro. We're gonna use GPT live one no matter what."
- **Rule:** when the owner picks the newest model or vendor, plan only that. Blockers get solved on it. Errors show Retry; the user chooses any exit. Gate briefs with a grep for the old names.

## 2026-09-25 — `publish = "."` published internal docs
- **What happened:** closeoutcopilot.com served `tasks/lessons.md`, `CLAUDE.md` and `customer-discovery.md` publicly (HTTP 200) because Netlify published the whole repo.
- **Rule:** static sites publish an explicit whitelist dir (`dist/`), assembled in the build. Anything not whitelisted is private by default.

## 2026-09-25 — Plans must survive "clear context + bypass permissions"
- **Rule:** every plan is self-contained (a Start-here section, input locations copied out of /tmp, skills to load), and when presenting it I say it's ready for clear-context + bypass. Secrets go straight to the Keychain and are named by Keychain service only.

## 2026-09-25 — Shared main: Ashish and Agent Keyboard push concurrently
- **Rule:** in closeout-deck, never `git add -A`. Commit explicit pathspecs, `git fetch && git pull --rebase` right before every push, and never touch `answers/` unless asked (Ashish owns it right now).

## 2026-09-25 — Server deploy must succeed before the client that needs it ships
- **What happened:** I pushed the P6-fix commit even though `fly deploy` exited 1. The new server imported a shared client file (`src/lib/inbox.ts`) that the Docker image never copied, so production crash-looped on boot, and the already-deployed client called routes that weren't there. About 10 minutes of downtime.
- **Rule:** deploy the Fly server first. If `fly deploy` isn't exit 0 with `/health` OK, don't push. Check the exit code in the same command that pushes.
- **Rule:** every `../../src/…` import in the server must be COPYed in the Dockerfile and whitelisted in `.dockerignore`. `server/test/docker-shared.test.ts` now enforces it.
