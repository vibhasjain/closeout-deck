# /website — HyperTrack homepage proposal (2026-09-16)

Plan: ~/.claude/plans/linear-moseying-breeze.md

- [x] Plan approved (hypertrack.com design system, hand-written CSS, riso monumentalism art ×7, real UI vignettes ×7, script verbatim)
- [x] ART.md (STYLE + 7 scenes); logos + avatar copied; compress.sh at q58
- [x] 7 parallel Codex image sessions (ultra); 7 frames at 1600×900 q58, 217–292 KB, phone variants → assets/art/raw → compress → assets/art + m/
- [x] BRIEF.md (README is in the build brief)
- [x] Codex build session (ultra, session 01a0ab0f, ~12 min) + one 5-item fix batch (resume, ~3 min) → index.html, css/, js/, check.js
- [x] Headless verify 1440/1920/390: overflow, console, assets, fonts, anchors, vignette loops, reduced-motion, weight, screenshots
- [x] Copy audit vs script (30/30 lines verbatim); README claims table (14 ids)
- [x] _headers entry; commit website/ + _headers only; push; live check; report with ?review=1

## Review (2026-09-16)
- Live: https://closeoutcopilot.com/website/ (noindex). Review mode: https://closeoutcopilot.com/website/?review=1 outlines every unconfirmed claim.
- Art: 7 frames "Green Risograph Monumentalism" from website/assets/art/ART.md, 7 parallel Codex image sessions at ultra (~4 min wall), 1600×900 q58 217–292 KB + 960 phone variants; originals in assets/art/raw.
- Build: Codex gpt-6-astra ultra from website/BRIEF.md (hand-written CSS on the hypertrack.com token system + edgework.css in place; no Tailwind CDN). check.js 6/6 pass.
- Verified headless at 1440/1920/390: no overflow, zero console errors/warnings, all 42 images load, Satoshi + JetBrains loaded, anchors land under the nav, 7 vignettes loop and pin under reduced motion, copy audit 30/30.
- Defects found in review and fixed: mobile before/after label wrapping; rules vignette showing all three groups before the observer fired; empty reserved proof cell outside review mode; cropped lit building in the-shift art; tiny Clipboard Health mark (trimmed PNG).

## Round 2 (2026-09-16) — visual before/after + data layer
- [x] Art 08-before-after (same office split night/morning) scene + Codex image session launched
- [x] Palette validated with the dataviz validator: emphasis = green-600 + n300; two-series = #15803d + #818cf8 (hypertrack.com chart-only indigo), direct labels + legend + table view
- [x] Codex fix-2 (resume): #before-after → art + icon comparison grid; new #numbers section (11.5% no-show, 74.2% on-time stacked bar, dumbbell median→best by industry, late-arrival reasons grouped bars, visibility lines); retention band in #next (24→49% bars, $291, 1 in 6, 80%, 16%); industry stat lines; claims.js + README data sources
- [x] Verify (5 charts render with legends, data tables, tooltips; no overflow; console clean; mobile), 08 at 287 KB, commit, push, live

## Round 3 (2026-09-16) — station emblems + full-bleed overlays
- [x] ART.md: STYLE-B emblems (7 objects on white) + overlay compositions (5 scenes recomposed with open paper for type); 12 parallel Codex image sessions at ultra
- [x] Codex fix-3 (resume): emblems in station boxes + sticky menu thumbs; hero/the-shift/next/what/cta → .bleed with scrim, overlaid copy, phone stacking, data-fallback to the original art
- [x] Compress emblems (480² transparent PNG → assets/art/st) and -b compositions (1600×900 + phone); verify legibility of overlaid copy at 1440/1920/390; commit; push; live
- [x] Codex fix-4: Wonolo block rebuilt as a testimonial (Carlos Ganoza, VP of Product, Wonolo; photo from hypertrack.com Top 50 page); check.js allows aria-hidden decorative thumbs
- [x] Verified 1440/390: 5 bleeds full-width with copy on the open side, 14 emblem images loaded, no overflow, console clean; commit + push; live

## Round 4 (2026-09-17) — CEO feedback (Kashyap)
- [x] v3 human-first art: 5 landscape + 5 portrait (phones get full-bleed art with overlaid copy); STYLE-3 in ART.md; lessons + memory updated
- [x] Copy: every pay run; per-pay pricing (data-confirm pricing-per-pay); "The staffing platforms gaining market share are powered by HyperTrack."; one 1M mention; stations 5/7 reworded
- [x] Logos: Instawork + Clipboard Health removed
- [x] Nav = hypertrack.com primary nav; in-page subnav appears after the hero
- [x] New #rulebook section (state/city · contracts · this-week + compiled example)
- [x] Before/after: "A good middle office today" column rewritten for the ICP; v1 image (no hologram) restored
- [x] Hero carousel: 4 slides (hero, the-shift, next, what), 5 s autoplay, dots + counter + progress, pause on hover/click, keyboard + swipe, reduced-motion static
- [x] Pushed back: horizontal-scroll banners (folded into the carousel instead); kept the eight agents
- [x] Verified 1440 + 390, no console errors, no overflow; live

## Round 5 plan (2026-09-17, from the 15:52 review voicenote) — DONE (commit dd3a930, live)
Plan file: website/PLAN-r5.md (self-contained; run after /clear with permissions bypassed).
- [x] Three hero slides (fastest growing + 140% vs 7% subtext with SIA fine print · Fortune 1000 prefer HyperTrack customers · AI already runs recruiting / agent teams), human-first art from the deck's scenes
- [x] Logo marquee → Shift Work Summit speakers row in Jared's order, replay links
- [x] "What we do" one-liner + Validate/Reconcile/Pay + Shift Reliability Report chip
- [x] Case studies at the bottom, connectors, "Priced per pay", plain Book a demo, no closing banner
- [x] Cut: stat row, numbers, retention, 8 agents, compiler (parked in product-sections.html), before/after, industries, coin CTA
- [x] Nav: Shift Work Summit dropdown 2025/2024/2023/2022
- [x] Verify at 3 widths, copy audit, push, live

### Review (2026-09-17)
- Shipped as one commit (website/ only), live on closeoutcopilot.com/website in ~60s. check.js 6/6, site.js/claims.js parse, copy audit clean (every plan headline verbatim; no "pay run", "shift work", "Closeout Copilot", "1,000,000").
- Headless dev-browser at 1440x900, 1920x1080, 390x844: no console errors, no overflow, all images load, autoplay + arrows + dots work, dropdown opens on hover/click/Enter and closes on leave/Escape, speaker arrows page and disable at the ends, 9/9 replay links are YouTube. First view 363 KB local / 320 KB live (slides 2-3 art now loads after window load; it was 736 KB before).
- Art: v7-01-hero and v7-03-middle-office accepted first pass. v7-02-fortune (both orientations) REJECTED by me after the operator's own retry: desaturated photo on white paper, yellow sunrise. Re-ran with a "hand-drawn, cream not white, no sun" paragraph; accepted r2 (vests came out green, faces still slightly photographic).
- Layout change the plan did not spell out: the generated art puts faces at ~33% from the top, not 45%, so full-bleed cover put the nurse's face under the copy. The art now hangs from --art-top (anchored to its top edge, masked fade), so faces clear the copy at every width and the viewport crops feet instead. Scrims removed.
- site.css 48 KB -> 16 KB (rewritten, not patched). Eight agents + compiler parked in website/product-sections.html.
- Own headless dev-browser on :9322 because a visible one from another session was already on :9222; left that one alone.
- OPEN: (1) SIA 7% is unverified and a search summary of SIA's September 2026 update says 2.4% — tagged sia-growth-7, needs Jared before anyone outside sees it; SIA link now points at the real September 2026 update URL (the plan's URL is not a real page as far as search shows; SIA blocks bots so neither could be opened). (2) Jarah Euston: CSV says CEO, page uses Jared's "President & COO". (3) Report URL, 140% + Fortune 1000 fine print sign-off, Nursa case study, ShiftKey logo rights, summit dropdown on hypertrack.com itself.

## Round 5 follow-ups (2026-09-17/18, owner feedback after r5 shipped) — DONE
- [x] Hero r2: nobody asleep under "fastest growing" (morning bus, crew awake) — 163b30c
- [x] "What we do" = mini product page: emblem + copy + live vignette per step, eight-emblem team strip, primary product CTA — 163b30c
- [x] Customers: header + logo line removed; second tile is the Nursa case study with the real link (Wonolo tile out) — 163b30c, 4fec3b2
- [x] Vignettes start on page load, no scroll trigger — 38eb442
- [x] Product page: website/product.html (walkthrough + compiler from the parked sections; css/product.css, js/product.js; check.js check 7) — 4fec3b2
- [x] HyperTrack staging: hypertrack-content PR #326 → website/internal/home-r5/ (staging-only, never live). Verified headless on https://d2fl0lyth9sw03.cloudfront.net/internal/home-r5/index.html and /product.html: no 4xx, no console errors; hypertrack.com/internal/home-r5/index = 404.
- OPEN: SIA 7% vs 2.4% (unverified), 140% + Fortune 1000 sign-off, Nursa case-study approval (owner asked for it on the page; meeting had it pending), report URL, port to the site's Tailwind design system before it can replace the real homepage.
- 2026-09-18: owner moved all homepage/product work to hypertrack-content website/internal/home-r5 (staging). closeout-deck/website frozen at 4fec3b2.

## /retail deck (2026-09-19) — DONE
- [x] closeoutcopilot.com/retail: Kashyap's 7-slide "Accurate billing is a talent strategy" script, copy verbatim, new frame per slide (6 Codex ultra sessions + story frame 27 for slide 4), shares story/deck.css + deck.js — dac3d4f
- [x] Six VMS tiles in logos/tiles (SAP Fieldglass = SAP mark, Workday VNDLY = Workday mark, Beeline, Magnit, Coupa, Simplify) on slide 5
- [x] og-image.jpg from frame 01; /retail.pdf (7 pages, 1280x720) + retail/render-pdf.mjs; PDF also on Desktop — 364a00f
- [x] Desktop: hypertrack-story-images-skill.zip for Kashyap (Keychain-stored key, generate.py, tested live)
- Dropped by owner: the story-deck asset zip for Kashyap (superseded by /retail).

# Closeout rebuild: J&J-style agent app (2026-09-25)
Plan: ~/.claude/plans/okay-huge-message-incoming-flickering-clock.md (A1–A3 amendments: stays at /product, Fly verifies Google ID tokens, psql migrations)
- [x] P0 inputs archived (~/Documents/closeout-archive-2026-09-25), untracked + dirty files backed up
- [x] P0 secrets in Keychain (closeout-openai, closeout-supabase-*, closeout-session-secret)
- [x] P0 Supabase alzxujpjpfqmoqplwfbh: closeout_* tables, RLS on, anon sees nothing
- [x] P0 Fly app closeout-agent + volume closeout_data (sjc) + 9 staged secrets (Claude token from agent-keyboard)
- [ ] P0 /answers questions → onboarding (OPERATE / STEER / NEED-FINDING) folded into P5
- [ ] P1 publish whitelist (dist/), legacy nuke, docs non-public
- [ ] P2 landing (homepage + /closeout) — Codex, worktree
- [ ] P3 Fly backend (CLI chat, /session Google verify, /state) + /api proxy
- [ ] P4 shell (sidebar, docked agent, Getting started)
- [ ] P5 onboarding (coworker questions, your-data/sample, pre-read, profile, rulebook)
- [ ] P6 voice (GPT-Live-1 + gpt-live-transcribe)
- [ ] P7 first run + journey (task card, findings, next steps, Send to Payroll, disputes)
- [ ] P8 memory (instincts, consolidate, sync)
