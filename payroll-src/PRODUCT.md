# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: static Netlify site (publish dir = repo root) with per-route Vite + React + Tailwind apps built into committed subfolders (`job-src/ → job/`). The `/payroll` surface follows that pattern: `payroll-src/` (Vite + React + Tailwind v4 + shadcn, radix base) → `payroll/`. User-pinned for this surface: shadcn components for every product mock, real CSS animations, dummy data, no user interaction inside mocks.

## Users

- **Primary reader today:** HyperTrack teammates evaluating the payroll-ops hypothesis (internal pitch).
- **Buyer the page is written for:** CFO / CEO / Head of Payroll Ops at staffing firms of every shape — marketplace staffing vendors, staffing buyers (MSP / enterprise), and gig-work providers that run their own workforce without buying from marketplaces. They have an imperative to buy AI or be left behind, and foresight that manual payroll ops will go away even where it is not a burning problem today.
- **Operator the product serves:** the payroll operations person. Their day: spot discrepancies against a rulebook (legal, state, facility, contract, vertical, time-based, common-sense, week-to-week rules), chase humans for evidence, decide by a deadline, initiate payout, and move data between timekeeping, payroll and rules that all live in different systems — today via spreadsheets.

## Product Purpose

HyperTrack Payroll Ops is an AI agent for payroll operations in staffing and gig work. It ingests timesheets and location data from any source (API or browser), requests missing data from humans, spots every payroll discrepancy in real time, follows up until each one is resolved, and initiates payout — while quantifying, per shift, the dollars of underpayment and overpayment it corrected. Its goal is the payroll operator's goal: the business suffers no financial loss — not from overpayments, not from worker churn, not from mediation or legal blowback.

Success: a teammate (later a buyer) watches the page and believes the one-line claim — "spots every single payroll discrepancy in real time" — because they saw the agent catch one the instant a shift ended.

## Positioning

Not a general-purpose agent: a payroll-ops agent fine-tuned for staffing/gig work. The winning mechanism is accepting discrepancy rules in natural language from many sources and compiling them into a combination of deterministic and LLM-based checks (not "throw everything into a context window") — building the customer's confidence that the algorithm is intimately familiar with *their* workflow. Rules are malleable in real time: one sentence ("no overtime at this facility this week") becomes a time-bound deterministic rule. The agent gets smarter over time and never leaves; the context stays. Payroll superpowers, not a replacement for the payroll person.

Lineage: HyperTrack Closeout Copilot (payout reconciliation from customer systems, time tracking and location intelligence; "Chaos to Closeout in seconds").

## Operating Context

- Shift ends → timesheet arrives (ADP, Gusto, facility clock export, paper, QR, app) → discrepancy check → location evidence (geofence entry/exit) → rule check → outreach to worker / supervisor via SMS or email → decision by deadline → payout initiated → audit trail retained.
- Discrepancy types on record (`assignment/PROBLEM_CONTEXT.md`): missing clock-out, overtime authorization, no-show vs GPS failure, indoor GPS gaps, break disputes, facility clock malfunction / 8-hour cap, multi-site travel time, training-rate shifts, duplicate clock-ins, split shifts.
- Manual baseline: download facility reports (Excel/PDF), cross-reference app submissions, check GPS logs, read message threads, make a judgment call, enter approved time into payroll — 15–30 minutes per disputed shift.

## Capabilities and Constraints

- Real-time per-shift processing; two live metrics (underpayments corrected $, overpayments corrected $) with a transparent audit trail suited to agentic operators.
- Rulebook sources: legal, state-specific, facility, contract, vertical-specific, time-based, common-sense, week-to-week temporary rules.
- Deterministic + LLM checks compiled from natural-language rules; temporary rules expire automatically.
- Human-in-the-loop outreach and approvals; the agent initiates payout after the decision.
- Terminology: shift, timesheet, discrepancy, rule, evidence, outreach, decision, payout, underpayment, overpayment, audit trail.
- Undecided / not to be claimed: customers, benchmarks, integration list beyond what the site already names (ADP, Gusto, QuickBooks, Bullhorn, Workday, NetSuite), and any pricing beyond the published Payment Reconciliation $1/shift.

## Brand Commitments

- Name on this surface: **HyperTrack Payroll Ops**. Logo: `/logo-small.svg`, favicon `/favicon.svg`.
- Green `#22c55e` is the HyperTrack accent. Display face Space Grotesk, body Inter (project CLAUDE.md). This surface is **light** (user decision 2026-08-26), like the homepage, `/job`, and `/healthcare`.
- Voice: plain, specific, operator-literate; no hype; every mock labelled synthetic.

## Evidence on Hand

- Product research: `assignment/PROBLEM_CONTEXT.md`, `assignment/README.md` (discrepancy taxonomy, manual workflow, cost of errors).
- Synthetic demo narratives: `decks/ubeya/index.html` (policy sheet, missing-checkout story, "Review the 7, not all 240").
- Existing mock vocabulary: `pitch.html:332-560` (source tags, validated timesheet, payout boxes).
- Absent — do not fabricate: customer logos, testimonials, measured savings, case studies for this product.

## Product Principles

1. Prove the claim by showing a discrepancy caught the instant a shift ends; never just assert it.
2. Every dollar the agent reports is traceable to evidence and a rule.
3. Rules read the way an operator would say them; the system, not the operator, does the compiling.
4. Humans decide where policy requires it; the agent chases, prepares and executes.
5. The agent accumulates the customer's context and never leaves.

## Accessibility & Inclusion

Standard web accessibility: AA contrast on the light surface, visible keyboard focus on nav and CTAs, `prefers-reduced-motion` renders every mock in its final state, loops pause offscreen.
