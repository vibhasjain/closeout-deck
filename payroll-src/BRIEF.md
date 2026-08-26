# BRIEF — closeoutcopilot.com/payroll · "HyperTrack Payroll Ops"

You are building a complete, production-quality marketing landing page inside this Vite + React 19 + TypeScript + Tailwind v4 + shadcn (nova style, radix base) project at `payroll-src/`. It ships as static files to `../payroll/` and is served at `https://closeoutcopilot.com/payroll`. The page is an **internal pitch that reads as a customer-facing landing page**: it sequences a founders' hypothesis about a payroll-operations AI agent for staffing and gig-work companies, and it embeds **autoplaying shadcn UI mocks** so a reader can *watch* the agent work.

Read this whole file before writing code. Everything you need is here; you have no other context.

---

## 0. Hard constraints (non-negotiable)

1. **Light page, light mocks.** White ground, zinc greys, one green accent (`#22c55e`). No dark mode, no theme toggle — delete `src/components/theme-provider.tsx` and its use in `main.tsx`.
2. **shadcn components for every product mock, as much as possible**: `Card`, `Badge`, `Table`, `Tabs`, `Avatar`, `Separator`, `Progress`, `Button`, `Alert`, `Skeleton`, `Switch` are already installed under `src/components/ui/`. Add more with `npx shadcn@latest add <name> --yes` if a mock genuinely needs one (e.g. `scroll-area`, `tooltip`, `input`, `textarea`, `empty`, `item`, `kbd`). Never hand-roll a styled `<span>` where `Badge` exists, never `<hr>` where `Separator` exists, never a custom pulse div where `Skeleton` exists.
3. **No user interaction inside the mocks.** Mocks are movies: a timer-driven phase machine advances state; the DOM re-renders; **CSS does the motion** (tw-animate-css `animate-in fade-in slide-in-from-bottom-2 duration-500`, custom `@keyframes` in `index.css`, CSS transitions). Tabs auto-advance via a controlled `value`. `Switch` is rendered `checked` + `disabled` with `pointer-events-none` so it reads as live state. Nothing inside a mock is clickable. The only interactive things on the whole page are the nav anchor links and the two CTA buttons (anchors).
4. **Dummy data, one shared dataset** (`src/data/shifts.ts`, spec in §4). Every mock reads from it so the same shift IDs, names, facilities and dollar figures recur consistently. Each mock carries a tiny `synthetic` caption (a `Badge variant="outline"` or muted text) somewhere in its frame.
5. **Every loop pauses when offscreen** (IntersectionObserver) and **`prefers-reduced-motion: reduce` renders each mock in its final state** with no timers and no CSS animation. Content is visible by default: never hide content behind an animation that could fail.
6. **shadcn styling rules:** semantic tokens only (`bg-background`, `text-muted-foreground`, `bg-primary`, `border-border`) — never raw `bg-green-500`; `flex gap-*` / `grid gap-*` instead of `space-y-*`; `size-*` when width = height; `truncate`; `cn()` from `@/lib/utils` for conditional classes; icons from `lucide-react`, inside `Button` with `data-icon="inline-start|inline-end"`, never sized manually inside components; no manual `z-index` on components.
7. **Craft floor (bans):** no eyebrow/kicker label above headings (the heading carries itself); no page structure made of same-size icon+heading+text cards; no nested `Card` inside `Card` (use bordered `div`s / `Table` / `Separator` inside); no section numbers (01/02/03) except where sequence carries information; no gradient text; no glass/blur decoration; no coloured `border-left` accent bars > 1px; no hard offset shadows; no emoji as icons; monospace only for data (timestamps, IDs, money, log lines), never as a "technical" costume; body measure 65–75ch; display size ≤ 6rem; heading tracking ≥ −0.04em; more space above a heading than below it.
8. **Accessibility:** AA contrast (green `#22c55e` is NOT AA for text on white — use `text-green-700` (`#15803d`) for green text, and `#22c55e` only as fills with dark text `#052e16` or as 1px rings/dots); visible keyboard focus on nav links and CTAs; semantic landmarks (`header`, `main`, `section` with `aria-labelledby`, `footer`); mocks get `aria-live="off"` and `role="img"` + `aria-label` describing what the animation shows, so screen readers get one sentence instead of a stream.
9. **No global `keydown` handlers** (a third-party widget in a shadow root is embedded on this page; global key handlers have caused bugs before). No overlays, modals, or scroll locks.
10. **Do not commit to git.** Do not touch anything outside `payroll-src/` except: `payroll/` (build output), `netlify.toml` (append one build step), `_headers` (append cache rules) — exactly as specified in §8.

---

## 1. Direction contract (put this as an HTML comment, first child of `<body>` in `index.html`, ≤150 words)

```
THESIS: "Spots every single payroll discrepancy in real time." Proven by showing one shift caught the instant it ends — not by a headline + gradient hero.
OWN-WORLD: white ground, zinc hairlines, one green (#22c55e) reserved for the agent's decisions, JetBrains Mono for every timestamp/ID/dollar, Space Grotesk display, Inter body; product surfaces are white shadcn cards with 1px zinc rings.
STORY: the reader learns the payroll operator does three jobs — Detective, Data collector & human chaser, Data processor — watches the agent do each one on the same shift, and leaves believing a specialist agent that knows their rulebook wins.
FIRST VIEWPORT: claim left, live agent log right, the two running dollar counters in the log's footer; primary action "See it catch one" anchors to the Detective chapter.
FORM: three jobs as chapters (candidate 3 of 7, seed acfea111).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
```

---

## 2. Tokens & fonts (`src/index.css`)

Replace the generated `:root` block and fonts. Delete the `.dark` block and the `@custom-variant dark` line. Remove `@import "@fontsource-variable/geist"` and uninstall `@fontsource-variable/geist`. Keep `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";`.

Fonts are loaded in `index.html` from Google Fonts:
`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">`

In `@theme inline` set:
```
--font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
--font-heading: 'Space Grotesk', var(--font-sans);
--font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
--color-warning: var(--warning);  --color-warning-foreground: var(--warning-foreground);
--color-success: var(--success);  --color-success-foreground: var(--success-foreground);
--color-info: var(--info);        --color-info-foreground: var(--info-foreground);
```
`:root` (light only, sRGB hex is fine):
```
--background:#ffffff; --foreground:#09090b; --card:#ffffff; --card-foreground:#09090b;
--popover:#ffffff; --popover-foreground:#09090b;
--primary:#22c55e; --primary-foreground:#052e16;
--secondary:#f4f4f5; --secondary-foreground:#18181b;
--muted:#f4f4f5; --muted-foreground:#71717a;
--accent:#f4f4f5; --accent-foreground:#18181b;
--destructive:#dc2626; --border:#e4e4e7; --input:#e4e4e7; --ring:#a1a1aa;
--warning:#d97706; --warning-foreground:#78350f;    /* amber: awaiting a human / held */
--success:#15803d; --success-foreground:#052e16;    /* green text-safe: resolved, paid, corrected */
--info:#2563eb;    --info-foreground:#1e3a8a;        /* blue: processing / pending */
--radius:0.625rem;
```
Product status language inside mocks (the only colour in the mocks): `Processing` = info, `Flagged` / `Awaiting manager` / `Held` = warning, `Resolved` / `Paid` / `Corrected` = success, `Refused` / `Escalated` = destructive. Implement as `Badge` with `className` using the semantic tokens, e.g. `className="bg-warning/10 text-warning-foreground"` — define four tiny wrappers in `src/components/status-badge.tsx` (`<StatusBadge status="processing|flagged|awaiting|held|resolved|paid|corrected|refused">`) so every mock uses the same vocabulary.

Also in `index.css`: `html { scroll-behavior: smooth; scroll-padding-top: 4.5rem }` and `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto } * { animation: none !important; transition: none !important } }`.

Custom keyframes to define in `index.css` (use them via `animate-[name_duration_easing]` or small utility classes): `caret-blink` (mono caret), `row-in` (translateY(6px)+opacity → 0/1, 400ms, `cubic-bezier(0.16,1,0.3,1)`), `flip-in` (a badge swapping: scaleY 0.6→1 + opacity), `delta-fly` (a `$` chip translating up ~48px and fading, 700ms), `pulse-dot` (the live indicator), `shimmer` for the ingest strip. Keep all of them transform/opacity only.

---

## 3. Files to create

```
index.html                       head per §7; body: direction-contract comment, #root, AK widget script last
src/main.tsx                     no ThemeProvider
src/App.tsx                      <SiteHeader/> <main> sections in order </main> <SiteFooter/>
src/index.css                    per §2
src/lib/useSequence.ts           the ONE animation hook (§5)
src/lib/format.ts                money(n) → "$1,234.56", hhmm(date), clock(seconds) helpers
src/data/shifts.ts               shared dataset (§4)
src/components/status-badge.tsx  status vocabulary
src/components/site-header.tsx   sticky nav
src/components/site-footer.tsx
src/components/section.tsx       <Section id title lede tone="white|muted"> — one spacing rhythm for the whole page
src/components/mock-frame.tsx    the white product frame every mock sits in (Card + top bar with a mono title + "synthetic" outline badge + optional live dot)
src/sections/Hero.tsx
src/sections/Today.tsx
src/sections/ThreeJobs.tsx
src/sections/Detective.tsx
src/sections/Chaser.tsx
src/sections/Processor.tsx
src/sections/NeverLeaves.tsx
src/sections/Stakes.tsx
src/sections/WhoWhyNow.tsx
src/sections/Thesis.tsx
src/sections/Close.tsx
src/mocks/LiveLog.tsx
src/mocks/ExcelShuffle.tsx
src/mocks/ShiftDesk.tsx
src/mocks/RulesPanel.tsx
src/mocks/RuleFromSentence.tsx
src/mocks/ChaserThread.tsx
src/mocks/ConnectorRail.tsx
src/mocks/AuditStream.tsx
src/mocks/MemoryLedger.tsx
```
The logo is at `src/assets/logo-small.svg` (import it). Delete `src/assets/react.svg`, `public/vite.svg` if present.

---

## 4. Shared dataset — `src/data/shifts.ts` (author exactly these values)

```ts
export type Discrepancy = 'missing-clock-out' | 'duplicate-clock-in' | 'training-rate' | 'missed-meal-break' | 'ot-held-this-week' | 'facility-clock-cap'
export type Shift = {
  id: string; worker: string; initials: string; facility: string; role: string; state: 'CA'|'NY'|'TX';
  scheduled: [string,string]; timesheetIn: string; timesheetOut: string|null; locationIn: string; locationOut: string;
  rate: number; hoursPaid: number; discrepancy: Discrepancy; discrepancyLabel: string; rule: string;
  evidence: string[]; humanAsked?: string; humanReply?: string; decision: string;
  underCorrected: number; overCorrected: number; payout: number; status: 'paid'|'held'
}
```
The six shifts (times are local 24h strings):

| id | worker (initials) | facility · role · state | scheduled | timesheet in/out | location in/out | rate | hours paid | discrepancy · label | rule | evidence | human asked → reply | decision | under | over | payout | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4821 | Maria R. (MR) | Mercy General · Housekeeping · CA | 09:00–16:30 | 08:58 / — (missing) | 08:52 / 17:01:40 | 24.50 | 8.05 | missing-clock-out · "Clock-out missing" | FAC-MERCY-02 | ["ADP timesheet", "geofence exit 17:01:40", "rule FAC-MERCY-02"] | "Dana K. (Housekeeping supervisor)" → "Confirmed — she left at 5, we ran late on the east wing." | "Clock-out set to 17:01 (94% confidence), manager confirmed" | 13.48 | 0 | 197.23 | paid |
| 4822 | Jamal W. (JW) | Northbank Arena · Event security · NY | 14:00–22:00 | 14:00 & 14:06 (two clock-ins) / 22:04 | 13:52 / 22:09 | 21.00 | 8.07 | duplicate-clock-in · "Duplicate clock-in" | CS-01 | ["Ubeya clock export", "two punches 6 min apart", "rule CS-01"] | — | "Second punch merged; one shift, not two" | 0 | 84.00 | 169.47 | paid |
| 4825 | Priya S. (PS) | Sutter Health · CNA orientation · CA | 07:00–15:00 | 06:58 / 15:02 | 06:55 / 15:05 | 18.00 (training rate; standard 26.00) | 8.07 | training-rate · "Orientation billed at standard rate" | CON-SUTTER-01 | ["Sutter roster: orientation", "contract §4.2", "rule CON-SUTTER-01"] | — | "Paid at training rate per contract; invoice line $0" | 0 | 64.56 | 145.26 | paid |
| 4826 | Luis M. (LM) | Mercy General · Housekeeping · CA | 06:00–14:30 | 06:01 / 14:31 | 05:58 / 14:33 | 24.50 | 9.50 | missed-meal-break · "No meal break before hour 5" | CA-MB-01 | ["no break punch", "location: continuous on-site", "rule CA-MB-01"] | "Dana K." → "Correct, we skipped lunch, short-staffed." | "1-hour meal premium added" | 24.50 | 0 | 232.75 | paid |
| 4830 | Aisha B. (AB) | Mercy General · ICU tech · CA | week: 43.0 h | — | — | 24.50 | 40.00 | ot-held-this-week · "3.0 h overtime held" | TW-1187 | ["weekly total 43.0 h", "temporary rule TW-1187 (Aug 24–30)", "manager notified"] | "Dana K." → (pending) | "3.0 h OT held for review, not paid; manager notified" | 0 | 110.25 | 980.00 | held |
| 4833 | Tom K. (TK) | Bayview Warehouse · Forklift · TX | 08:00–16:30 | 08:02 / 16:00 (exactly 8:00 span) | badge 07:57 / badge 16:47 | 19.00 | 8.75 | facility-clock-cap · "Facility clock capped at 8:00" | FAC-BAYVIEW-01 | ["facility clock 8:00 exact", "door badge 16:47", "rule FAC-BAYVIEW-01"] | "Ray P. (Shift lead)" → "Yeah the clock maxes out, he was here till quarter to five." | "Clock-out set to 16:47 from badge, lead confirmed" | 14.25 | 0 | 166.25 | paid |

Also export:
- `PEOPLE`: `{ maria: 'Maria R.', dana: 'Dana K.', olivia: 'Olivia B.', ray: 'Ray P.', operator: 'Sam T.' }` (Sam T. is the payroll operator persona).
- `RULE_SOURCES` (in this order): `Legal`, `State`, `Facility`, `Contract`, `Vertical`, `Time-based`, `Common sense`, `This week`.
- `RULES: { id, source, text, kind: 'deterministic'|'llm'|'both', expires?: string, scope?: string }[]`:
  - LEG-OT-40 · Legal · "Overtime after 40 hours in a workweek is paid at 1.5×." · deterministic
  - LEG-TRAIN-01 · Legal · "Time spent in required training is paid time." · deterministic
  - CA-MB-01 · State · "California: a 30-minute unpaid meal break must start before the end of the 5th hour; if it's missed, pay a 1-hour premium." · deterministic
  - CA-OT-8 · State · "California: daily overtime after 8 hours, double time after 12." · deterministic
  - FAC-MERCY-02 · Facility · "Mercy General's wall clock caps at 8:00 — treat exact 8:00 clock-outs as suspect and verify with location." · both · scope Mercy General
  - FAC-BAYVIEW-01 · Facility · "Bayview has no GPS indoors; door-badge times are the location evidence." · llm · scope Bayview Warehouse
  - CON-SUTTER-01 · Contract · "Sutter orientation shifts bill $0 and pay at the training rate." · deterministic · scope Sutter Health
  - CON-NB-03 · Contract · "Northbank: egress extension counts as worked only with supervisor confirmation." · llm · scope Northbank Arena
  - VER-HC-01 · Vertical · "Healthcare: shift-handoff overlap up to 15 minutes is paid." · deterministic
  - VER-EV-02 · Vertical · "Event security: post-event egress up to 45 minutes is expected; beyond that, ask." · llm
  - TB-ROUND-7 · Time-based · "Round to the nearest 15 minutes only when the punch is within 7 minutes." · deterministic
  - TB-WKND-01 · Time-based · "Weekend differential starts Saturday 00:00 local time." · deterministic
  - CS-01 · Common sense · "Two clock-ins within 10 minutes are one shift, not two." · deterministic
  - CS-02 · Common sense · "A clock-out before its clock-in is a typo — ask, don't pay." · llm
  - TW-1187 · This week · "No overtime at Mercy General this week." · deterministic · scope Mercy General · expires "Sun Aug 30"
  - TW-1188 · This week · "Northbank Championship Final: egress allowed to 23:30 on Saturday only." · deterministic · scope Northbank Arena · expires "Sat Aug 29"
- `MEMORY: { date, text }[]`: ("Mar 3","Mercy General's wall clock caps at 8:00 — learned from 14 identical clock-outs"), ("Apr 11","Dana K. approves OT for ICU only; housekeeping OT goes to Facilities"), ("May 2","Sutter orientation shifts pay the training rate"), ("Jun 20","Bayview: door-badge times are the location source"), ("Jul 13","Northbank egress extensions need Olivia B."), ("Aug 24","No overtime at Mercy General this week (expires Sun)").
- `MEMORY_STATS`: `{ rules: 61, facilities: 3, people: 14, weeks: 22 }`.
- `AUDIT_START`: `{ under: 12418.30, over: 9207.75 }` — the starting values of the two counters.

Money formatting: always `$1,234.56` (two decimals) in mono, `tabular-nums`.

---

## 5. The animation hook — `src/lib/useSequence.ts`

```ts
export function useSequence(steps: number[] /* ms per phase */, opts?: { loop?: boolean; restartDelay?: number }): { phase: number; ref: React.RefObject<HTMLElement>; reduced: boolean }
```
- `phase` starts at 0 and advances through `steps.length` phases; with `loop` it resets to 0 after `restartDelay` (default 1200 ms).
- Timers only run while the `ref` element is intersecting (IntersectionObserver, threshold 0.25); leaving the viewport pauses; re-entering resumes.
- If `matchMedia('(prefers-reduced-motion: reduce)').matches`, `reduced` is true and `phase` is pinned at `steps.length - 1` (final state).
- Clean up every timer and observer on unmount. No `setInterval` drift: schedule the next `setTimeout` from the current phase.

Also export `useCountUp(target: number, durationMs: number, active: boolean): number` (rAF, ease-out, tabular) for the counters, and `useTypewriter(text: string, cps: number, active: boolean): string` for typed lines.

---

## 6. Page structure and copy (build exactly this, in this order)

Voice: plain, specific, operator-literate; sentence case; no hype words ("revolutionary", "seamless"); no exclamation marks. Headings carry themselves (no labels above them).

### Site header (sticky, `bg-background/85 backdrop-blur border-b`, h-14)
Left: logo (`logo-small.svg`, `size-7`) + "HyperTrack" (font-heading, medium) + a thin `Separator orientation="vertical"` + "Payroll Ops" (muted). Center (md+): anchor links `The three jobs` (#jobs) · `Rules` (#rules) · `Who it's for` (#who) · `Thesis` (#thesis). Right: `Badge variant="outline"` "Internal · hypothesis v1" (hide on mobile) and `Button size="sm"` "See it catch one" → `#detective`.

### 1. Hero (`#top`) — two columns on lg (7/5), stacked on mobile
- H1 (font-heading, 700, `text-5xl lg:text-6xl`, tracking −0.03em, balance): **Spots every single payroll discrepancy. In real time.**
- Lede (≤ 70ch, `text-lg text-muted-foreground`): *A payroll operations agent for staffing and gig work. It ingests every timesheet and location ping, checks them against your rules, chases the people who know, and pays out — with a dollar figure for what it just saved you.*
- CTAs: `Button` "See it catch one" (→ `#detective`, icon `ArrowDown` inline-end) · `Button variant="outline"` "Read the thesis" (→ `#thesis`).
- Under the CTAs, one muted line: *Built by the team behind Closeout Copilot. Every number on this page is synthetic.*
- Right column: **LiveLog mock** (§6-M1). On mobile it goes below the lede.

### 2. Today (`#today`, tone muted) — "Today it all runs through one spreadsheet."
Lede: *Timekeeping, payroll and the rules live in three different systems. A payroll operator moves it between them by hand: download the facility report, cross-reference the app punches, check the GPS log, read the message thread, make a judgment call, key it into payroll. Fifteen to thirty minutes per disputed shift. All of it can be automated — and done better than it was ever done by hand.*
Mock: **ExcelShuffle** (§6-M2).

### 3. Three jobs (`#jobs`) — "Your payroll person does three jobs."
Lede: *We interviewed payroll operations people. Strip away the tools and their week is three jobs. Their goal is one sentence: the business suffers no financial loss — not from overpayments, not from worker churn, not from legal blowback. The agent works for the same sentence.*
Three columns (plain, hairline-divided — NOT cards): **Detective** — *spots discrepancies by holding every shift against the rulebook: legal, state, facility, contract, vertical, time-based, common sense, and whatever changed this week.* · **Data collector & human chaser** — *pulls timesheets and location from every source, asks humans for what's missing, follows up until it's resolved, decides by the deadline.* · **Data processor** — *moves the result between platforms and formats and initiates the payout.* Each column ends with a small `Button variant="link"` "Watch the agent do it →" to its chapter.

### 4. Chapter: Detective (`#detective`, tone muted) — "Detective. It spots the discrepancy the second the shift ends."
Lede: *Shift 4821 just ended at Mercy General. The timesheet came in from ADP with no clock-out. Watch.*
Mock: **ShiftDesk** (§6-M3).
Then a sub-block (`#rules`) headed **"The rulebook, in plain English."** Lede: *Every rule you already apply, written the way you'd say it. The agent compiles each one into a deterministic check, an LLM check, or both — and tells you which.* Mock: **RulesPanel** (§6-M4).
Then a sub-block headed **"Change the rules in one sentence."** Lede: *Things change on the ground. Say it once; it becomes a time-bound rule that expires on its own. That malleability is what reality looks like.* Mock: **RuleFromSentence** (§6-M5).

### 5. Chapter: Data collector & human chaser (`#chaser`) — "Data collector. It asks the humans, then follows up until it's resolved."
Lede: *Shift 4821 needs a manager's word. The agent already has ADP, the geofence and the rulebook; it goes and gets the one thing it doesn't have — from the person who has it — and decides before the payroll cutoff.*
Mock: **ChaserThread** (§6-M6).

### 6. Chapter: Data processor (`#processor`, tone muted) — "Data processor. It moves the data, pays out, and tells you what it saved."
Lede: *Facility PDF to normalized shift to ADP to the invoice line. Then the two numbers, every single shift: dollars of underpayment corrected, dollars of overpayment corrected — a live, transparent audit trail built for agentic operators, not for humans to tab through.*
Mocks: **ConnectorRail** (§6-M7) then **AuditStream** (§6-M8) stacked.

### 7. It never leaves (`#memory`) — "It gets smarter every week. And it never leaves."
Lede: *Every quirk of your operation it learns stays learned. If your payroll person leaves, the agent doesn't; your context remains with it.*
Mock: **MemoryLedger** (§6-M9).

### 8. Stakes (`#stakes`, tone muted) — "Where payroll loses money."
A four-row ledger `Table` (not cards): columns *Loss* · *What it costs you* · *What the agent does*. Rows: **Overpayments** · margin, straight off the P&L · catches them before payout, per shift, with the rule that fired · **Underpayments** · legal overhead, mediation, wage-claim exposure · corrects them before the worker notices, with the evidence attached · **Delayed payouts** · worker churn — people leave the platform that pays late · decides by the cutoff, every time · **Overpayments you invoiced** · customer churn when they audit the bill · the invoice line matches the corrected payout. Under the table one sentence: *Same goal as your payroll person: no financial loss.*

### 9. Who it's for / why now (`#who`) — "Every kind of staffing company. Sooner than it feels."
Three plain columns: **Marketplace staffing vendors** · **Staffing buyers** (MSPs and enterprises running vendor programs) · **Gig-work providers with their own workforce** (no marketplace in between). One line each on what breaks for them today. Then an `Alert` (icon `TrendingUp`) titled *For the CFO and the CEO* — *There's an imperative to buy AI or get left behind, and enough foresight to see that manual payroll operations is going away — even where it isn't a burning problem today.*

### 10. Thesis (`#thesis`, tone muted) — "Why a specialist wins."
Prose, founders' voice, ~180 words, 2–3 paragraphs at 65ch: *There will be many general-purpose agents. A payroll-ops agent fine-tuned for gig work will win their confidence.* / *The place to land first is where the detective work starts: accepting discrepancy rules in natural language from many sources and programming them into a combination of deterministic and LLM-based checks. Not everything thrown into a context window. An algorithm that builds the customer's confidence that it is intimately familiar with their workflow — that is what wins the market.* / *HyperTrack's job is to be the leading payroll operations AI in staffing and gig work.* Beside it, a three-step diagram built from bordered `div`s with `ArrowRight` between: *Rules in plain English, from anywhere* → *Compiled: deterministic + LLM checks* → *Confidence that it knows your operation*. Under it a one-line lineage note: *Grown out of Closeout Copilot — the same evidence engine (customer systems, time tracking, location intelligence), pointed at payroll operations.*

### 11. Close (`#close`) — "Payroll superpowers. Not a replacement."
One paragraph: *The payroll person stays. They stop being the spreadsheet.* CTAs: "See it catch one" (→ `#detective`) · `Button variant="outline"` "Pricing on the homepage" (→ `https://closeoutcopilot.com/#pricing`, external).
Footer: logo + "HyperTrack" · *Synthetic demo data · Hypothesis · August 2026* · link `closeoutcopilot.com`.

---

## 6-M. The mocks (each in a `MockFrame`; each with `role="img"` + `aria-label`; each `synthetic`-labelled)

**M1 · LiveLog (hero, the signature).** A white `Card`; top bar: mono title `agent · live`, a pulsing green dot (`pulse-dot`), the current wall-clock time (updates every second, mono). Body: a fixed-height (≈ 380px) log area, mono `text-[13px]`, rows enter with `row-in`; older rows fade slightly; the area keeps the last ~9 rows visible (older rows removed from DOM). Each row = timestamp (from a fake clock that starts at `Date.now()` and advances realistically: 1–2 s between machine lines, then jumps ~7 min for the human reply) + message + inline `Badge`s for evidence. Footer (`CardFooter`): two counters side by side — `Underpayments corrected ↓` and `Overpayments corrected ↑`, each `font-heading text-2xl tabular-nums` with a mono `$` prefix; starting from `AUDIT_START`. Script per shift (≈ 9 s), looping over all 6 shifts:
1. `shift {id} ended · {facility} · {role} · {worker}`
2. `timesheet received` + Badge source (ADP / Ubeya / Sutter roster / facility clock) + `in {timesheetIn} · out {timesheetOut ?? '—'}`
3. `⚠` line (use lucide `TriangleAlert`, not the emoji) `{discrepancyLabel}` with `StatusBadge flagged`
4. `checked location` + Badge `geofence {locationIn}–{locationOut}` (or `door badge` for Bayview)
5. `checked rules` + Badges for each rule id in `evidence`
6. if `humanAsked`: `asked {humanAsked}` → (time jump) `reply: "{humanReply}"` — for 4830 the reply line is `awaiting reply · OT held` with `StatusBadge held`
7. decision line (`text-success-foreground`, `CircleCheck` icon): `{decision}`
8. payout line: `payout ${payout}` + `StatusBadge paid|held`, then a `$ +{under}` / `$ +{over}` chip that plays `delta-fly` upward and the matching counter counts up by that amount.
Reduced motion: render the full 8 lines for shift 4821 statically and counters at start+4821 deltas.

**M2 · ExcelShuffle.** Three source `Card size="sm"` in a row (`Timekeeping` — rows: "Facility clock export.xlsx", "Paper sign-in sheet (photo)", "QR kiosk punches", "App clock-ins"; `Payroll` — "ADP hours import", "Gusto contractor run"; `Rules` — "Client contract §4.2", "CA meal-break memo", "This week's email: no OT at Mercy"), an arrow column, then a spreadsheet `Table` (mono, zinc gridlines, columns A–E, 6 rows) beside an `Avatar` with fallback `ST` and caption `Sam T. · payroll ops`. Loop: a highlighted source row (bg-warning/10) lifts and slides into the next empty spreadsheet row (`row-in`), the spreadsheet cell values type in; every ~1.6 s; after 6 rows the table clears and restarts. Caption in frame: `15–30 min per disputed shift`.

**M3 · ShiftDesk.** A product screen: `Tabs` (controlled, `variant="line"`) `Queue · Evidence · Decision`; height ≈ 440px. Phases (auto-advance, ~1.8 s each, loop with a pause): (1) Queue tab: `Table` of 5 shifts (4822, 4825, 4826, 4833 as `resolved`/`paid`; then 4821 row inserts at top with `StatusBadge processing`, `Skeleton` in its evidence cell for 1 s); (2) 4821's badge flips to `flagged` "Clock-out missing"; (3) tab → Evidence: three bordered panels — **Timesheet** (ADP · in 08:58 · out — with the `—` in `text-warning-foreground`), **Location** (geofence · entered 08:52 · exited 17:01:40, a tiny inline SVG map: a rounded rectangle "Mercy General" with a dot path that exits the fence), **Rules** (list: CA-MB-01 ✓ break taken 12:10, TW-1187 ✓ 34.0 h this week, FAC-MERCY-02 → "not an 8:00 clock-out"); each panel enters with `row-in` in sequence; (4) a **Proposed clock-out** row: `17:01` + `Progress value=94` + `94% confidence` + `StatusBadge awaiting` "Needs manager confirmation → Dana K."; (5) tab → Decision: `Badge` "handed to Data collector →" and a muted line *continues below in the next chapter*. Reduced motion: Evidence tab, phase 4 state.

**M4 · RulesPanel.** `Tabs` (controlled) with the 8 `RULE_SOURCES` as triggers, auto-advancing every 2.4 s. Content = `Table` of that source's rules: columns *Rule* (sentence), *Compiled as* (`Badge variant="secondary"` `deterministic` / `LLM check` / both badges), *Scope* (facility or `all`), *Active* (`Switch checked disabled size="sm"`), and for `This week` an extra `expires {date}` `Badge variant="outline"`. On each tab entry the first row plays a **compile** animation: the sentence's key tokens get a brief `bg-primary/15` highlight (span wrap of 2–3 phrases), then a small bordered panel under the row fades in showing `scope · condition · effect · expires` as mono key:value pairs. Reduced motion: `Facility` tab with the compiled panel open.

**M5 · RuleFromSentence.** Chat `Card`: message from `Avatar ST` (Sam T., payroll ops) types in with `useTypewriter`: *"No overtime allowed this week at Mercy General please."* Then an agent reply (Avatar with the logo) assembles a rule card, rows appearing one by one: `Rule` `TW-1187` · `Scope` `Mercy General` · `Window` `Mon Aug 24 – Sun Aug 30` · `Effect` `hours over 40 held for review, not paid` · `Compiled as` `deterministic` · `Status` `Switch checked` + `Badge outline` `expires automatically`. Then, below, a single shift row (4830 · Aisha B. · 43.0 h) whose badge flips to `held` "3.0 h OT held · TW-1187 · manager notified". Loop after 4 s pause. Reduced motion: final state.

**M6 · ChaserThread.** Two panes: left `Open follow-ups` `Table` (4821 · Dana K. · decide by 18:00 with `Progress` counting down; 4830 · Dana K. · OT confirmation; 4833 · Ray P. · badge time) ; right a message thread for 4821: agent → Dana K. (SMS): *"Hi Dana — Maria R.'s shift at Mercy today has no clock-out. Location shows she left at 5:01 pm. Can you confirm she worked until 5?"* (types in) → after a pause the countdown advances ~7 min and Dana's bubble arrives: *"Confirmed — she left at 5, we ran late on the east wing."* → agent bubble: *"Thanks. Recording 17:01 and paying out."* → left row 4821 flips to `resolved`, moves to a `Resolved` section. Also show a small **sources** strip above the thread: `API · ADP` `Browser · Ubeya` `Email · facility PDF` `Photo · paper sheet` `SMS · manager` as `Badge variant="outline"` with a `shimmer` pass to signal ingest. Reduced motion: final state.

**M7 · ConnectorRail.** Four bordered nodes with `ArrowRight` between: **Facility PDF / ADP export** (`FileText`) → **Normalized shift** (a mono key:value block for 4821: worker, facility, in 08:58, out 17:01, hours 8.05, rate 24.50, rule FAC-MERCY-02, confidence 0.94) → **ADP payout** (`$197.23` `StatusBadge paid`) → **QuickBooks invoice line** (`8.05 h × bill rate` `Badge outline` `matches payout`). Each node has a `Progress` that fills (0→100 over 900 ms) in sequence; connectors light `bg-primary` as data passes. Loop.

**M8 · AuditStream.** Two stat `Card`s (`Underpayments corrected` / `Overpayments corrected`, `useCountUp` on enter from `AUDIT_START`, mono `$`, font-heading 3xl) over a `Table`: columns *Shift* · *Facility* · *Discrepancy* · *What the agent did* · *↓ Under* · *↑ Over* · *Evidence*. Rows insert at the top every ~2.5 s in dataset order starting with 4821 (`row-in`); keep max 6 rows; each insert bumps the matching counter by that row's amount. Evidence cell = up to 3 `Badge variant="outline"` (truncate). Reduced motion: all 6 rows static, counters at start + all deltas.

**M9 · MemoryLedger.** Left: a list of `MEMORY` entries appending one by one (mono date column, sentence), each with a `Badge variant="secondary"` `learned`. Right: four mono stats (`61 rules`, `3 facilities`, `14 people`, `22 weeks`) whose numbers count up as entries append, plus a `Progress` labelled `week 1 → week 52` filling to ~42%. Loop with pause. Reduced motion: all six entries.

Motion rules for all mocks: entrance `cubic-bezier(0.16,1,0.3,1)`, 300–500 ms; feedback (badge flip) ≤ 200 ms; nothing bounces; no stagger longer than 600 ms total; everything transform/opacity only; loops stop offscreen.

---

## 7. `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="robots" content="noindex" />
    <title>HyperTrack Payroll Ops — Spots every payroll discrepancy in real time</title>
    <meta name="description" content="A payroll operations agent for staffing and gig work. Spots every single payroll discrepancy in real time, chases the humans who know, and pays out — with a dollar figure for what it saved." />
    <meta name="theme-color" content="#ffffff" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://closeoutcopilot.com/payroll" />
    <meta property="og:title" content="HyperTrack Payroll Ops" />
    <meta property="og:description" content="Spots every single payroll discrepancy in real time." />
    <meta property="og:image" content="https://closeoutcopilot.com/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="HyperTrack Payroll Ops" />
    <meta name="twitter:description" content="Spots every single payroll discrepancy in real time." />
    <meta name="twitter:image" content="https://closeoutcopilot.com/og-image.png" />
    <!-- Google Fonts links from §2 -->
  </head>
  <body>
    <!-- direction contract from §1 -->
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
    <script src="https://agent-keyboard.fly.dev/widget.js" data-site="closeout" defer></script>
  </body>
</html>
```
`/favicon.svg` is served from the site root in production (it exists there); in dev it 404s — acceptable.

---

## 8. Build config and site wiring

- `vite.config.ts`: add `base: '/payroll/'` and `build: { outDir: '../payroll', emptyOutDir: true }` (keep the react + tailwindcss plugins and the `@` alias).
- Append to the `command` string in `../netlify.toml` (one edit, keep everything else): ` && cd ../payroll-src && npm install && npm run build`.
- Append to `../_headers`:
```

/payroll/
  Cache-Control: no-cache

/payroll/index.html
  Cache-Control: no-cache

/payroll/assets/*
  Cache-Control: public, max-age=31536000, immutable
```
- `package.json` name → `payroll-ops-landing`. Remove `@fontsource-variable/geist`.

---

## 9. Verify before you return

1. `npm run typecheck && npm run lint && npm run build` all pass; the build writes `../payroll/index.html` and `../payroll/assets/*` with `/payroll/assets/...` URLs.
2. Do NOT install or use Playwright or any other browser tooling. Browser verification (screenshots at 1440 and 390, console, reduced-motion) is done by the orchestrator with its own dev-browser after you return. Just make sure `python3 -m http.server 8080` from the repo root serves `http://localhost:8080/payroll/` correctly (curl it and confirm the HTML references `/payroll/assets/...`).
3. Check by reading your own code: every mock loops and pauses offscreen; `prefers-reduced-motion` renders final states; nav anchors match section ids; JS bundle < 300 KB gzipped (report the size from the vite build output).
4. Return: the file list you created/changed, the bundle size, and any spec item you could not satisfy (with why). Do not commit.
