# HyperTrack homepage proposal

## What this is

A single static proposal for the next HyperTrack homepage at https://closeoutcopilot.com/website/: proposal, noindex. The page follows the supplied brief, with copy kept inline and numeric claims documented in `js/claims.js`. It has no build step, framework, package dependencies, or form submission.

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

The page uses hypertrack.com's system: self-hosted Satoshi, Google Fonts JetBrains Mono, the supplied neutral and green tokens, hand-written CSS, and the repository's Edgework rails, dividers, markers, and content zones in place. There are no shadows or dark theme. To meet the original brief's minimum text contrast, small muted text uses `--n600`, the primary CTA fill uses `--green700` (`--green900` on hover), and held-label text uses `--n700` with amber accents; the supplied base token values and type scales remain intact. CTA borders stay neutral to honor the original green allowlist. The second change batch explicitly adds green comparison icons and chart marks, including indigo for light industrial; SVG labels and citation chips use its specified `--n500`, and values use `--n900`. Charts are inline SVG with native mark tooltips, direct values, legends, and expandable data tables. Animation is limited to the specified marquee and synthetic vignettes, with reduced-motion support. The exact supplied loop driver is retained; the three rules map their three beats onto absolute phases 0–2, 3–5, and 6–8 so each footer appears before its group changes. Without JavaScript, vignette content remains readable with only the default rule group and its matching header ID visible. Reduced motion selects only the final rule group.

## Art

The direction is Green Risograph Monumentalism, generated from `assets/art/ART.md`. Art and asset files are supplied separately and are not edited by this implementation. Slots 01–07 reference a 1920×1080 JPEG at `assets/art/<slug>.jpg` and a 960×540 phone variant at `assets/art/m/<slug>.jpg`. Slot 08 uses a 1600×900 desktop JPEG and the same phone-variant path convention. Missing images show a dashed placeholder with the slot slug.

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

## Claims to verify

Statuses below come from the supplied brief. “Verified” records the brief's classification of the SIA and monthly-shift figures; it does not imply independent source verification during implementation. The owner should revalidate all publication claims. `js/claims.js` also documents supplied pricing, attributed quote figures, dates, station counts, and synthetic numbers. Its `provided` status means the brief supplied the copy; it is not a verification claim. The Traba quotation and case-study URL are supplied by the brief and were not independently researched.

| id | where | claim | status | owner note |
| --- | --- | --- | --- | --- |
| growth-140 | The shift heading and growth stat | 140% median annual growth for HyperTrack platforms | unconfirmed | Confirm cohort, reporting period, calculation, and publication approval. |
| market-925 | The shift comparison stat | Best operators' 98.7% show rate versus 92.5% market | unconfirmed | Confirm the Shift Reliability Report comparison and common denominator. |
| show-rate-987 | Healthcare copy and stat | 98.7% show rate, best operators, healthcare | unconfirmed | Confirm industry cohort, period, and definition. |
| show-rate-974 | Light industrial copy and stat | 97.4% show rate, best operators, light industrial | unconfirmed | Confirm industry cohort, period, and definition. |
| wonolo-15-80 | Proof card | Closeout Agent on 10,000 shifts a month; break confirmations from 15% to 80% | unconfirmed | Confirm deployment volume, comparison period, and customer approval. |
| naming-rights-shiftkey | Logo marquee | Permission to display ShiftKey's mark | unconfirmed | Obtain naming and logo permission. |
| naming-rights-nursa | Logo marquee | Permission to display Nursa's mark | unconfirmed | Obtain naming and logo permission. |
| naming-rights-wonolo | Logo marquee and proof | Permission to display Wonolo's mark | unconfirmed | Obtain naming and logo permission. |
| naming-rights-traba | Logo marquee | Permission to display Traba's mark | unconfirmed | Obtain naming and logo permission. |
| naming-rights-instawork | Logo marquee | Permission to display Instawork's mark | unconfirmed | Obtain naming and logo permission. |
| naming-rights-clipboard-health | Logo marquee | Permission to display Clipboard Health's mark | unconfirmed | Obtain naming and logo permission. |
| quote-competitive-advantage | Review-only reserved proof slot | Customer quote pending verbatim confirmation and approval | unconfirmed | Supply approved quotation and attribution before showing publicly. |
| connectors-live | Connectors section | Listed timekeeping, payroll, and billing systems are supported | unconfirmed | Confirm live capability and scope for every listed system. |
| call-expectations | Closing call expectations | Real-shift sample, discrepancy settlements, and show-rate comparison on the call | unconfirmed | Confirm the demo team can deliver each expectation. |
| report-locked | Numbers section and industry on-time lines | HyperTrack Shift Reliability Report, Q2 2026 figures | unconfirmed | All HyperTrack report figures are from the draft report; confirm against the locked Q2 2026 version. |
| sia-growth-1 | The shift heading and forecast stat | 1% US staffing growth, 2026 forecast (SIA) | verified | Verified per supplied brief; retain the underlying SIA source and revalidate before publication. |
| monthly-shifts-1000000 | Hero proof | Over 1,000,000 shifts a month run on HyperTrack | verified | Verified per supplied brief; retain the internal measurement and revalidate before publication. |

## Data sources

Figures, source URLs, publication years, and confidence classifications below were supplied in the second change batch. They are recorded as supplied, without independent web or document verification. `first-party-draft` identifies HyperTrack report data requiring confirmation against the locked Q2 2026 report. `primary` and `secondary` describe the supplied source classification, not a completed fact check. `js/claims.js` stores each new figure with `value`, `where`, a structured source (`publisher`, `year`, `url`), and `confidence`; related series retain all observations in labeled arrays or objects. Tables in the page repeat the chart data without requiring JavaScript.

| Figure | Where on the page | Publisher | Year | Confidence | URL |
| --- | --- | --- | --- | --- | --- |
| Q2 2026; three months observed; about a million validated shifts a month | Numbers source description | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| No-shows 11.5%, healthcare and light industrial | Numbers tile | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Arriving workers: on time 74.2%, late 21.9%, unverifiable 3.9% | Numbers stacked bar | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| ~1M shifts validated per month; visibility 64% at go-live to 94% by month 11 | Numbers tile | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Healthcare on time: median 69.3%, best 75.0%, market overall 72.6% | Numbers dumbbell; Industries healthcare line (median and best) | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Light industrial on time: median 83.3%, best 85.6%, market overall 76.4% | Numbers dumbbell; Industries light industrial line (median and best) | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Left too late: healthcare 46.7%, light industrial 41.0% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Long stop: healthcare 16.9%, light industrial 16.1% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Traffic: healthcare 8.2%, light industrial 18.6% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Last-minute assignment: healthcare 13.1%, light industrial 7.1% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Drive detour: healthcare 10.2%, light industrial 11.7% | Numbers late-arrival bars | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Healthcare visibility, months 1–8 respectively: 77.4%, 84.6%, 89.0%, 89.9%, 91.9%, 93.5%, 94.9%, 95.9% | Numbers visibility lines | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Light industrial visibility, months 1–8 respectively: 58.4%, 74.2%, 82.2%, 85.9%, 88.5%, 90.6%, 92.1%, 92.8% | Numbers visibility lines | HyperTrack | 2026 | first-party-draft | https://hypertrack.com/research |
| Start a job search after one paycheck error 24%, after two errors 49% | Next retention bars | Workforce Institute | 2017 | secondary | https://hrdailyadvisor.hci.org/2017/06/15/payroll-problems-may-undermine-employee-experience-says-survey/ |
| Average cost to fix one payroll error $291, direct and indirect | Next retention tile | EY | 2022 | primary | https://eyquest.com/files/Cost_and_Risks_Due_to_Payroll_Errors_2022_Final.pdf |
| Time submissions with an error 1 in 6; 83.35% arrive error-free | Next retention tile | Bloomberg Tax | 2019 | primary | https://data.bloomberglp.com/bna/sites/9/2019/10/BTAX-Payroll-Benchmarks-Survey-Report_Final.pdf |
| Timesheets corrected 80%, employer-reported | Next retention tile | QuickBooks Time | 2017 | primary | https://quickbooks.intuit.com/time-tracking/resources/time-attendance-stats/ |
| Cost to replace a worker earning under $30K: 16% of annual pay | Next retention tile | Center for American Progress | 2012 | primary | https://www.americanprogress.org/article/there-are-significant-business-costs-to-replacing-employees/ |
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
- Mediation: agent 14:40; Dana and agent 14:52; Luis on floor 06:01–14:31; settled +$24.50 with 3 attachments.
- Payroll batch: ADP-0901 · 41 workers · $58,420 · sent Thu 18:00. The batch's worker count is distinct from the demonstration pay-cycle subset.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page, inline copy, comparison grid, SVG charts and data tables, seven vignettes, metadata, and claim tags |
| `css/tokens.css` | Satoshi faces, exact tokens, typography, buttons, and primitives |
| `css/site.css` | Layout, responsive behavior, vignettes, fallbacks, and review styling |
| `js/site.js` | Navigation, scroll-spy, vignette loops, missing-image fallback, review mode |
| `js/claims.js` | Numeric claim documentation, structured data sources, and replacement reference |
| `check.js` | Dependency-free static checks for assets, anchors, claims, copy, alt text, and widget placement |
| `README.md` | Setup, design notes, art slots, claim register, data-source table, and synthetic dataset |

Existing `BRIEF.md`, `assets/**`, repository-root fonts, Edgework CSS, wordmark, favicon, and connector tiles remain supplied dependencies.
