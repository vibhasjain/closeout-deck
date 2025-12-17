---
name: visual-asset-generator
description: Generate visual assets for the closeout deck using Gemini AI. Use this skill when the user wants to create new images or graphics for the presentation that match the project's visual style.
---

# Visual Asset Generator

Generate visual assets for the HyperTrack Closeout Copilot presentation deck using AI image generation.

## When to Use

Invoke when user:
- Asks to "generate an image" or "create a visual" for the deck
- Wants new cards or graphics
- Says "make an asset for slide X"
- Needs visuals that match the project's green-on-black holographic style

## Critical Rules (Lessons Learned)

1. **CHECK THE HTML FIRST** - Before generating any asset:
   - Read the HTML to find the EXACT filename being used
   - Check which slide the asset belongs to
   - Verify you're replacing the correct file
   - If adding NEW images to cards that don't have them, you'll need to update both HTML and CSS

2. **USE A REFERENCE IMAGE** - Always use an existing good asset as a reference:
   - `card-location-intel-1.png` is a good reference for card assets
   - Pass it to Gemini along with your prompt for style consistency
   - This produces MUCH better results than describing style in text alone

3. **ONE image per asset** - Generate a single image only. Never generate sprite variants or animation frames.

4. **Always use PURE BLACK backgrounds** - Explicitly request pure black (#000000). This makes transparency removal trivial.

5. **Include GRID FLOOR for consistency** - Most card assets use an isometric grid floor. Include it for visual cohesion.

6. **Keep scenes SIMPLE** - For card/UI assets, focus on 1-2 objects maximum. Complex scenes don't work at small display sizes.

7. **THREE-STEP POST-PROCESSING** - The order matters:
   ```bash
   # Step 1: Remove black background and trim (preserve full transparency)
   magick input.png -fuzz 20% -transparent black -trim +repage output.png

   # Step 2: If white background appears, remove it too
   magick output.png -fuzz 10% -transparent white output.png

   # Step 3: OPTIMIZE with PNG8 (do this LAST, after transparency is done)
   magick output.png -colors 64 PNG8:output.png
   ```
   **CRITICAL:** PNG8 must come AFTER transparency removal, not during. Using PNG8 during transparency breaks alpha channels.

8. **VERIFY TRANSPARENCY WORKS** - After processing:
   - View the image with Read tool
   - If background appears white in the viewer, it may still be transparent
   - The real test is how it looks on the actual page with dark background

9. **Detailed prompts are CRITICAL** - Be extremely specific about:
   - Pure black background (say it multiple times)
   - NO gray shading, NO fills, NO gradients on the objects
   - Green wireframe/stroke-only linework
   - Grid floor for consistency
   - What to AVOID

## Visual Style (HyperTrack Brand)

**Color Palette:**
- Background: Pure black (#000000)
- Line art: Bright green (#22c55e) - this is the exact HyperTrack brand green
- Monochrome green on black only

**Art Style:**
- Isometric vector line art
- Technical/blueprint aesthetic
- Green wireframe/hologram rendering
- Stroke-only linework, NO solid fills, NO gray shading
- 3/4 isometric perspective
- Grid floor underneath objects (for consistency across cards)

**Mood:**
- Sci-fi, Matrix-inspired, cyberpunk
- High-tech command center aesthetic
- AI/automation feel

## Generation Workflow

### Step 0: Check the HTML (CRITICAL)

Before generating anything:
```bash
# Find which file the HTML actually references
grep -n "card-name\|img src" index.html | grep "slide-section-name"
```

Verify:
- The exact filename being used
- Whether cards already have image containers or need them added
- The slide number and context

### Step 1: Generate with Reference Image (RECOMMENDED)

Always use an existing good asset as reference for consistent style:

```python
from google import genai
from google.genai import types
from pathlib import Path

client = genai.Client(api_key="AIzaSyCeHHLv6NSnVYMx7fQueIaZt6swTLEe2tY")

# Load a good reference image
ref_path = Path("/Users/vibes/Documents/GitHub/closeout-deck/card-location-intel-1.png")
ref_data = ref_path.read_bytes()

prompt = """
Create a new illustration matching EXACTLY this visual style - same green color (#22c55e), same line weight, same grid floor style, same clean wireframe aesthetic.

SUBJECT: [Describe the subject - e.g., "scattered papers and clipboard with question marks"]

REQUIREMENTS:
- Match the reference image style EXACTLY
- Same thin green wireframe lines
- Same isometric grid floor
- Same pure black background (#000000)
- NO gray shading, NO fills
- Simple, clean, minimal
- Isometric 3/4 view
"""

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[
        types.Part.from_bytes(data=ref_data, mime_type="image/png"),
        prompt
    ],
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"]
    )
)

# Save raw image
for part in response.candidates[0].content.parts:
    if part.inline_data:
        with open("/Users/vibes/Documents/GitHub/closeout-deck/asset-raw.png", 'wb') as f:
            f.write(part.inline_data.data)
        print("Generated image")
        break
```

### Step 2: Post-Process (Three-Step: Transparency → Optimize)

```bash
# Step 1: Remove black background + trim (keeps full alpha channel)
magick asset-raw.png -fuzz 20% -transparent black -trim +repage asset-final.png

# Step 2: Check for and remove any white background that appeared
magick asset-final.png -fuzz 10% -transparent white asset-final.png

# Step 3: OPTIMIZE with PNG8 (reduces file size from ~1MB to ~100KB)
magick asset-final.png -colors 64 PNG8:asset-final.png

# Step 4: Clean up raw file
rm asset-raw.png
```

**CRITICAL:** PNG8 must come AFTER transparency removal. Using PNG8 during transparency breaks alpha channels.

### Step 3: Verify Result

Use the Read tool to view the image:
- Check that the artwork looks correct
- File size should be reasonable (under 150KB typically)
- If transparency seems broken on the page, re-run the white background removal

### Step 4: Update HTML/CSS if Adding New Images

If you're adding images to cards that didn't have them before:

**Add image container to HTML:**
```html
<div class="card-type__image">
    <img src="card-name-1.png" alt="" class="card-type__img">
</div>
```

**Add CSS for the image container (match existing card styles):**
```css
.card-type__image {
    position: relative;
    width: calc(100% + 3rem);
    margin: -1.5rem -1.5rem 1rem -1.5rem;
    height: 200px;
    overflow: hidden;
    border-radius: 11px 11px 0 0;
    filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.4));
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 1.5rem;
}

.card-type__img {
    height: 85%;
    width: auto;
    object-fit: contain;
}
```

**Update card styling to match other cards (green glow, hover):**
```css
.card-type {
    background: linear-gradient(145deg, rgba(34, 197, 94, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%);
    border: 1px solid rgba(34, 197, 94, 0.25);
    /* ... existing styles ... */
}

.card-type::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 0%, rgba(34, 197, 94, 0.15) 0%, transparent 60%);
    pointer-events: none;
    border-radius: 12px;
}

.card-type:hover {
    transform: translateY(-4px);
    border-color: rgba(34, 197, 94, 0.5);
    box-shadow: 0 0 40px rgba(34, 197, 94, 0.15);
}
```

## Complete Example: Adding Images to New Card Type

```python
from google import genai
from google.genai import types
from pathlib import Path

client = genai.Client(api_key="AIzaSyCeHHLv6NSnVYMx7fQueIaZt6swTLEe2tY")

# Load reference
ref_path = Path("/Users/vibes/Documents/GitHub/closeout-deck/card-location-intel-1.png")
ref_data = ref_path.read_bytes()

# Generate image
prompt = """
Create a new illustration matching EXACTLY this visual style - same green color (#22c55e), same line weight, same grid floor style, same clean wireframe aesthetic.

SUBJECT: A shield with a checkmark inside - representing validation and trust

REQUIREMENTS:
- Match the reference image style EXACTLY
- Same thin green wireframe lines
- Same isometric grid floor
- Same pure black background (#000000)
- NO gray shading, NO fills
- Simple, clean, minimal
- Isometric 3/4 view
"""

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[
        types.Part.from_bytes(data=ref_data, mime_type="image/png"),
        prompt
    ],
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"]
    )
)

for part in response.candidates[0].content.parts:
    if part.inline_data:
        with open("/Users/vibes/Documents/GitHub/closeout-deck/card-promise-raw.png", 'wb') as f:
            f.write(part.inline_data.data)
        break
```

Then post-process:
```bash
# Three-step: transparency first, then optimize
magick card-promise-raw.png -fuzz 20% -transparent black -trim +repage card-promise-1.png
magick card-promise-1.png -fuzz 10% -transparent white card-promise-1.png
magick card-promise-1.png -colors 64 PNG8:card-promise-1.png
rm card-promise-raw.png
```

## Common Mistakes to Avoid

| Mistake | Solution |
|---------|----------|
| Not using reference image | ALWAYS pass a good existing asset as reference to Gemini |
| PNG8 during transparency step | PNG8 breaks transparency - use PNG8 AFTER transparency removal |
| Skipping PNG8 optimization | Files will be ~1MB. Always run PNG8 as final step for ~100KB files |
| Only removing black background | Also check for and remove white: `-transparent white` |
| Not checking HTML first | Always grep HTML for exact filename before generating |
| Generating without reference | Reference images produce much more consistent results |
| Complex scenes | Keep it simple: 1-2 objects max |
| Forgetting to update CSS | New image containers need matching card styles (glow, hover) |
| Wrong green color | Always specify exact hex: #22c55e |

## Post-Generation Checklist

- [ ] Checked HTML for exact filename (or planned new filename)
- [ ] Used reference image for style consistency
- [ ] Single image generated (no variants)
- [ ] Pure black background in raw output
- [ ] Grid floor included (for card consistency)
- [ ] Transparency removal (black then white)
- [ ] PNG8 optimization applied AFTER transparency (file ~100KB not ~1MB)
- [ ] Whitespace trimmed
- [ ] Background fully transparent on page
- [ ] Correct green color (#22c55e)
- [ ] File saved with correct name
- [ ] HTML updated with image container (if new)
- [ ] CSS updated with card styling (if new card type)
