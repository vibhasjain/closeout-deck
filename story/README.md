# Protect your revenue — middle-office storyboard deck

Seventeen slides, all illustrated storyboard frames in one language. No UI screenshots, no close slide. Narrative: tech-enabled staffing firms deploy AI faster; AI has done recruiting and matching, the middle office (pay and bill) is next; workers and customers both re-choose you every day, so pay accuracy is revenue protection (frames 01–12). Then the product story in six beats (slides 11–17): data auto-ingests with a digital worker in a virtual browser (real vendor tiles from `logos/tiles/` overlaid), location tracked in real time, paper timesheets and clock-ins by SMS and phone call, every source collated and compared on one timeline, payroll rules applied (flag → clause → compiled rule), discrepancies mediated agentically, then uploaded to payroll agentically through the browser. 

Live at https://closeoutcopilot.com/story/. Locally, serve from the repo root so the shared logo and hero sprites load:

```bash
cd /Users/vibes/Documents/closeout-deck && python3 -m http.server 4177 --bind 127.0.0.1
```

Open http://127.0.0.1:4177/story/ — keys: arrows / space / backspace, Home / End, `F` fullscreen, `#N` deep links.

## Images

All frames were generated with the Codex CLI built-in image generation tool (session driven by `gpt-6-astra`, reasoning effort ultra) from `STORYBOARD.md`, one shared STYLE block plus a per-frame SCENE. Originals in `assets/raw/*.png` (see `assets/raw/manifest.md` for the `~/.codex/generated_images` provenance); deck copies are 1920-wide JPEGs at quality 70 in `assets/`.

