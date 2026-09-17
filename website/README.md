# HyperTrack homepage proposal

## What this is

A single static proposal for the next HyperTrack homepage at https://closeoutcopilot.com/website/: proposal, noindex. The page follows the supplied brief, with copy kept inline and numeric claims documented in `js/claims.js`. It has no build step, framework, package dependencies, form submission, or Agent Keyboard widget. The current copy presents the eight-agent team as closing out every pay run, with pricing per pay run pending confirmation.

## How to view locally

From the repository root, run:

```sh
python3 -m http.server 4177 --bind 127.0.0.1
```

Visit `http://127.0.0.1:4177/website/`. Add `?review=1` to outline unconfirmed claims and reveal the reserved quotation. A server and browser were not used during implementation; verification is static:

```sh
node website/check.js
node --check website/js/site.js
```

## Design system

The page uses hypertrack.com's system: self-hosted Satoshi, Google Fonts JetBrains Mono, the supplied neutral and green tokens, hand-written CSS, and the repository's Edgework rails, dividers, markers, and content zones in place. The page has no dark theme; the tracking map uses the requested subtle label and worker-card shadows. To meet the original brief's minimum text contrast, small muted text uses `--n600`, the primary CTA fill uses `--green700` (`--green900` on hover), and held-label text uses `--n700` with amber accents; the supplied base token values and type scales remain intact. CTA borders stay neutral to honor the original green allowlist. The second change batch explicitly adds green comparison icons and chart marks, including indigo for light industrial; SVG labels and citation chips use its specified `--n500`, and values use `--n900`. Charts are inline SVG with native mark tooltips, direct values, legends, and expandable data tables. Motion covers the hero carousel, active-slide art parallax, marquee, and synthetic vignettes, with reduced-motion support. The exact supplied loop driver is retained; the three rules map their three beats onto absolute phases 0–2, 3–5, and 6–8 so each footer appears before its group changes. Without JavaScript, vignette content remains readable with only the default rule group and its matching header ID visible. Reduced motion selects only the final rule group.

The hero is a four-slide carousel: the fastest-growing staffing companies, the staffing growth comparison, the middle office, then the agent overview. Each slide retains its landscape and portrait art, cream scrim, copy, and a primary Book a demo CTA. The first slide has the sole H1; the other three use H2 elements with the same display type. The middle-office slide places its copy on the right. The closing call to action remains a separate full-width bleed. At widths up to 700px, the carousel and closing bleed use 1080×1920 portrait art across a minimum-height 100svh section, with copy overlaid on a bottom cream scrim and 34px carousel headings. The growth stat trio follows the carousel, then the logo bar, retention, Numbers, and “You write the rules” row; the supporting rows retain their Edgework frames. Industry cards retain their existing layout. Four dots and a counter select and identify slides, with a five-second progress line on the active dot. Autoplay pauses on hover, focus within, or a hidden tab; clicking a dot or swiping stops autoplay for the session. Arrow keys work while the carousel has focus, and horizontal swipes of at least 50px switch slides. Reduced motion disables autoplay and fades. The main navigation links to HyperTrack’s Product, Solutions, Customers, Pricing, Docs, and Blog pages; the Book a demo CTA is retained. A 40px sticky section navigation row appears below it after the hero on desktop, linking to How it works, Numbers, Proof, Connectors, Pricing, and Rulebook. The secondary row is hidden below 1024px.

## Art

The direction is Green Risograph Monumentalism, generated from `assets/art/ART.md`. Art and asset files are supplied separately and are not edited by this implementation. Original slots 01–07 have a 1920×1080 JPEG at `assets/art/<slug>.jpg` and a 960×540 phone variant at `assets/art/m/<slug>.jpg`. Slot 08 uses a 1600×900 desktop JPEG and the same phone-variant path convention. Framed art that cannot load shows a dashed placeholder with the slot slug.

| Slot | Placement |
| --- | --- |
| `01-hero` | Distribution center at dawn |
| `02-two-monuments` | The shift |
| `03-middle-office` | The middle office |
| `04-one-line` | Clipboard to paycheck |
| `05-hospital-5am` | Healthcare |
| `06-data-center` | Light industrial |
| `07-coin-plaza` | Closing call to action |
| `08-before-after` | The same middle office, before and after |

The four hero carousel slides and the closing full-bleed section use the v3 human-first set: landscape compositions for desktop and 1080×1920 portrait variants for widths up to 700px. Each image keeps its current landscape path in `data-fallback`: v2 for the first four, and the prior `07-coin-plaza-b.jpg` composition for the closing call to action, whose v2 asset is not present. If a portrait fails, the image and picture source first try the v3 landscape, then the existing fallback before showing the missing-art state. Art may be pending while it is generated. The existing industry and comparison art remains unchanged.

| Placement | Landscape composition | Portrait composition | Fallback |
| --- | --- | --- | --- |
| Hero slide 1 | `assets/art/v3-01-hero.jpg` | `assets/art/v3-01-hero-p.jpg` | `assets/art/v2-01-hero.jpg` |
| Hero slide 2 · The shift | `assets/art/v3-02-shift.jpg` | `assets/art/v3-02-shift-p.jpg` | `assets/art/v2-02-shift.jpg` |
| Hero slide 3 · The middle office | `assets/art/v3-03-middle-office.jpg` | `assets/art/v3-03-middle-office-p.jpg` | `assets/art/v2-03-middle-office.jpg` |
| Hero slide 4 · Agent overview | `assets/art/v3-04-one-line.jpg` | `assets/art/v3-04-one-line-p.jpg` | `assets/art/v2-04-one-line.jpg` |
| Closing call to action | `assets/art/v3-07-coin.jpg` | `assets/art/v3-07-coin-p.jpg` | `assets/art/07-coin-plaza-b.jpg` |

The eight stations run in this order: 1 Ingest, 2 Locate, 3 Collect, 4 Collate, 5 Apply the rules, 6 Spot discrepancies, 7 Pay, 8 Mediate. Mediate follows Pay because disputes happen after pay.

The original seven station emblems come from the STYLE-B block in `assets/art/ART.md`. Each object sits without a frame, border, radius, or background, above its station copy and as a thumbnail in the sticky station menu. The new Spot discrepancies emblem is a 400×400 transparent WebP. Emblems are 240px on desktop and 160px below 1024px; menu thumbnails are 28px. Missing emblem images use a dashed circle without a label. Asset filenames are retained when stations move.

| File | Station | Description |
| --- | --- | --- |
| `assets/art/st/1-ingest.webp` | Ingest | Intake hopper |
| `assets/art/st/2-locate.webp` | Locate | Surveyor's beacon with geofence rings |
| `assets/art/st/3-collect.webp` | Collect | Telephone with a cord that becomes a timesheet |
| `assets/art/st/4-collate.webp` | Collate | Lightbox with four sheets |
| `assets/art/st/5-rules.webp` | Apply the rules | Letterpress stamp |
| `assets/art/st/8-discrepancies.webp` | Spot discrepancies | Loupe over a flagged shift card |
| `assets/art/st/7-pay.webp` | Pay | Pay envelope with teller's grille |
| `assets/art/st/6-mediate.webp` | Mediate | Balance scale |

## Claims to verify

Statuses below come from the supplied brief. “Verified” records the brief's classification of the SIA and monthly-shift figures; it does not imply independent source verification during implementation. The owner should revalidate all publication claims. `js/claims.js` also documents supplied pricing, attributed quote figures, dates, station counts, and synthetic numbers. Its `provided` status means the brief supplied the copy; it is not a verification claim. The Traba quotation and case-study URL are supplied by the brief and were not independently researched.

| id | where | claim | status | owner note |
| --- | --- | --- | --- | --- |
| growth-140 | The shift heading and growth stat | 140% median annual growth for HyperTrack platforms | unconfirmed | Confirm cohort, reporting period, calculation, and publication approval. |
| market-925 | The shift comparison stat | Best operators' 98.7% show rate versus 92.5% market | unconfirmed | Confirm the Shift Reliability Report comparison and common denominator. |
| show-rate-987 | Healthcare copy and stat | 98.7% show rate, best operators, healthcare | unconfirmed | Confirm industry cohort, period, and definition. |
| show-rate-974 | Light industrial copy and stat | 97.4% show rate, best operators, light industrial | unconfirmed | Confirm industry cohort, period, and definition. |
| wonolo-15-80 | Wonolo testimonial block | Closeout Agent on 10,000 shifts a month; break confirmations from 15% to 80% | unconfirmed | Attribution: Carlos Ganoza, VP of Product, Wonolo; photo from hypertrack.com's Top 50 Leaders page. This is a result line, not a quotation, until a verbatim quote is approved. Confirm deployment volume, comparison period, and customer approval. |
| naming-rights-shiftkey | Logo marquee | Permission to display ShiftKey's mark | unconfirmed | Obtain naming and logo permission. |
| naming-rights-nursa | Logo marquee | Permission to display Nursa's mark | unconfirmed | Obtain naming and logo permission. |
| naming-rights-wonolo | Logo marquee and proof | Permission to display Wonolo's mark | unconfirmed | Obtain naming and logo permission. |
| naming-rights-traba | Logo marquee | Permission to display Traba's mark | unconfirmed | Obtain naming and logo permission. |
| quote-competitive-advantage | Review-only line beneath the Wonolo statement | "HyperTrack is my competitive advantage." — pending verbatim confirmation and approval | unconfirmed | Supply approved quotation and attribution before showing publicly. |
| connectors-live | Connectors section | Listed timekeeping, payroll, and billing systems are supported | unconfirmed | Confirm live capability and scope for every listed system. |
| call-expectations | Closing call expectations | Real-shift sample, discrepancy settlements, and show-rate comparison on the call | unconfirmed | Confirm the demo team can deliver each expectation. |
| pricing-per-pay | Pricing heading | Priced per pay run, not per shift. | unconfirmed | Confirm the pay-run pricing unit and publication approval; contracts from $10k a year and paid pilots remain supplied terms. |
| report-locked | Numbers section and industry on-time lines | HyperTrack Shift Reliability Report, Q2 2026 figures | unconfirmed | All HyperTrack report figures are from the draft report; confirm against the locked Q2 2026 version. |
| sia-growth-1 | The shift heading and forecast stat | 1% US staffing growth, 2026 forecast (SIA) | verified | Verified per supplied brief; retain the underlying SIA source and revalidate before publication. |
| monthly-shifts-1000000 | Hero proof | Over 1,000,000 shifts a month run on HyperTrack | verified | Verified per supplied brief; retain the internal measurement and revalidate before publication. |

## Data sources

Figures, source URLs, publication years, and confidence classifications below were supplied in the second change batch. They are recorded as supplied, without independent web or document verification. `first-party-draft` identifies HyperTrack report data requiring confirmation against the locked Q2 2026 report. `primary` and `secondary` describe the supplied source classification, not a completed fact check. `js/claims.js` stores each new figure with `value`, `where`, a structured source (`publisher`, `year`, `url`), and `confidence`; related series retain all observations in labeled arrays or objects. Tables in the page repeat the chart data without requiring JavaScript.

| Figure | Where on the page | Publisher | Year | Confidence | URL |
| --- | --- | --- | --- | --- | --- |
| Q2 2026; three months of ground-truth attendance | Numbers source description | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| No-shows 11.5%, healthcare and light industrial | Numbers tile | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Arriving workers: on time 74.2%, late 21.9%, unverifiable 3.9% | Numbers stacked bar | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Visibility after go-live: 94% by month 11, from 64% at go-live | Numbers tile | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Healthcare on time: median 69.3%, best 75.0%, market overall 72.6% | Numbers dumbbell; Industries healthcare line (median and best) | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Light industrial on time: median 83.3%, best 85.6%, market overall 76.4% | Numbers dumbbell; Industries light industrial line (median and best) | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Left too late: healthcare 46.7%, light industrial 41.0% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Long stop: healthcare 16.9%, light industrial 16.1% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Traffic: healthcare 8.2%, light industrial 18.6% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Last-minute assignment: healthcare 13.1%, light industrial 7.1% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Drive detour: healthcare 10.2%, light industrial 11.7% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Healthcare visibility, months 1–8 respectively: 77.4%, 84.6%, 89.0%, 89.9%, 91.9%, 93.5%, 94.9%, 95.9% | Numbers visibility lines | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Light industrial visibility, months 1–8 respectively: 58.4%, 74.2%, 82.2%, 85.9%, 88.5%, 90.6%, 92.1%, 92.8% | Numbers visibility lines | HyperTrack | 2026 | first-party-draft | (unpublished; report coming soon, no public link yet) |
| Start a job search after one paycheck error 24%, after two errors 49% | Retention band bars | Workforce Institute | 2017 | secondary | https://hrdailyadvisor.hci.org/2017/06/15/payroll-problems-may-undermine-employee-experience-says-survey/ |
| Average cost to fix one payroll error $291, direct and indirect | Retention band tile | EY | 2022 | primary | https://eyquest.com/files/Cost_and_Risks_Due_to_Payroll_Errors_2022_Final.pdf |
| Time submissions with an error 1 in 6; 83.35% arrive error-free | Retention band tile | Bloomberg Tax | 2019 | primary | https://data.bloomberglp.com/bna/sites/9/2019/10/BTAX-Payroll-Benchmarks-Survey-Report_Final.pdf |
| Timesheets corrected 80%, employer-reported | Retention band tile | QuickBooks Time | 2017 | primary | https://quickbooks.intuit.com/time-tracking/resources/time-attendance-stats/ |
| Cost to replace a worker earning under $30K: 16% of annual pay | Retention band tile | Center for American Progress | 2012 | primary | https://www.americanprogress.org/article/there-are-significant-business-costs-to-replacing-employees/ |
| Turnover cost per bedside RN $60,090 | Industries healthcare line | NSI | 2026 | primary | https://www.nsinursingsolutions.com/documents/library/nsi_national_health_care_retention_report.pdf |
| Traditional staffing fill rate 46%; worker turnover 75–95% | Industries light industrial line | Contrary Research | 2024 | secondary | https://research.contrary.com/company/traba |

Chart axis ranges are presentation scales, not additional observations: the on-time dumbbell spans 60–90%, visibility spans months 1–8 and 50–100%, and job-search bars span 0–60%. The supplied late-arrival categories are shown as given, without an invented remainder or renormalization.

## Synthetic data

Every product vignette is a synthetic demonstration and has a “synthetic data” footer. Names, sites, events, rules, amounts, and batch records below describe the supplied fictional example, not customer evidence or legal guidance. Values intentionally follow the brief and are not recalculated as payroll rules.

- Pay cycle: Aug 24–30; 54 shifts, 6 sites, 14 workers. The location example is Aug 27.
- Primary shift: #4821 · Maria R. · Housekeeping · Mercy General (CA) · scheduled 09:00–16:30 · ADP timesheet in 08:58, out — (missing) · phone entered geofence 08:52, off floor 12:10–12:41, left 17:01 · paper timesheet 09:00–17:00 · $24.50/h · reconciled 08:58 → 17:01 · 8.05 h · $197.23 · supervisor Dana K.
- #4826 · Luis M. · Mercy General · 06:01–14:31 · no meal break before hour 5 · CA-MB-01 · +$24.50 premium · 9.50 h in the pay table · $232.75.
- #4825 · Priya S. · Sutter Health · 06:58–15:02 in the ingest table · orientation shift · CON-SUTTER-01: bills $0, pays training rate.
- #4830 · Aisha B. · 43.0 h this week · 3.0 h OT held · 40.00 h in the pay table · TW-1187: no overtime at Mercy General this week, expires Sun Aug 30 · $980.00 held.
- #4833 · Tom K. · Bayview Warehouse · 08:02–16:00.
- Collection: 4 clipboard rows read; agent message 17:06; Maria reply 17:09 (“5:01, we ran late on the east wing”); agent confirmation 17:09 records 17:01.
- Timeline: 06:00–18:00, with ticks 06, 09, 12, 15, 18. Paper, worker reply, phone, and ADP sources retain their respective times; the missing ADP clock-out is an exception.
- Rule examples: CA-MB-01 requires a 30-minute unpaid meal before the end of the 5th hour, with a 1-hour premium (+1.0 h at regular rate) when missed, short, or late. CON-SUTTER-01 sets orientation billing to $0 and pay to training rate. TW-1187 holds OT > 40 h, expiring Sun Aug 30. The supplied rule footer reads “Ran on 54 shifts · fired 1 · #4825 Priya S.”
- Rulebook compiler: the three source tabs show IWC Wage Order 5 §11 / CA-MB-01, Sutter contract §3.4 / CON-SUTTER-01, and the Mercy General weekly note / TW-1187. Source marks feed typed facts with source references and the supplied shift vocabulary, then code, backtest/shadow results, and Draft → Shadow → Live. Law results are synthetic: 60-term vocabulary; 1,284 shifts; 41 flagged; 0 disagreements. Contract results are 96 shifts and 12 applied; the weekly shadow run checks 54 shifts and holds 1 (Aisha B.), expiring 2026-08-30 23:59. The section ends with “Rules compile once and run on every pay run. Backtest before you activate; shadow before you trust. Synthetic example.” This is supplied illustrative copy, not independently verified legal guidance.
- Compiler motion: phases 1–5 reveal source marks and typed facts at 500 ms each; phase 6 reveals vocabulary chips for 800 ms; phases 7–20 reveal code at 110 ms per phase; phases 21–23 advance checks and lifecycle at 900 ms each; phase 24 holds the completed state for 4 seconds including the loop driver’s final hold. The stage runs only in view, changing source tabs restarts its loop without a pane transition, and reduced motion shows the completed Live state.
- Discrepancies: 54 checked · 3 flagged · 51 clean. #4821 Maria R. · Mercy General · No clock-out, location shows 17:01 · Flagged; #4826 Luis M. · Mercy General · No meal break before hour 5 (CA-MB-01) · Flagged; #4830 Aisha B. · Mercy General · 3.0 h over 40 (TW-1187) · Held; #4833 Tom K. · Bayview Warehouse · Punches match schedule and location · Clean. The supplied five phase durations and summary's `data-step="5"` are retained; CSS reveals the summary in the final phase (4), including reduced motion.
- Mediation: agent 14:40; Dana and agent 14:52; Luis on floor 06:01–14:31; settled +$24.50 with 3 attachments.
- Payroll batch: ADP-0901 · 41 workers · $58,420 · sent Thu 18:00. The batch's worker count is distinct from the demonstration pay-cycle subset.

## Changes, Sep 17

- Hero and metadata now say “close out every pay run”; the overview and Apply the rules/Pay copy use the pay-run unit, and the pricing heading is “Priced per pay run, not per shift.”
- The logo headline is “The staffing platforms gaining market share are powered by HyperTrack.” Only ShiftKey, Nursa, Wonolo, and Traba remain in the repeating marquee.
- The monthly-volume claim appears only in the hero; Numbers now introduces ground-truth attendance and shows visibility of 94% by month 11, from 64% at go-live.
- Before/after compares “A good middle office today” with “Running on HyperTrack,” reflecting capable manual export, reconciliation, evidence, and payroll workflows.
- Rebuilt “Your rulebook, compiled.” as a three-pane compiler with law, contract, and weekly-note tabs, linked extraction facts, emitted rules, synthetic checks, and a Draft → Shadow → Live lifecycle; compact explanatory cells sit below the stage.
- Restored HyperTrack’s primary navigation, added desktop section links after the hero, and switched the art to the v3 human-first set with portrait copy overlays and existing landscape fallbacks.
- Combined the hero, growth comparison, middle office, and agent overview into one four-slide carousel, with a demo CTA on every slide, timed progress, dots, keyboard and swipe controls, and reduced-motion support.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Four-slide hero, page copy, comparison grid, rulebook, SVG charts and data tables, eight vignettes, metadata, and claim tags |
| `css/tokens.css` | Satoshi faces, exact tokens, typography, buttons, and primitives |
| `css/site.css` | Layout, responsive behavior, vignettes, fallbacks, and review styling |
| `js/site.js` | Carousel controls and autoplay, navigation, scroll-spy, vignette loops, missing-image fallback, review mode |
| `js/claims.js` | Numeric claim documentation, structured data sources, and replacement reference |
| `check.js` | Dependency-free static checks for assets, anchors, claims, copy, alt text, and absence of the Agent Keyboard widget |
| `README.md` | Setup, design notes, art slots, claim register, data-source table, and synthetic dataset |

Existing `BRIEF.md`, `assets/**`, repository-root fonts, Edgework CSS, wordmark, favicon, and connector tiles remain supplied dependencies.
