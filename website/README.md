# HyperTrack homepage proposal

## What this is

A single static proposal for the next HyperTrack homepage at https://closeoutcopilot.com/website/: proposal, noindex. No build step, framework, package dependencies, form submission, or Agent Keyboard widget. Copy is inline in `index.html`; claims that need sign-off carry `data-confirm` and are registered below and in `js/claims.js`.

This is revision r5 (Sep 17 2026), built from `PLAN-r5.md` after the CEO review. The page runs why → what → how:

1. Nav: hypertrack.com's primary nav plus a Shift Work Summit dropdown by year (2025, 2024, 2023, 2022).
2. Hero carousel, three slides, copy on the open paper at the top: fastest growing (H1, with the 140% vs 7% proof line and sourced fine print), Fortune 1000, the middle office.
3. Shift Work Summit speakers: nine cards in Jared's order, each with a headshot and a YouTube replay. Labelled as summit speakers, not customers.
4. What we do, as a mini product page: one line, then three rows (Validate, Reconcile, Pay), each a station emblem and copy beside a live product vignette (location map, agent and supervisor thread, pay table; synthetic data, lifted from the parked walkthrough with `css/vignettes.css`), the eight station emblems as a team strip, a primary link to the product page, and the Shift Reliability Report chip.
5. Customers: the two tiles only (Traba quote, Wonolo result line). No header and no logo line, by owner decision Sep 17; the ShiftKey mark is therefore not on the page.
6. Connectors, 7. pricing ("Priced per pay."), 8. a plain Book a demo block, footer.

Cut from the homepage in r5: the stat row, the logo marquee, retention, numbers, the eight-agent walkthrough, the compiler stage, before/after, industries, the closing coin banner and the in-page subnav. The eight-agent walkthrough and the compiler stage are parked, unlinked, in `product-sections.html` for the product page; their CSS and JS are in git history (`css/site.css` and `js/site.js` at commit a7523b9).

## How to view locally

From the repository root:

```sh
python3 -m http.server 4177 --bind 127.0.0.1
```

Visit `http://127.0.0.1:4177/website/`. Add `?review=1` to outline unconfirmed claims and reveal the reserved quotation. Static checks:

```sh
node website/check.js
node --check website/js/site.js
```

## Design system

hypertrack.com's system, unchanged: self-hosted Satoshi, Google Fonts JetBrains Mono, the supplied neutral and green tokens, hand-written CSS, and the repository's Edgework rails, dividers, markers and content zones. Borders, not shadows. No dark theme. Small muted text uses n600 to meet 4.5:1.

## Art

Prompts live in `assets/art/ART.md`. The current set is "v7 — human, from the deck": STYLE-3 (human first) with the COMPOSITION-TOP and PORTRAIT-BOTTOM clauses, so the subject sits in the lower half and the headline sits on open cream paper. v4, v5 and v6 (monumental, sci-fi city, shuttles) are rejected and no longer referenced by the page.

| Slot | Slide | Emotion | Files |
| --- | --- | --- | --- |
| v7-01-hero | The fastest growing staffing companies run on HyperTrack. | Momentum: paid right, up early, going places (r2; r1 showed workers dozing and was rejected) | `assets/art/v7-01-hero.jpg`, `-p.jpg`, `m/` |
| v7-02-fortune | Fortune 1000 companies prefer HyperTrack customers. | Pride: the big client chose this crew and they showed up | `assets/art/v7-02-fortune.jpg`, `-p.jpg`, `m/` |
| v7-03-middle-office | AI already runs recruiting. The middle office is next. | Anticipation: help is on its way down the stairs | `assets/art/v7-03-middle-office.jpg`, `-p.jpg`, `m/` |

Each slot has a 1600×900 landscape (q56), a 960×540 tablet variant in `m/`, and a 1080×1920 portrait (`-p`, q60) for phones. Raw PNGs, operator briefs and the manifest are in `assets/art/raw/`.

## Claims to verify

The owner should revalidate every publication claim. `approved` records the Sep 17 meeting's list of approved customer marks.

| id | where | claim | status | owner note |
| --- | --- | --- | --- | --- |
| growth-140 | Hero slide 1 proof line | Platforms on HyperTrack grew 140% while the staffing market is forecast to grow 7% | unconfirmed | The 7% is SIA's revised 2026 U.S. forecast; the 140% is HyperTrack's customer cohort analysis and has no public source yet. Jared to sign off on the fine print. |
| sia-growth-7 | Hero slide 1 fine print, SIA source link | The staffing market is forecast to grow 7% (SIA U.S. staffing forecast, 2026) | unconfirmed | CHECK BEFORE PUBLISHING. The 7% is from the Sep 17 meeting ("SIA revised the forecast to 7%"). The link goes to SIA's US Staffing Industry Forecast: September 2026 Update (https://www.staffingindustry.com/research/research-reports/americas/us-staffing-industry-forecast-september-2026-update); the URL in PLAN-r5 did not appear in search and SIA's site blocks automated checks (Cloudflare 403). A web search summary of that update reported 2.4% growth for 2026 (March update: 1%), which does not match 7%. Confirm the figure, its basis (segment? year?) and the source with Jared. |
| fortune-1000 | Hero slide 2 | Fortune 1000 companies prefer HyperTrack customers. *Based on our customers' live client lists. | unconfirmed | Jared to sign off on wording and fine print. Never name the end clients above the fold. |
| pricing-per-pay | Pricing heading | Priced per pay. | unconfirmed | Confirm the pricing unit; contracts from $10k a year and paid pilots are supplied terms. |
| report-locked | Shift Reliability Report chip under "what we do" | Shift Reliability Report 2026; a million validated shifts a month | unconfirmed | No public URL yet; the chip says "Coming soon" on click until one is supplied. |
| wonolo-15-80 | Wonolo testimonial block | Closeout Agent on 10,000 shifts a month; break confirmations from 15% to 80% | unconfirmed | Attribution: Carlos Ganoza, VP of Product, Wonolo. A result line, not a quotation, until a verbatim quote is approved. |
| naming-rights-shiftkey | Customers line | Permission to display ShiftKey's mark | unconfirmed | Approved in the meeting; logo rights still to be confirmed in writing. |
| naming-rights-wonolo | Customers line and Wonolo block | Permission to display Wonolo's mark | approved | Approved Sep 17. |
| quote-competitive-advantage | Review-only line beneath the Wonolo statement | "HyperTrack is my competitive advantage." | unconfirmed | Supply approved quotation and attribution before showing publicly. |
| connectors-live | Connectors section | Listed timekeeping, payroll and billing systems are supported | unconfirmed | Confirm live capability and scope for every listed system. |
| call-expectations | Book a demo block | We close out a sample of your real shifts and show every discrepancy the agent finds | unconfirmed | Confirm the demo team can deliver this on every call. |

Not tagged: the Traba quote and case study (approved). Excluded by decision: Lead, Sunderstorm, Gigable, Instawork, Clipboard Health. Nursa's case study is pending approval, so Nursa appears only as a summit speaker.

## Shift Work Summit speakers

Order is Jared's. Names, session titles and replay URLs come from `hypertrack-content/website/data/sws-2025-sessions.csv` and `sws-2024-sessions.csv` (the CSV replay values carry a stray `&autoplay=1`, dropped here); headshots come from `hypertrack-content/website/images/webflow/`, resized to 112×112 JPEG q72 in `assets/speakers/`. Roles are Jared's list; the fine print reads "Speakers appear in their roles at the time of the session."

| # | Speaker | Role | Session | Replay | Year |
| --- | --- | --- | --- | --- | --- |
| 1 | Curtis Anderson | CEO, Nursa | Building a High-Growth Business in Times of Extreme Uncertainty | https://youtu.be/Oq1exHaaHGk | 2025 |
| 2 | Waynn Lue | VP Engineering, Wonolo | Building AI Agents with Empathy for Workers | https://youtu.be/oT17w6biQr4 | 2025 |
| 3 | Mike Shebat | CEO, Traba | How to Build a Culture for Hypergrowth and Excellence in the Staffing Industry | https://youtu.be/V4O5MVnD1xw | 2025 |
| 4 | Novo Constare | CEO, Indeed Flex | How Workforce Automation for Deskless Workers Is Transforming with AI | https://youtu.be/maesEHlpGow | 2025 |
| 5 | Barbara Simmer | EVP, Staffmark | Retaining Humanity in a World of Tech | https://youtu.be/fJI1Q8-3ODM | 2025 |
| 6 | Jarah Euston | President & COO, WorkWhile | Building worker-first automation with AI | https://youtu.be/0oPakKA9s1M | 2025 |
| 7 | Curt Baldwin | CTO, Medical Solutions | The Tech Evolution of Flex Worker Pools | https://youtu.be/eom9rVnVrgU | 2025 |
| 8 | Brian Neely | Chief Sales Officer, Job&Talent | Revolutionizing staffing: how Job&Talent leverages technology to shape the future of workforce solution | https://www.youtube.com/watch?v=rp-i26osfGI | 2024 |
| 9 | Ivan Sathianathan (Staff Product Manager, Wonolo) and Kirti Shenoy (Founder & CEO, Zeal) | one card, two headshots | How Wonolo does daily pay for W-2 workers | https://www.youtube.com/watch?v=hsJu26U47G4 | 2024 |

Two deliberate differences from the CSVs: the 2025 CSV lists Jarah Euston as CEO, WorkWhile, and the page uses Jared's "President & COO" (confirm which is right for the session date); session 9's full CSV title ends "with payroll built for …", shortened per the plan.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The seven sections, metadata and claim tags |
| `product-sections.html` | Parked, unlinked: the eight-agent walkthrough and the compiler stage, for the product page |
| `css/tokens.css` | Satoshi faces, exact tokens, typography, buttons and primitives |
| `css/vignettes.css` | The product vignettes' styles, lifted unchanged from the pre-r5 walkthrough so the product page can reuse them |
| `css/site.css` | Layout, carousel, nav dropdown, speaker cards, responsive behavior, fallbacks, review styling |
| `js/site.js` | Carousel, nav scroll state and dropdown, speaker row arrows, parallax, report chip, missing-image fallback, review mode |
| `js/claims.js` | Claim register and the speaker list with sources |
| `check.js` | Dependency-free static checks: assets, anchors + nav dropdown + speaker cards, claims, copy, alt text, no Agent Keyboard widget |
| `PLAN-r5.md` | The plan this revision was built from |
