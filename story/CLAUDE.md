# /story — the "Protect your revenue" storyboard deck

Read this before touching anything in `story/`. It is the full context for extending or editing the deck: what it is, the illustration language, how a slide is built, how frames get generated, and the rules the owner has laid down in review. Live at https://closeoutcopilot.com/story/ (Netlify deploys on push to `main`).

## What it is

An 18-slide storyboard for staffing C-suite (healthcare and light industrial). Every slide is one illustrated frame plus a caption. No UI screenshots, no logos inside the art, no closing "tagline" slide. Structure:

1. **Business story (slides 01–09).** Tech-enabled staffing firms deploy AI faster; AI already did recruiting and matching, the middle office (pay and bill) is next; workers trust a platform that pays right; pay wrong and the door revolves; every day workers choose you on their phone and customers choose you on the VMS; if you don't pay as well as the new guys the flywheel reverses.
2. **Bridge (slide 10)** "Here's how HyperTrack solves this end to end, with AI at every step." One assembly line, a wireframe agent at every station.
3. **Product story (slides 11–17).** Schedules and timesheets auto-ingest (digital worker in a virtual browser) → location tracked in real time → paper timesheets and clock-ins by SMS and phone call → every source collated and compared on one timeline → payroll rules applied (flag → clause → compiled rule) → discrepancies mediated agentically → uploaded to payroll agentically through the browser.
4. **Close (slide 18).** "Revenue protection and worker retention are two sides of the same coin." The coin frame ends the deck (owner moved it here via Agent Keyboard); it is the only closing slide allowed.

The owner's script for the business story and the product beats is what the captions paraphrase. Keep captions in that voice: short, direct, second person, concrete.

## Files

| Path | What |
|---|---|
| `index.html` | The deck. One `<section class="slide">` per slide, in order. Header counter reads `#tot`. |
| `deck.css` | Layout. `--block: 1100px` is the shared width of the caption text block and the frame. Frames fill that width and crop with `object-fit: cover`; caption heights vary and that is intended. `.logos` is the vendor-tile strip overlaid on a frame. |
| `deck.js` | Keyboard/hash/touch navigation on desktop; on phones (≤700px) the deck is one continuous scroll with no counter or arrows. Counts slides itself. Marks a frame `.is-missing` (dashed "GENERATING" placeholder) if its image 404s, so a slide can ship before its art exists. |
| `STORYBOARD.md` | The STYLE block and one SCENE paragraph per frame. Every generated frame's prompt is STYLE + SCENE, verbatim. Add new scenes here first. |
| `assets/NN-slug.jpg` | Deck frames, 1920×1080 JPEG q70, ~400–600 KB. |
| `assets/m/NN-slug.jpg` | Phone variants, 960×540 JPEG, ~60–85 KB, served via `<picture>` under 700px. `compress.sh` makes both. |
| `assets/raw/NN-slug.png` | Originals from the image model. Never edit; re-crop from these. |
| `assets/raw/compress.sh` | raw PNG → `assets/*.jpg`. Run after any new PNG lands. |
| `assets/raw/manifest.md` | Provenance: frame → original path under `~/.codex/generated_images` → retry note. |
| `og-image.jpg` | 1200×630 crop of frame 01 for link previews. |
| `../logos/tiles/*.png` | 64×64 vendor icon tiles (ukg, adp, ubeya, 7shifts, paylocity, deputy, tempworks, avionte, rippling, wheniwork, gusto, paychex, quickbooks, …). Real brand marks come ONLY from here, never from the image model. |

Frames on disk that are not currently in the deck (cut in review, kept for reuse): `03-already-matched`, `08-left-hanging`, `12-real-time`, `13-two-questions`, `14-three-clocks`, `15-rulebook-in-heads`, `16-compile`, `18-human-queue`, `19-receipt`.

## The illustration language (do not drift)

Every frame uses the STYLE block at the top of `STORYBOARD.md`, verbatim: 16:9 storyboard panel, editorial graphic-novel illustration, black ink linework, flat cel shading, paper grain; palette limited to charcoal `#141416`, cream `#efe9dc`, cool slate, and exactly one signal colour, HyperTrack green `#22c55e`, used only on the single most important element in the frame; cinematic depth; realistic adult proportions; American logistics, hospitality and healthcare workplaces; lots of environmental detail. No text, letters, numbers, logos or watermarks in the art (the one sanctioned exception is the chalkboard rule in frame 21). Not 3D, not clay, not chibi, not photoreal.

Recurring motifs you can reuse so new frames feel like the same film: the translucent green **wireframe figure/hands** = the agent or digital worker; **holographic browser windows** with blank forms; **punched shift cards on a conveyor**; a **lightbox** for comparing sources; the **letterpress stamp** for rules; **abstract SMS bubbles** with no words; **geofence rings with tick marks** for location; a **metronome or stopwatch** for cadence/speed.

Writing a new SCENE: one paragraph, 80–140 words, concrete nouns, say where the camera is, name what is green and say "only X is green", list background details so the frame is dense, and say what the single idea of the frame is through the objects, not through text.

## Slide anatomy

```html
<section class="slide">
  <figure class="frame" data-label="NN-slug"><picture><source media="(max-width:700px)" srcset="assets/m/NN-slug.jpg"><img src="assets/NN-slug.jpg" alt="One-sentence description of the scene" loading="lazy" decoding="async"></picture></figure>
  <div class="copy">
    <p class="eyebrow">12 · Product</p>
    <h1>Headline, one sentence, ends with a period.</h1>
    <p>Two or three short sentences in the owner's voice.</p>
  </div>
</section>
```

Optional vendor strip inside the figure, after the `</picture>`:

```html
<div class="logos"><img src="../logos/tiles/ukg.png" alt="ukg"><img src="../logos/tiles/adp.png" alt="adp"></div>
```

Eyebrows are numbered sequentially in document order (`01 · …` through `09 · …`, then `10 · …`). Business-story eyebrows are short section names; product-story eyebrows are `N · Product`. After adding, removing or reordering, renumber every eyebrow and set `<span id="tot">` to the new count. `data-label` is the frame's file slug and does not change with position.

## Adding a frame

1. Append a `### NN · slug — "Headline"` entry with a SCENE paragraph to `STORYBOARD.md`. Use the next unused NN (currently 27).
2. Generate the image with the Codex CLI's built-in image generation: one `codex exec` session per frame, in parallel, effort ultra; confirm `reasoning effort: ultra` in the log header before trusting the run:
   ```bash
   cat > story/assets/raw/brief-NN.md <<'EOF'
   You are an image-generation operator. Produce ONE storyboard frame with your built-in image generation tool and save it into this repo. Do not edit any other file. Do not open a browser. Do not commit.
   Read story/STORYBOARD.md. Build the prompt as: the full STYLE block verbatim, a blank line, then the SCENE paragraph for frame "NN · slug" verbatim.
   1. Call the image generation tool with that prompt (landscape 16:9, highest quality available).
   2. The tool saves a PNG under ~/.codex/generated_images/<thread-id>/. Copy it to story/assets/raw/NN-slug.png.
   3. View it once. If it contains readable text, letters, numbers, logos, a watermark, or is 3D/photoreal instead of ink-and-cel illustration, regenerate ONCE with "no text of any kind" strengthened and overwrite the file. Accept the second attempt regardless.
   4. Append one line to story/assets/raw/manifest.md: `NN-slug.png | <original path> | <retry note or none>`.
   Retry transient errors. Finish with the line FRAME NN DONE.
   EOF
   codex exec -m gpt-6-astra -c model_reasoning_effort=ultra -c service_tier=fast -s workspace-write -C <repo root> - < story/assets/raw/brief-NN.md
   ```
   Then `story/assets/raw/compress.sh` and delete the brief file.
   `codex` is installed on the Agent Keyboard server too (its `~/.codex/config.toml` is seeded with gpt-6-astra / ultra / fast / full access, login lives on the volume), so run the command there exactly as above; one frame takes 2–4 minutes. Run several frames as parallel sessions, never one long session. If `magick` and `sips` are both missing, `compress.sh` falls back to Pillow: `pip3 install --user pillow` once.
   Only if generation genuinely cannot run: still write the SCENE, insert the slide with its `<img src="assets/NN-slug.jpg">`, push. The deck shows a dashed "GENERATING · NN-slug" placeholder for that slide until someone runs the command. Say so plainly in your reply and paste the exact command.
3. Insert the `<section>` in the right place (a new product beat goes inside slides 11–17 in pipeline order; the coin stays last), renumber eyebrows, update `#tot`, bump the `?v=` on `deck.css`/`deck.js` links if you changed them.
4. Check before pushing: every `assets/*.jpg` referenced in `index.html` exists (or is knowingly a placeholder), section count equals `#tot`, every eyebrow number is sequential, no slide repeats a point an earlier slide already made.

## Rules from the owner's reviews (binding)

- **Illustration only.** No product screenshots, no UI crops, even to show the product; abstract the product into the same language (digital worker at a browser, lightbox, stamp, chalkboard).
- **One point, one frame.** If a headline restates an earlier slide, cut it. The deck was trimmed from 30 to 18 for this reason.
- **No generic close slide.** No sprite/tagline ending. The coin frame is the close; nothing goes after it.
- **Headlines must be picturable.** "Every punch beside every other source" was rejected as meaningless. Say the concrete thing.
- **Word choices:** "the nature of staffing" (not "flex work"); "pay workers as well as the new guys" (not "excellently"); "Schedules and timesheets auto-ingest" (not "Data auto-ingests").
- **Frames are full text-block width and crop to fill.** Do not letterbox or shrink frames to equalise heights.
- **Brand marks** are the overlaid `logos/tiles` strip, uniform 32px tiles in full brand colour. Never grayscale, never wordmarks, never model-drawn logos.
- **Product story order is fixed** (ingest → location → SMS/phone timekeeping → collate and compare → rules → mediation → upload). A new product beat goes where it belongs in that pipeline.
- **Don't commit unrelated dirty files** in the repo root; stage `story/` only.

## Serving locally

```bash
python3 -m http.server 4177 --bind 127.0.0.1   # from the repo root, so ../logos and ../logo-small.svg resolve
# http://127.0.0.1:4177/story/#12
```
