---
name: HyperTrack Payroll Ops
description: A white payroll-ops control surface — zinc hairlines, mono ledgers, one green reserved for the agent's own decisions.
colors:
  background: "#ffffff"
  foreground: "#09090b"
  card: "#ffffff"
  card-foreground: "#09090b"
  primary: "#22c55e"
  primary-foreground: "#052e16"
  secondary: "#f4f4f5"
  secondary-foreground: "#18181b"
  muted: "#f4f4f5"
  muted-foreground: "#71717a"
  accent: "#f4f4f5"
  accent-foreground: "#18181b"
  border: "#e4e4e7"
  input: "#e4e4e7"
  ring: "#a1a1aa"
  warning: "#d97706"
  warning-foreground: "#78350f"
  success: "#15803d"
  success-foreground: "#052e16"
  info: "#2563eb"
  info-foreground: "#1e3a8a"
  destructive: "#dc2626"
  destructive-foreground: "#7f1d1d"
typography:
  display:
    fontFamily: "Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  subtitle:
    fontFamily: "Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  lede:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  mono-field:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tabular-nums"
  mono-log:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.625
    fontFeature: "tabular-nums"
  counter:
    fontFamily: "Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  4xl: "1.625rem"
spacing:
  panel: "0.75rem"
  card: "1rem"
  header-stack: "1.25rem"
  gutter: "1.25rem"
  gutter-sm: "2rem"
  gutter-lg: "2.5rem"
  chapter-stack: "2.25rem"
  section-stack: "3rem"
  section-y: "5rem"
  section-y-md: "7rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2.25rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2.25rem"
  button-link-chapter:
    backgroundColor: "transparent"
    textColor: "{colors.success}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0"
    height: "auto"
  badge-synthetic:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.4xl}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  badge-status-warning:
    backgroundColor: "color-mix(in oklab, var(--warning) 10%, transparent)"
    textColor: "{colors.warning-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.4xl}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  badge-status-success:
    backgroundColor: "color-mix(in oklab, var(--success) 10%, transparent)"
    textColor: "{colors.success-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.4xl}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  badge-status-info:
    backgroundColor: "color-mix(in oklab, var(--info) 10%, transparent)"
    textColor: "{colors.info-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.4xl}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  badge-status-destructive:
    backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)"
    textColor: "{colors.destructive-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.4xl}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  mock-frame:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card}"
    width: "100%"
  mock-panel:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "{spacing.panel}"
  section-container:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    padding: "5rem 1.25rem"
    width: "80rem"
  section-container-muted:
    backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)"
    textColor: "{colors.foreground}"
    padding: "5rem 1.25rem"
    width: "80rem"
---

# Design System: HyperTrack Payroll Ops

## Overview

**Creative North Star: "The Payroll Ledger, Live"**

This is a white operations surface that behaves like a ledger someone is
actually keeping. The page is not decorated: it is ruled. Zinc hairlines
divide columns and rows, product mocks are white cards held by a single 1px
ring, and every quantity — a shift ID, a timestamp, a rate, a dollar figure,
a confidence percentage — is set in JetBrains Mono with tabular figures so
columns of numbers line up the way they would in a payroll export. Space
Grotesk carries headings and the two running dollar counters; Inter carries
everything a person reads as a sentence.

One green (`#22c55e`) does all the accent work, and it is spent only on the
agent's own activity: the live pulse dot, the primary CTA, the dollar delta
flying out of the log, the connector segment lighting as data moves, the
phrase the compiler just picked out of a rule. Status is a separate,
deliberately quieter vocabulary — warning / success / info / destructive as
10% tints behind darkened text — so a queue full of states never competes
with the one green thing the agent is doing right now. There are no shadows
anywhere on this surface, no gradients, no glass; depth is a hairline and a
tint step.

The page argues by demonstration rather than assertion, and the visual system
serves that: nine animated product mocks, each a self-contained white frame
labelled `synthetic`, each looping a short evidence-to-decision sequence and
each declared `role="img"` so a screen reader gets one honest sentence instead
of a moving table. Confirmed rejections: no dark mode on this surface, no
eyebrows or kickers above headings, no section numbering, no card-grid
"feature" layouts, no marketing photography, no shadows, no second accent hue.

**Key Characteristics:**
- White ground, zinc hairlines, one green reserved for agent action
- Mono for every number; prose never mono
- Flat by construction — 1px rings and tint steps, zero `box-shadow`
- Hairline-divided columns and real tables instead of card grids
- Headings are full declarative sentences ending in a period, with no eyebrow above them
- Nine looping product mocks, all non-interactive, all labelled synthetic

## Colors

A neutral zinc field with one saturated green and a four-state status
vocabulary that only ever appears as a tint.

### Primary
- **Agent Green** (`#22c55e`): The only saturated accent on the page, and it
  means "the agent is doing something." Used on: the live pulse dot in a mock
  frame header, primary CTAs (`See it catch one`), the corrected-dollar delta
  badge rising out of the log, the lit segment of the transfer rail, the
  compiled-phrase highlight inside a rule (`bg-primary/15`), the row tint on
  the spreadsheet line being typed (`bg-primary/5`), the geofence entry/exit
  dots in the location SVG, and the `::selection` highlight (`bg-primary/20`).
  It is never a section background and never a decorative rule.
- **Deep Forest** (`#052e16`): The reading colour on top of green — CTA label
  text, and the text of the green delta badge. Green never carries white text
  on this surface.

### Secondary
- **Zinc Wash** (`#f4f4f5`): The single tint step that separates ground from
  ground — alternating section grounds at 55% (`bg-muted/55`), inner mock
  strips at 15–40%, secondary buttons and badges at full strength. It is the
  surface's only substitute for elevation.
- **Ink** (`#18181b`): Text on Zinc Wash (secondary buttons, secondary badges).

### Tertiary — the status vocabulary
Four hues, each with a darkened `-foreground` partner. The saturated value is
for 3.5px icons, small link text, and tint construction; the `-foreground`
value is what text is actually set in.
- **Amber Flag** (`#d97706`) / **Amber Ink** (`#78350f`): Something is unresolved
  and a human is involved — `Flagged`, `Awaiting manager`, `Held`; the missing
  clock-out dash; the source rows an operator is currently copying by hand.
- **Ledger Green** (`#15803d`) / the shared **Deep Forest** (`#052e16`): The agent
  reached a defensible answer — `Resolved`, `Paid`, `Corrected`; passed-rule
  check marks; the three "Watch the agent do it" chapter links.
- **Signal Blue** (`#2563eb`) / **Navy Ink** (`#1e3a8a`): Work in flight, no
  judgment yet — `Processing`.
- **Refusal Red** (`#dc2626`) / **Oxblood Ink** (`#7f1d1d`): The agent declined or
  escalated — `Refused`, `Escalated`. Declared and reachable through
  `StatusBadge`; not exercised by the current synthetic dataset.

### Neutral
- **Paper** (`#ffffff`): Page ground, card ground, and the ground of every inner
  mock panel — three surfaces of the same white, separated only by hairlines.
- **Near-Black** (`#09090b`): All body and heading text.
- **Hairline Zinc** (`#e4e4e7`): Every border, divider, table rule and card ring
  on the page. The most-used token in the system.
- **Muted Slate** (`#71717a`): Ledes, table body text, mock frame titles, field
  labels, timestamps, captions — everything secondary.
- **Focus Zinc** (`#a1a1aa`): Focus rings only, always at 50% with a 3px spread.

### Named Rules
**The One Green Rule.** `#22c55e` marks agent action and nothing else. If a
green element cannot be described as something the agent is doing or just did,
it is the wrong colour.

**The Tinted Status Rule.** Status colour reaches the page as a ~10% tint
behind its `-foreground` ink (`bg-warning/10 text-warning-foreground`), never
as a saturated fill and never as saturated body text. The saturated value is
allowed only on ≤14px icons and small link labels.

**The Zinc-Only Divider Rule.** Every border on the page is `#e4e4e7`. There is
no coloured border, no coloured rule, and no border thicker than 1px.

## Typography

**Display Font:** Space Grotesk (500/600/700, with Inter → system sans fallback)
**Body Font:** Inter (400/500/600, with system sans fallback)
**Label/Mono Font:** JetBrains Mono (400/500, with ui-monospace → Menlo fallback)

**Character:** Space Grotesk's slightly mechanical geometry gives headings and
the running dollar counters a control-panel authority; Inter keeps the argument
paragraphs plain and readable; JetBrains Mono is not decoration here but a
claim — anything set in it is a value the agent could be held to.

### Hierarchy
- **Display** (700, `3rem` / `3.75rem` from `lg`, line-height 0.98, tracking
  -0.03em): The hero H1 only. Constrained to `max-w-[13ch]` with `text-balance`
  so it breaks into three short lines.
- **Headline** (600, `1.875rem` → `2.25rem` at `sm` → `3rem` at `lg`, line-height
  1.08, tracking -0.03em): Every `Section` H2. Set with `text-balance` in a
  `max-w-[75ch]` header block. This spec is not overridden per-section — a
  section that needs a heading renders through `Section`.
- **Title** (600, `1.5rem` → `1.875rem` at `sm`, tracking -0.03em): Sub-chapter
  H3s that live inside a section (the rulebook and rule-change blocks inside
  Detective), paired with a `1rem` → `1.125rem` lede.
- **Subtitle** (600, `1.25rem`, tracking -0.02em): Column headings in the
  hairline-divided three-column blocks (the three jobs, the three audiences).
- **Lede** (400, `1rem` / line-height 1.75 → `1.125rem` at `sm`, Muted Slate):
  The one paragraph under a section heading. Capped at `max-w-[72ch]`; the hero
  lede is `1.125rem` / line-height 2 at `max-w-[70ch]`.
- **Body** (400, `1rem`, line-height 1.75): Column copy at `max-w-[42ch]`, thesis
  prose at `1.125rem` / line-height 2 and `max-w-[65ch]`.
- **Label** (500, `0.75rem`, sentence case): Field labels, table headers, and
  badge text. Counter captions drop to `0.625rem` and step up to `0.75rem` at `sm`.
- **Mono field** (400/500, `0.75rem`, tabular): Shift IDs, rule IDs, clock times,
  rates, hour counts, confidence values, mock frame titles, filenames.
- **Mono log** (400, `0.6875rem` → `0.8125rem` at `sm`, line-height 1.625): The
  agent's live event stream, in a fixed `4.7rem` timestamp gutter.
- **Counter** (Space Grotesk 600, `1.25rem` → `1.5rem` in the hero log footer,
  `1.875rem` in the audit stream, tabular): The two corrected-dollar totals. The
  `$` sign is set in mono at a smaller relative size and the digits in Space
  Grotesk — a deliberate hybrid so the number reads as headline, not as data.

### Copy voice
Plain, specific, operator-literate; no hype words and no superlatives. Headings
are sentences with a period. Chapters are named after the operator's job
("Detective.", "Data collector.", "Data processor.") and address the reader as
"your payroll person". The product's own vocabulary is used unglossed — shift,
timesheet, discrepancy, rule, evidence, outreach, decision, payout,
underpayment, overpayment, audit trail — with concrete synthetic particulars
(shift 4821, Mercy General, `FAC-MERCY-02`, 94% confidence) instead of adjectives.
Inside mocks the register drops to lowercase machine log: frame titles are
dot-separated (`agent · live`, `rulebook · compiler`), event lines are lowercase
and unpunctuated, and every claim of savings is a number next to the rule that
produced it. Disclosure is part of the voice: "Every number on this page is
synthetic" in the hero, `synthetic` on every frame, "Synthetic demo data ·
Hypothesis · August 2026" in the footer.

### Named Rules
**The Mono Ledger Rule.** Every timestamp, identifier, dollar amount, hour count
and percentage is JetBrains Mono with `tabular-nums`. Prose is never mono; mono
never carries a sentence longer than a field value (the compiled-rule
`key: value` grid is the boundary case, and it is still fields).

**The No-Eyebrow Rule.** A section opens with its H2. No kicker, no eyebrow, no
uppercase micro-label, no section number, no letter-spaced all-caps anywhere on
the page. There is no `uppercase` or `tracking-wide` class in the surface.

**The Full-Sentence Heading Rule.** Headings are declarative sentences ending in
a period ("Detective. It spots the discrepancy the second the shift ends."), not
noun phrases. A heading that could be a nav label is too short.

## Layout

One container governs everything: `max-w-7xl` (80rem) centred, with gutters of
`1.25rem` → `2rem` at `sm` → `2.5rem` at `lg`. The sticky header, every section
and the footer share it exactly, so all left edges align down the whole page.

**Vertical rhythm.** Sections are `5rem` of padding top and bottom, `7rem` from
`md`, with a `3rem` gap between the section header block and its content. Inside
a section header, heading-to-lede is `1.25rem`. Sub-chapters nested in a section
(Detective's rulebook and rule-change blocks) are separated by `2.5rem` → `4rem`
of top padding and use a `2.25rem` internal gap. The hero is slightly tighter
(`4rem` → `6rem` → `7rem`) because the log panel carries the height. The header
is a fixed `3.5rem` tall and `scroll-padding-top` is `4.5rem` so anchored
chapters clear it; `#rules` adds its own `scroll-mt-18`.

**Structural grammar.** The page is built from three shapes, and card grids are
not one of them:
1. **Full-bleed prose blocks** — heading + lede at ≤75ch, left-aligned.
2. **Hairline-divided columns** — `grid border-y md:grid-cols-3`, each column
   `py-8 md:px-8` with `md:border-l` between them (flipping to `border-t`
   stacked), and `md:first:pl-0 md:last:pr-0` so the outer columns stay flush
   with the container edge.
3. **Real tables** — the stakes comparison is a `<Table>` inside a `border-y`
   wrapper, not three cards.

**The hero** is a 12-column grid at `lg`: claim on 7, the live agent log on 5,
vertically centred, stacking to a single column below with `3rem` between.

**Responsive behaviour.** Below `md` the three-column blocks stack and their
vertical dividers become horizontal ones. Inside mocks, tables shed columns
rather than scroll: secondary columns are `hidden md:table-cell` (worker,
facility, evidence, "what the agent did") and any `min-w` is gated behind `sm:`
or `md:`. Multi-column mock internals collapse at `lg` or `xl`, and the transfer
rail rotates its arrows 90° when it stacks.

### Named Rules
**The Hairline Rule.** Related items sit in one bordered group divided by 1px
rules, not in separate cards with gaps. A "three things" block is one
`border-y` grid with `border-l` between columns.

**The Shed, Don't Scroll Rule.** Nothing on this page scrolls horizontally at
390px. A mock that cannot fit drops columns; a mock declared `role="img"` must
never require a horizontal drag to be read.

**The One Container Rule.** Header, sections and footer all use `max-w-7xl` with
`px-5 sm:px-8 lg:px-10`. No section invents its own gutter.

## Elevation & Depth

There is no elevation system. The surface contains zero `box-shadow`
declarations — no ambient shadow, no hover lift, no glow, no gradient, no
backdrop blur except the header's `backdrop-blur` behind `bg-background/85`.

Depth is expressed three ways, in this order of strength:
1. **A 1px ring or border** in Hairline Zinc — mock frames use `ring-1
   ring-border`, inner panels use `border`.
2. **A tint step** — alternating section grounds at `bg-muted/55`, the log's
   counter footer at `bg-muted/40`, chat and rail strips at `bg-muted/15`–`/40`.
   White-on-white panels inside a white card are legible because of the
   hairline, not because of a shade change.
3. **Opacity as recency** — in the live log, older rows fade by 7.5% per row to
   a 0.38 floor, so the newest line is the brightest thing in the panel.

### Named Rules
**The No-Shadow Rule.** This surface ships zero shadows. If something needs to
separate from its ground, it gets a hairline or a tint step. (shadcn's default
tab variant would introduce `shadow-sm`; the build uses `variant="line"`
everywhere, which explicitly sets `shadow-none`.)

**The Two-Tone Rule.** Sections alternate white and `bg-muted/55` down the page
(hero white, today muted, jobs white, detective muted, chaser white, processor
muted, memory white, stakes muted, who white, thesis muted, close white).
Alternation is the only sectioning device; there is no coloured band.

## Shapes

A single soft-rectangle language built from `--radius: 0.625rem` (10px), scaled:
`sm` 6px, `md` 8px, `lg` 10px, `xl` 14px, `4xl` 26px. Nothing on the page is a
circle except avatars, the live dot and the two geofence markers in the location
diagram.

- **Mock frames / cards**: 14px (`rounded-xl`).
- **Inner mock panels, buttons, wrappers around tables**: 10px (`rounded-lg`).
- **Chips, small resolved rows, source rows**: 8px (`rounded-md`).
- **Phrase highlights inside compiled rules, focus targets**: 6px (`rounded-sm`).
- **Badges**: 26px against a 20px height — a full pill.
- **Chat bubbles**: 14px with the corner nearest the speaker's avatar squared to
  6px (`rounded-tl-sm` for the agent, `rounded-tr-sm` for the human).

Borders are always 1px and always Hairline Zinc. The one dashed stroke in the
system is the geofence rectangle in the location panel (`stroke-dasharray="4 3"`
in `currentColor` at Muted Slate), which reads as a boundary rather than a box.

### Named Rules
**The Squared-Corner Bubble Rule.** A message bubble points at its sender by
squaring exactly one corner. Never a tail, never an arrow.

## Components

### Buttons
- **Shape:** Softly rounded (10px `rounded-lg`); `sm` size tightens to 8px.
- **Primary:** Agent Green ground, Deep Forest label, `h-9 px-2.5` at `lg` size,
  `h-7` in the header. Used exactly twice as a page CTA ("See it catch one") plus
  once in the sticky header — the primary button is itself a rare element.
- **Hover / Focus:** Background to `primary/80`; focus is a 3px `ring-ring/50`
  with a `border-ring` edge; `:active` translates down 1px.
- **Outline:** White ground, Hairline Zinc border, hover to Zinc Wash. The second
  CTA in every pair ("Read the thesis", "Pricing on the homepage").
- **Link (chapter):** Ledger Green text, no padding, `h-auto`, with a trailing
  `ArrowRight`. This is the only place a text link is coloured; nav and footer
  links stay Muted Slate and darken to Near-Black.
- **Icons:** Lucide only, `size-4` (`size-3.5` inline in mocks), marked
  `data-icon="inline-end"` so the button tightens its trailing padding.

### Badges
- **Style:** 20px tall pill, 12px label, transparent border by default.
- **`outline`:** Hairline border, Muted Slate or Near-Black text. Carries data
  provenance inside mocks — source names (`ADP`, `Ubeya`), rule IDs, geofence
  windows, `expires automatically`, and the mandatory `synthetic` label.
- **`secondary`:** Zinc Wash ground — compiler classifications (`deterministic`,
  `LLM check`), counts, `learned`, `handed to Data collector →`.
- **`StatusBadge`:** The closed status vocabulary — `processing` (info),
  `flagged` / `awaiting` / `held` (warning), `resolved` / `paid` / `corrected`
  (success), `refused` / `escalated` (destructive). Each renders as a 10% tint of
  its hue with `border-transparent` and the matching `-foreground` ink. Labels
  are sentence case and may be overridden per instance ("Clock-out missing",
  "Needs manager confirmation → Dana K.", "3.0 h OT held · TW-1187 · manager
  notified"); a long override adds `h-auto py-1 whitespace-normal text-left`
  rather than truncating.

### Tables
- **Style:** shadcn `<Table>` with hairline row rules; headers are `label`-sized
  Muted Slate, cells are body-sized, and every numeric or identifier cell is
  `font-mono tabular-nums`.
- **Placement:** Page tables sit inside a `border-y` wrapper with no card around
  them; mock tables sit inside a `rounded-lg border` wrapper or directly on the
  frame.
- **Emphasis:** A row under investigation gets `bg-warning/5` (and keeps that
  tint on hover); the row being typed gets `bg-primary/5`.

### Site header
Sticky, `h-14`, `bg-background/85` with `backdrop-blur` and a bottom hairline.
Logo mark + "HyperTrack" in Space Grotesk medium, a vertical `Separator` and
"Payroll Ops" in Muted Slate from `sm`. Four Muted Slate nav links (hidden below
`md`) darkening to Near-Black on hover, an `Internal · hypothesis v1` outline
badge from `lg`, and the primary CTA. Every interactive element carries a
`focus-visible:ring-3 ring-ring/50`.

### Site footer
A hairline top rule, one row at `sm` and above: logo + wordmark, the standing
disclosure "Synthetic demo data · Hypothesis · August 2026", and an underlined
link back to closeoutcopilot.com with `decoration-border underline-offset-4`.

### MockFrame — the signature component
Every product mock on this page is rendered through `MockFrame`, and the rules
are not negotiable:

- **Shell:** A white `<Card>` at 14px radius with `ring-1 ring-border` (the ring
  replaces shadcn's default `ring-foreground/10`), full width, `overflow-hidden`,
  `--card-spacing: 1rem`.
- **Header row:** a two-column grid — left, an optional Agent Green pulse dot
  (`live`) plus the frame title in mono `0.75rem` Muted Slate, always lowercase
  and dot-separated (`agent · live`, `shift desk · discrepancy 4821`,
  `rulebook · compiler`); right, optional `meta` (usually a mono clock) and the
  mandatory `synthetic` outline badge. Closed with a bottom hairline.
- **Caption (optional):** a `border-t` strip in `0.75rem` Muted Slate for a single
  factual note ("15–30 min per disputed shift").
- **Accessibility:** `role="img"` with a full-sentence `aria-label` describing what
  the animation shows, plus `aria-live="off"`. A mock is a picture, not a widget.
- **Non-interaction:** mocks that display controls disable them
  (`pointer-events-none`, `select-none`, `tabIndex={-1}`, `aria-disabled`,
  `disabled` with `data-disabled:opacity-100` so a disabled switch still reads as
  "on"). Nothing inside a mock responds to a click.
- **Fixed height:** panels that animate through phases hold a fixed or minimum
  height (`h-[23.75rem]`, `min-h-[27.5rem]`, `min-h-80`, `min-h-96`) so the page
  never reflows mid-loop and no phase looks empty.

### Named Rules
**The One Card Rule.** A `MockFrame` is the only `<Card>` in its subtree. Panels
inside a mock are `rounded-lg border bg-background p-3` divs with a `0.75rem`
medium title — never a nested card, never a second ring.

**The Synthetic Label Rule.** Every mock carries the `synthetic` badge, and the
footer repeats the disclosure. No number on this page is presented as real.

## Do's and Don'ts

### Do:
- **Do** reserve `#22c55e` for what the agent is doing right now — live dot,
  primary CTA, dollar delta, active rail segment, compiled-phrase highlight.
- **Do** set every identifier, time, rate, hour, dollar and percentage in
  JetBrains Mono with `tabular-nums`.
- **Do** render every section through `Section` so the heading spec
  (`text-3xl sm:text-4xl lg:text-5xl`, tracking -0.03em, balanced) and the
  `max-w-7xl / px-5 sm:px-8 lg:px-10 / py-20 md:py-28 / gap-12` container stay
  identical page-wide.
- **Do** divide grouped content with 1px Hairline Zinc rules — `border-y` around
  the group, `border-l` between columns from `md`, `border-t` when stacked.
- **Do** put every product mock in a `MockFrame` with `role="img"`, a
  full-sentence `aria-label`, and the `synthetic` badge.
- **Do** drive every animation from `useSequence` and let it pause offscreen.
- **Do** give reduced-motion users the final, fully populated frame of each mock
  (the hook returns the last phase; the stylesheet then kills all animation and
  transition).
- **Do** shed table columns with `hidden md:table-cell` when space runs out.
- **Do** write headings as complete declarative sentences ending in a period.

### Don't:
- **Don't** add a shadow. There are none on this surface, at rest or on hover.
- **Don't** add an eyebrow, kicker, uppercase micro-label or section number above
  a heading.
- **Don't** nest a `<Card>` inside a `MockFrame`, or ring an inner panel.
- **Don't** turn a "three things" block into a card grid; it is a hairline-divided
  three-column group or a table.
- **Don't** let a status hue appear as a saturated fill or as saturated body
  text — 10% tint plus the `-foreground` ink, with saturated values reserved for
  ≤14px icons and small link labels.
- **Don't** use green as a decorative, structural or background colour, and don't
  introduce a second accent hue.
- **Don't** make a mock interactive, focusable, or `aria-live`; a click target
  inside a `role="img"` is a bug.
- **Don't** let any mock scroll horizontally at 390px.
- **Don't** add a new keyframe or easing curve. The six keyframes below and
  `cubic-bezier(0.16, 1, 0.3, 1)` cover the whole surface.

---

## Motion (extends Components; carried in `.impeccable/design.json`)

Motion is a system, not per-component decoration, so it is recorded once here.

**The single hook.** `src/lib/useSequence.ts` drives every animated mock.
`useSequence(steps, { loop, restartDelay })` takes an array of per-phase
durations (observed range 180–2600ms; `restartDelay` 1100–4000ms) and returns
`{ phase, ref, reduced }`. Two helpers live beside it: `useCountUp(target,
duration, active)` — cubic ease-out (`1 - (1-p)³`) over 650–700ms for the
dollar counters — and `useTypewriter(text, cps, active)` at 22–58 characters
per second for the spreadsheet cells and the two chat messages.

**Pause offscreen.** The hook attaches an `IntersectionObserver` at
`threshold: 0.25` to its `ref` (spread onto the `MockFrame`). Offscreen, the
sequence stops; the remaining time in the current phase is banked and resumed on
return, so a mock never jump-cuts when it scrolls back into view.

**Reduced motion, twice.** The hook returns the last phase when
`prefers-reduced-motion: reduce` matches (mocks render fully populated, in their
end state — the live log shows a complete shift, the rule compiler shows a
compiled facility rule), and `index.css` independently sets `animation: none`,
`transition: none` on everything and disables smooth scrolling. Both layers are
required: the first guarantees a *complete* frame, the second guarantees a
*still* one.

**Keyframes** (all six defined in `src/index.css`, each with exactly one job):
- `row-in` (400ms, `cubic-bezier(0.16, 1, 0.3, 1)`, `both`) — 6px rise + fade for
  any newly arriving row, panel, message or ledger entry. The workhorse.
- `flip-in` (180ms, same easing) — `scaleY(0.6) → 1` when a status badge changes
  state in place (Processing → Clock-out missing, Checking → Held).
- `delta-fly` (700ms, same easing) — the corrected-dollar badge rises 48px and
  fades as it leaves the log toward the counters.
- `caret-blink` (1s, `steps(1, end)`, infinite) — the 1px typing caret in the
  spreadsheet cell and the message composer.
- `pulse-dot` (1.8s, `ease-in-out`, infinite) — the green live dot in a mock
  header; the only always-on animation.
- `shimmer` (1.6s, same easing, `both`) — a green sweep across the source rail
  when the agent ingests from many places at once.

**Easing.** `cubic-bezier(0.16, 1, 0.3, 1)` is the surface's one curve — for
keyframes, progress-bar fills, and the connector segments' `transition-transform`.
Colour and opacity changes use Tailwind's default 300ms transitions.
`tw-animate-css`'s `animate-in fade-in slide-in-from-bottom-2 duration-500`
handles the two mock tab-view swaps.
