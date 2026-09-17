# PLAN r5 — closeoutcopilot.com/website after the Sep 17 review

Self-contained. Written so a fresh Claude Code session can execute it after `/clear`.

## How to start (owner)

1. `/clear`
2. Launch with permissions bypassed so nothing prompts mid-run: `claude --dangerously-skip-permissions` (or `/permissions` → bypass) in `/Users/vibes/Documents/closeout-deck`.
3. Prompt: `Read website/PLAN-r5.md and execute it end to end. Do not ask questions; every decision is in the file. Commit only website/ and push to main when verified.`

## Context the executor must read first

- `website/BRIEF.md` — the original build contract (design system, tokens, file layout, rules). Still binding except where this plan overrides it.
- `website/assets/art/ART.md` — every image prompt so far. STYLE-3 ("v3 — human first") is the language to use now. v4/v5/v6 (monumental, sci-fi city, shuttles) are rejected.
- `story/STORYBOARD.md` — the internal deck's scenes. The CEO wants the website art to carry that deck's human emotion.
- `tasks/lessons.md` (last three entries) — what got rejected and why.
- Source of truth for this plan: Voicenotes recording `Tn78jyuo` (2026-09-17 15:52, "HyperTrack homepage revisions…"). Speaker 2 = Kashyap (CEO), Speaker 3 = Vibhas, Speaker 4 = Jared, Speaker 5 = Ashish.

## Decisions from the meeting (verbatim where it matters)

- **Style:** back to the storyboard's human, emotional "Stan Lee / urban chic" register. Kashyap: "Every slide there is a human emotion." "Our customers care about people… They don't want to see science fiction." Riso technique on cream with green stays; content is real workers and operators, foreground, with stakes. No sci-fi city, no vans-in-rows "assembly line", no blueprints, no code imagery, no monumental buildings.
- **Numbers:** SIA revised the forecast to **7%**. The 1%/7% vs 140% line is not a hero; it becomes **subtext under "fastest growing"** with fine print and a source link. The standalone stat row is cut.
- **Fortune 1000:** new top banner "Fortune 1000 companies prefer HyperTrack customers." with fine print "*Based on our customers' live client lists." Never name Pepsi/McDonald's above the fold.
- **Merge banners:** "AI already runs recruiting. The middle office is next." and "AI agent teams for the middle office of staffing." become one slide. Result: **three** hero slides.
- **Logo marquee is out** (four repeating logos = "the anti-story"). Replace with a **Shift Work Summit speakers swatch**: "Listen to what leaders in staffing have to say about the future of work." Clearly labelled as summit speakers, not customers; each links to the replay. Order = Jared's list (below).
- **Flow = why → what → how.** Add a crisp one-line **"what HyperTrack does"** statement after the social proof, before anything product. Shift Reliability Report link sits directly under it as impact proof.
- **Cut from the homepage** (feature detail belongs on the product page): the 8-agents section, the compiler/rulebook stage, the retention and numbers sections, the industries section (98.7%/97.4%), the before/after banner, the closing coin banner.
- **Keep:** case studies/testimonials (moved to the bottom, under "what"), connectors logo list near the bottom, pricing teaser as a link-out with **"per pay"** not "per pay run", then a plain "Book a demo" and the footer. No closing banner.
- **Shift Work Summit nav:** a dropdown by year 2025 · 2024 · 2023 · 2022.
- **Approved customer marks:** Traba case study and quote; Wonolo (Carlos Ganoza) result line; ShiftKey and Wonolo logos. Nursa case study pending. Lead/Sunderstorm/Gigable excluded.

## Final page, top to bottom

### 0. Nav
Keep hypertrack.com's primary nav as built. Add "Shift Work Summit" with a dropdown: 2025 → `https://hypertrack.com/shiftworksummit`, 2024 → `https://hypertrack.com/shiftworksummit-sessions`, 2023 → `https://hypertrack.com/gigworksummit-sessions/all`, 2022 → `https://hypertrack.com/logisticstechsummit`. Drop the in-page subnav (the page is short now).

### 1. Hero carousel — three slides, text on top, full height, arrows + dots as built
Slide 1 (H1): **The fastest growing staffing companies run on HyperTrack.**
Sub: AI agent teams that close out every pay, settle every discrepancy, and pay every worker right. So the best workers pick you first, and your clients stay.
Proof line (small, with the green dot): **Platforms on HyperTrack grew 140% while the staffing market is forecast to grow 7%.** Fine print (mono 11px): `Sources: SIA U.S. staffing forecast, 2026 · HyperTrack customer cohort analysis` — SIA links to `https://www.staffingindustry.com/research/research-reports/us-staffing-industry-forecast` (verify the URL resolves; if not, link to staffingindustry.com/research), the cohort figure links to nothing yet (keep `data-confirm="growth-140"`).
Art: `v7-01-hero` (below).

Slide 2 (H2 in display style): **Fortune 1000 companies prefer HyperTrack customers.**
Sub: The largest employers in the country choose staffing partners that run on HyperTrack. Fine print: `*Based on our customers' live client lists.` `data-confirm="fortune-1000"`.
Art: `v7-02-fortune`.

Slide 3: **AI already runs recruiting. The middle office is next.**
Sub: AI agent teams for the middle office of staffing. Matching went real time years ago. Pay and bill still run on spreadsheets and a few people who carry it all in their heads.
Art: `v7-03-middle-office`.

Every slide keeps the centered primary "Book a demo" → `https://hypertrack.com/contact`.

### 2. Social proof — Shift Work Summit
Eyebrow (mono): SHIFT WORK SUMMIT · SPEAKERS AND REPLAYS. H2: **Listen to what leaders in staffing have to say about the future of work.** Sub: Staffing's operators and builders have taken the stage at HyperTrack's Shift Work Summit since 2022.
Layout: a horizontally scrolling row of speaker cards (`.spk`, 260px wide, white, 1px n200, radius 16, no shadow): 56px round headshot, name (600), title, company, session title (muted, 2 lines), and a `.btn-secondary.btn-cta` "Watch the replay →". Scroll with the mouse/touch plus small prev/next arrows; no auto-scroll. Under 700px the row scrolls natively.
Order and data (Jared's sequence, use exactly):
1. Curtis Anderson, CEO, Nursa — Building a High-Growth Business in Times of Extreme Uncertainty — `https://youtu.be/Oq1exHaaHGk`
2. Waynn Lue, VP Engineering, Wonolo — Building AI Agents with Empathy for Workers — `https://youtu.be/oT17w6biQr4`
3. Mike Shebat, CEO, Traba — How to Build a Culture for Hypergrowth and Excellence in the Staffing Industry — `https://youtu.be/V4O5MVnD1xw`
4. Novo Constare, CEO, Indeed Flex — How Workforce Automation for Deskless Workers Is Transforming with AI — `https://youtu.be/maesEHlpGow`
5. Barbara Simmer, EVP, Staffmark — Retaining Humanity in a World of Tech — `https://youtu.be/fJI1Q8-3ODM`
6. Jarah Euston, President & COO, WorkWhile — Building worker-first automation with AI — `https://youtu.be/0oPakKA9s1M`
7. Curt Baldwin, CTO, Medical Solutions — The Tech Evolution of Flex Worker Pools — `https://youtu.be/eom9rVnVrgU`
8. Brian Neely, Chief Sales Officer, Job&Talent — Revolutionizing staffing: how Job&Talent leverages technology — `https://www.youtube.com/watch?v=rp-i26osfGI`
9. Ivan Sathianathan, Staff Product Manager, Wonolo, and Kirti Shenoy, Founder & CEO, Zeal — How Wonolo does daily pay for W-2 workers — `https://www.youtube.com/watch?v=hsJu26U47G4` (two headshots on one card)
Headshots: copy from `/Users/vibes/Documents/claude-orchestration/hypertrack-content/website/images/webflow/` (2025 speakers, e.g. `*_Waynn.png`; find each by name with `ls | grep -i <surname>`) and from the `Speaker N Photo` CDN URLs in `…/website/data/sws-2024-sessions.csv` for 2024 speakers (curl them). Resize to 112×112 JPEG q72 into `website/assets/speakers/<slug>.jpg`. Session titles and replay URLs come from `data/sws-2025-sessions.csv` and `data/sws-2024-sessions.csv`; use the CSV value if it differs from the list above.
Fine print under the row: `Speakers appear in their roles at the time of the session.`

### 3. What we do
H2 (display size, centered): **AI timesheet reconciliation for staffing.**
One-liner under it (`.sub`): Location-validated time and attendance, reconciled against your rules and your clients' systems, and paid right, every pay.
Three short columns (`ew-grid-3`, eyebrow + one sentence each): **Validate** — Every arrival, break and departure confirmed from the worker's phone, the client's clock and the timesheet. · **Reconcile** — Every discrepancy settled with the worker and the client while it is fresh, with the evidence attached. · **Pay** — Approved hours to your payroll and billing systems the moment the pay closes.
Impact line with the HyperTrack mark: **Shift Reliability Report 2026 →** as the existing `cite-ht` chip (button; "Coming soon" on click until the report URL is supplied). Caption: What a million validated shifts a month look like, across healthcare and light industrial.
CTA row: `.btn-secondary.btn-cta` "See the product →" → `https://hypertrack.com/closeout`.

### 4. Case studies
Keep the two-column testimonial row exactly as built (Traba quote with Akshay; Wonolo result line with Carlos Ganoza). Add the ShiftKey and Wonolo logo marks (mono) in a small "Customers" line above the row. Header: **What our customers say.**

### 5. Connectors
Keep as built (Timekeeping · Payroll · Billing, colour tiles).

### 6. Pricing
H2: **Priced per pay.** Bullets: Priced on your unit economics. · Contracts from $10k a year. · Paid pilots available. CTA "Full pricing →" → `https://hypertrack.com/pricing`. `data-confirm="pricing-per-pay"`.

### 7. Book a demo
A plain centered block on white: H2 **See it close out a pay.** Sub: We close out a sample of your real shifts and show you every discrepancy the agent finds. Primary "Book a demo". Then the footer as built. No image, no banner.

## Art to generate (Codex image sessions, STYLE-3, human first)

Same pipeline as `website/assets/art/ART.md` (one `codex exec` session per image, `gpt-6-astra`, `model_reasoning_effort=ultra`, `-s workspace-write`, `-C` repo root; verify `reasoning effort: ultra` in the log header; run all sessions in parallel). Each prompt = STYLE-3 verbatim + SCENE + the composition clause. Generate landscape 16:9 with **COMPOSITION-TOP** (subject in the bottom 55%, open cream sky above for the headline) and portrait 9:16 with **PORTRAIT-BOTTOM** (both clauses are in ART.md under "v5 — go big"; they are composition rules only, the sci-fi content of v5 is not reused). Compress: landscape 1600×900 q56 + 960 phone; portrait 1080×1920 q60; run `-fuzz 5% -fill '#efe9dc' -opaque '#ffffff'` so pure white reads as cream. Add the three SCENEs to ART.md under a new "v7 — human, from the deck" heading:

- **v7-01-hero** — from deck frame 05 "trust", the CEO's favourite: Friday evening on a city bus, warm interior light, rain on the windows. Foreground, large in frame: a home-care nurse in scrubs, tired and relaxed, holding her phone; the screen shows a big green check and a deposit tile, no words. Beside her a tote with a child's crayon drawing sticking out, a folded grocery list. Behind her, other shift workers dozing, a warehouse crew in hi-vis with coolers, a driver. Through the window the city at dusk. Her face says relief: it arrived, it was fast, it was right. Only the phone screen is green.
- **v7-02-fortune** — dawn at the loading dock of a national retailer's distribution center. Foreground: the site's general manager in a company fleece with a tablet, shaking hands with a staffing coordinator in a lanyard while a crew of eight workers in hi-vis walks past them onto the floor with lit phones, badges scanned by a kiosk that glows green. Two more crews in matching vests line up behind. The feeling: the big client chose this crew and they showed up. Only the kiosk glow, the phones and a thin line on the floor are green. No logos, no text.
- **v7-03-middle-office** — from deck frame 04: straight-on cut-away of a three-storey staffing office at dawn. Top floor bright: recruiters at curved monitors, a wall map with green pins, relaxed. Ground floor: reception, a client being greeted. Middle floor is the subject: the pay-and-bill team, four people at desks with spreadsheets and printouts, a wall clock, a coffee pot, competent but visibly manual; one of them looks up as a single thread of green light starts down the stairwell from the top floor toward her desk. Faces readable.

Reject-and-retry rule for the operator briefs: regenerate once if any figure is giant, wireframe or holographic; if the people are not the clear foreground subject with readable emotion; if the open area for type is not empty light paper; or if there is text, logos, a third colour, or a 3D/photo look.

## Files and edits

- `website/index.html`: rebuild the body to the seven sections above. Delete the removed sections' markup rather than hiding it. Keep `<head>`, nav, footer, the carousel machinery, `.cite-ht` button behaviour, parallax on hero art, review mode.
- `website/css/site.css`: remove rules for deleted sections (`#numbers`, `#retention`, `#agent-rules`, `#how-it-works`/`.hiw-*`/`.vig`, `#rulebook`/`.compiler*`, `#before-after`, `#industries`, `#cta` bleed, `.subnav`, marquee); add `.spk` cards, the SWS row, the "what" block, the nav dropdown. Target ≤ 20 KB.
- `website/js/site.js`: drop the vignette `loop()` and compiler tab code; keep carousel, nav scroll state, parallax, cite-ht, missing-image, review mode; add the speaker row arrows and the nav dropdown (hover + click, `aria-expanded`).
- `website/js/claims.js` and `website/README.md`: prune to the claims still on the page (growth-140, fortune-1000, pricing-per-pay, report-locked, wonolo-15-80, naming-rights-shiftkey, naming-rights-wonolo, quote-competitive-advantage, call-expectations) and add the speaker list with sources.
- `website/check.js`: keep all six checks; check 2 now covers the nav dropdown links resolving (external URLs are fine) and every `.spk` card having a headshot and a replay URL.
- `website/assets/art/ART.md`: append the v7 heading and scenes. Move the compiler section's HTML to `website/product-sections.html` (unlinked) so it can be lifted onto the product page later; note that in README.
- No Agent Keyboard widget on this page. No links to hypertrack.com/research.

## Verify before pushing

1. `node website/check.js` and `node --check website/js/site.js` pass.
2. Headless dev-browser (`/dev-browser` skill, headless; never a visible browser) at 1440×900, 1920×1080 and 390×844 from `python3 -m http.server 4177 --bind 127.0.0.1` at the repo root, page `/website/?t=<now>`: all images load; no console errors; no horizontal overflow; the three hero slides autoplay, arrows and dots work, copy sits on open paper on every slide at every width; the speaker row scrolls and every card's replay link is a youtube/youtu.be URL; the nav dropdown opens on hover and click; total page weight on first view ≤ 700 KB.
3. Screenshot each section at 1440 and 390 and look at them. If a hero image shows the subject under the headline, adjust `object-position` or the scrim before pushing.
4. Copy audit: every headline in this plan appears verbatim; the words "pay run", "shift work", "AI agents" (without "teams"), "Closeout Copilot" do not appear; "1,000,000" appears at most once (it may be dropped entirely now that the growth line carries the proof).
5. `git add website && git commit` (message starts with `website:`), `git stash -q && git pull --rebase -q origin main && git push -q origin main; git stash pop -q`, then poll `https://closeoutcopilot.com/website/` until the new hero file name appears (Netlify deploys in about a minute).
6. Append a dated review block to `tasks/todo.md` and a lesson to `tasks/lessons.md` if anything was rejected during the run.

## Open items to flag in the final message (do not block on them)

- Shift Reliability Report public URL (chip stays "Coming soon" until supplied).
- The 140% cohort figure and the Fortune 1000 claim wording need Jared's sign-off on the fine print.
- Nursa case study approval; ShiftKey logo rights.
- The Shift Work Summit year dropdown also needs to land on hypertrack.com itself (repo `~/Documents/claude-orchestration/hypertrack-content/website/shiftworksummit.html`); this plan only adds it to the proposal page.
- The compiler stage and the eight-agent section are parked in `product-sections.html` for the product page.
