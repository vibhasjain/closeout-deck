# Project Guidelines

## Workflow Preferences
- **Do NOT open browser** - User checks changes themselves
- **Do NOT commit to git** - User will tell you when to commit

## Asset Optimization
- **Always optimize images/videos** for smallest file size possible to ensure fast page loads
- Compress JPEGs to ~70% quality
- Use appropriate formats (JPEG for photos, SVG for icons/logos, PNG only when transparency needed)

## Site layout (Sep 25 2026 rebuild)
- The public site is assembled into `dist/` by `scripts/assemble-dist.sh` from an explicit whitelist; `netlify.toml` publishes only `dist/`. Repo docs (this file, `tasks/*.md`, `customer-discovery.md`) are private. Add new public paths to the whitelist.
- `/` is the landing page (being ported from the hypertrack.com homepage; product page at `/closeout`).
- `/product` is the Closeout agent app (`product-src/`, Vite + React). Its backend is the Fly app `closeout-agent` (`product-src/server/`, Claude Code CLI), with data in Supabase project `alzxujpjpfqmoqplwfbh`. Plan: `~/.claude/plans/okay-huge-message-incoming-flickering-clock.md`.
- `/answers` (owned by Ashish right now, don't touch) and `/job` are kept as they are. `/story` came back on Sep 25 2026 (see below). Everything else was retired on Sep 25 2026 and 301s to `/` or `/product`.
- Shared `main`: Ashish and Agent Keyboard push concurrently. Commit explicit paths only, and pull --rebase before every push.
- **Agent Keyboard widget lives on `/answers`, `/job` and `/story` only.** Never add it to `/`, `/closeout` or `/product`. `/story` uses `data-site="closeout"` (this repo); `/answers` and `/job` use `closeout-jobs` (the private worker repo).
- **One sign-in across `/product`, `/answers` and `/job`:** `/shared/session.js` exchanges the Google credential with both backends (AgKB `closeout-jobs` → `job:viewer-session:v1`, `closeout-agent` → `closeout:session:v1`) and clears both on sign-out. `/story`, `/` and `/closeout` stay public.

## /story deck
- `story/` is the illustrated storyboard deck at closeoutcopilot.com/story. Before editing anything in it, read `story/CLAUDE.md`: it holds the illustration language, the slide anatomy, the Codex image-generation command, and the owner's binding review rules.

## Project Info
- Landing page + Closeout agent app for HyperTrack Closeout Copilot
- The app and newer pages are light (see memory payroll-page-light-theme); the dark green deck styling below is legacy
- Uses Space Grotesk for display, Inter for body text

---

## Product Understanding

**HyperTrack Closeout Copilot** is an AI-powered payout reconciliation system for staffing companies.

### The Problem
Staffing companies must answer two questions for every shift:
- **Payout:** How much do I pay the worker?
- **Billing:** How much do I invoice the customer?

Time & Attendance data comes from 3 conflicting sources:
1. **Customer Systems** - Hardware at facilities, QR codes, paper clipboards (customer-controlled, often paper-based)
2. **Time Tracking** - Web/app-based clocking from MSP or staffing company (often unreliable, self-reported)
3. **Location Intelligence** - Background GPS and geofencing (the ground truth of where workers actually were)

All data arrives at different times. Manual reconciliation is slow, error-prone, and unscalable.

### The Solution
AI copilot that:
- Ingests data from all sources
- Cross-references and validates with AI
- Provides validated timesheets with confidence scores
- Recommends payouts with approval workflows
- Connects to billing and payout systems

**Tagline:** "Chaos to Closeout in Seconds" — $1 per shift

---

## Visual Language

### Hero Image Style (hero-sprite-1.jpg / hero-sprite-2.jpg)

**Color Palette:**
- Background: Pure black (#000000) or dark gray (#161618)
- Line art: Bright green (#22c55e) and lighter variants
- No other colors - monochrome green on black

**Art Style:**
- Isometric vector line art
- Technical/blueprint aesthetic
- Green wireframe/hologram rendering
- Stroke-only linework, no solid fills
- 3/4 isometric perspective
- Elements floating in space

**Common Elements:**
- Floating holographic UI panels
- Data dashboards and charts
- Technical grid patterns
- Network connection lines
- Data stream visualizations

**Mood:**
- Sci-fi, Matrix-inspired, cyberpunk
- High-tech command center aesthetic
- AI/automation feel

### Sprite Animation Technique
- Two nearly-identical images with subtle differences
- Differences include: position shifts, glowing/pulsing elements, content changes

- Creates flickering "blinking neon" effect without heavy video
- Uses CSS animation with `step-end` timing for instant switching
