# Closeout Copilot Scroll World

A five-scene Scroll World landing-page experiment for Closeout Copilot.

The page is deliberately about the human closeout system—not a feature tour:

1. **The worker** finished the shift and needs correct, timely pay.
2. **The staffing agency** must keep two promises: worker payroll and customer billing.
3. **The operations team** should not be manual glue between clocks, people, systems, and policy.
4. **The Closeout Agent** gathers missing facts, applies the rulebook, resolves what it can, and shows its work.
5. **The settled shift** lets the worker, agency, and ops team move forward with evidence behind the decision.

## Run locally

From the repository root:

```bash
cd /Users/vibes/Documents/closeout-deck
python3 -m http.server 4177
```

Open:

```text
http://localhost:4177/decks/closeout-scroll-world/
```

The final CTA opens the existing local Shift X-Ray at `/xray/`.

## Generated media

The experiment ships with a complete generated set:

- five 16:9 stills generated with `gemini-3-pro-image` at its 4K output setting (5504×3072 returned by the API)
- five 10-second image-to-video clips generated with `gemini-omni-flash-preview` (1280×720, 24 fps)
- WebP stills and H.264 fast-start video encodes under `assets/`

The art direction in [SCENE-BRIEF.md](SCENE-BRIEF.md) uses near-photoreal cinematic architectural dioramas: realistic adult proportions, believable spatial scale, restrained enterprise styling, and cinematic light. No clay, toy, chibi, mascot, or cartoon treatment.

## Experiment pipeline

1. Generate all five stills at 4K and 16:9 with Gemini 3 Pro Image.
2. Review cast, scale, architecture, camera language, light, color, and editorial copy space as one set.
3. Generate one 10-second image-anchored camera move per approved still with Gemini Omni Flash Preview.
4. Encode each result for scrub playback with H.264, short GOPs, `yuv420p`, and fast-start metadata.
5. Crossfade between the five independent scenes at chapter handoffs.

Omni Flash Preview does not currently accept a locked final frame for interpolation, so this version does not claim to be a true frame-matched connector chain. A future connector pass should use a model that supports exact first-and-last-frame conditioning.

## Product truth guardrails

- Closeout Copilot takes a completed shift toward a payable/billable state; it does not itself become the customer’s payroll or invoicing system.
- Location is supporting evidence, not proof of payable work by itself.
- The agent resolves routine cases and escalates genuine exceptions; it does not imply zero human review.
- Every meaningful decision should retain sources, policy, reasoning, and human follow-up.
- The outcome is faster, correct worker pay; evidence-backed agency billing; and operations focused on real exceptions.

## Files

- `index.html` — story structure and generated media
- `styles.css` — local presentation and responsive fallback
- `scroll-world.js` — config-free scroll mapping, video scrubbing, chapter navigation, and reduced-motion handling
- `SCENE-BRIEF.md` — 4K still and camera-generation brief
- `assets/` — generated stills and optimized video clips

## Mobile decision

The current page degrades safely on a phone, but final mobile-optimized video encodes are intentionally undecided. Scroll World mobile support is beta: it uses lighter encodes and decoder hardening, while portrait crops the 16:9 scenes and low-end devices may still stutter.
