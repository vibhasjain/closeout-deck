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

The page uses hypertrack.com's system: self-hosted Satoshi, Google Fonts JetBrains Mono, the supplied neutral and green tokens, hand-written CSS, and the repository's Edgework rails, dividers, markers, and content zones in place. There are no shadows or dark theme. To meet the brief's minimum text contrast, small muted text uses `--n600`, the primary CTA fill uses `--green700` (`--green900` on hover), and held-label text uses `--n700` with amber accents; the supplied base token values and type scales remain intact. CTA borders stay neutral to honor the green allowlist. Animation is limited to the specified marquee and synthetic vignettes, with reduced-motion support. The exact supplied loop driver is retained; the three rules map their three beats onto absolute phases 0–2, 3–5, and 6–8 so each footer appears before its group changes. Without JavaScript, all vignette content is visible.

## Art

The direction is Green Risograph Monumentalism, generated from `assets/art/ART.md`. Art and asset files are supplied separately and are not edited by this implementation. Each slot references a 1920×1080 JPEG at `assets/art/<slug>.jpg` and a 960×540 phone variant at `assets/art/m/<slug>.jpg`. Missing images show a dashed placeholder with the slot slug.

| Slot | Placement |
| --- | --- |
| `01-hero` | Distribution center at dawn |
| `02-two-monuments` | The shift |
| `03-middle-office` | The middle office |
| `04-one-line` | Clipboard to paycheck |
| `05-hospital-5am` | Healthcare |
| `06-data-center` | Light industrial |
| `07-coin-plaza` | Closing call to action |

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
| sia-growth-1 | The shift heading and forecast stat | 1% US staffing growth, 2026 forecast (SIA) | verified | Verified per supplied brief; retain the underlying SIA source and revalidate before publication. |
| monthly-shifts-1000000 | Hero proof | Over 1,000,000 shifts a month run on HyperTrack | verified | Verified per supplied brief; retain the internal measurement and revalidate before publication. |

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
| `index.html` | Page, inline copy, seven vignettes, metadata, and claim tags |
| `css/tokens.css` | Satoshi faces, exact tokens, typography, buttons, and primitives |
| `css/site.css` | Layout, responsive behavior, vignettes, fallbacks, and review styling |
| `js/site.js` | Navigation, scroll-spy, vignette loops, missing-image fallback, review mode |
| `js/claims.js` | Numeric claim documentation and replacement reference |
| `check.js` | Dependency-free static checks for assets, anchors, claims, copy, alt text, and widget placement |
| `README.md` | Setup, design notes, art slots, claim register, and synthetic dataset |

Existing `BRIEF.md`, `assets/**`, repository-root fonts, Edgework CSS, wordmark, favicon, and connector tiles remain supplied dependencies.
