# Protect your revenue — middle-office storyboard deck

Thirty slides: nineteen storyboard frames, two data beats, eight product component screenshots, and a close. Narrative: tech-enabled staffing firms deploy AI faster; AI has done recruiting and matching, the middle office (pay and bill) is next; workers and customers both re-choose you every day, so pay accuracy is revenue protection (frames 01–12). Then the payroll-ops AI story: two questions per shift, three sources that disagree, the rulebook in people's heads, compile it once, the agent asks the worker, humans handle only what needs a human, every decision shows its work (frames 13–19). Then the product, as components rather than full screens: Connect, Shift X-Ray timeline, Reconcile sheet and discrepancies, the rule-and-source drawer, Rules, the claimed/adjusted/final cards, the pay run, and the closeout report tiles (slides 22–29).

Live at https://closeoutcopilot.com/story/. Locally, serve from the repo root so the shared logo and hero sprites load:

```bash
cd /Users/vibes/Documents/closeout-deck && python3 -m http.server 4177 --bind 127.0.0.1
```

Open http://127.0.0.1:4177/story/ — keys: arrows / space / backspace, Home / End, `F` fullscreen, `#N` deep links.

## Images

All nineteen illustrated frames were generated with the Codex CLI built-in image generation tool (session driven by `gpt-6-astra`, reasoning effort ultra) from `STORYBOARD.md`, one shared STYLE block plus a per-frame SCENE. Originals in `assets/raw/*.png` (see `assets/raw/manifest.md` for the `~/.codex/generated_images` provenance); deck copies are 1920-wide JPEGs at quality 70 in `assets/`.

## Product screenshots

The `assets/ui-*.jpg` components were captured headlessly from this repo's own pages at 1440×900 rendered at 2× (`/bench` Payroll Desk tabs and `/xray` Shift X-Ray) and cropped to the component, not the full screen. All figures on them are synthetic fixtures; the Reports numbers cite their sources inside the product.
