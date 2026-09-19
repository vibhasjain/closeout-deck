// Render a story-style deck to a landscape PDF, one slide per 1280x720 page, pixel-identical to the web deck.
//   node retail/render-pdf.mjs [deckUrl] [out.pdf]
// Needs `playwright` (npm i -D playwright && npx playwright install chromium) and ImageMagick (`magick`) on PATH.
// Serve the repo root first so ../story and ../logos resolve:  python3 -m http.server 4177 --bind 127.0.0.1
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] || "http://127.0.0.1:4177/retail/";
const out = process.argv[3] || "retail.pdf";
const dir = mkdtempSync(join(tmpdir(), "deck-pdf-"));
const browser = await chromium.launch(); // headless
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })).newPage();
await page.route(/agent-keyboard\.fly\.dev/, r => r.abort()); // the edit widget is not part of the deck
await page.goto(url, { waitUntil: "networkidle" });
await page.addStyleTag({ content: ".nav, .counter { display:none !important; } * { transition:none !important; animation:none !important; }" });
const total = await page.locator(".slide").count();
const shots = [];
for (let i = 1; i <= total; i++) {
  await page.evaluate(n => { location.hash = "#" + n; }, i);
  await page.waitForFunction(n => document.querySelectorAll(".slide")[n - 1].classList.contains("is-active"), i);
  // every image on the active slide must be decoded before the shot
  await page.evaluate(async n => { await Promise.all([...document.querySelectorAll(".slide")[n - 1].querySelectorAll("img")].map(img => { img.loading = "eager"; return img.decode().catch(() => {}); })); }, i);
  await page.waitForTimeout(250);
  const file = join(dir, String(i).padStart(2, "0") + ".png");
  await page.screenshot({ path: file });
  shots.push(file);
}
await browser.close();
// 2560x1440 px at 144 dpi = 1280x720 pt pages
execFileSync("magick", [...shots, "-units", "PixelsPerInch", "-density", "144", "-quality", "88", "-compress", "jpeg", out]);
rmSync(dir, { recursive: true, force: true });
console.log(`${total} slides -> ${out}`);
