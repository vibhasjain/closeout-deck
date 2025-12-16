---
name: visual-asset-generator
description: Generate visual assets for the closeout deck using Gemini AI. Use this skill when the user wants to create new images, sprites, or graphics for the presentation that match the project's visual style.
---

# Visual Asset Generator

Generate visual assets for the HyperTrack Closeout Copilot presentation deck using AI image generation.

## When to Use

Invoke when user:
- Asks to "generate an image" or "create a visual" for the deck
- Wants new sprites, cards, or graphics
- Says "make an asset for slide X"
- Needs visuals that match the project's green-on-black holographic style

## Critical Rules (Lessons Learned)

1. **ONE image per asset** - Generate a single image. NO animation sprites or variants.

2. **Always use PURE BLACK backgrounds** - Explicitly request pure black (#000000). This makes transparency removal trivial.

3. **Keep scenes SIMPLE** - For card/UI assets, focus on 1-2 objects maximum. Complex scenes don't work well for smaller display sizes.

4. **Detailed prompts are CRITICAL** - The prompt determines everything. Be extremely specific about:
   - Pure black background (say it multiple times)
   - NO gray shading, NO fills, NO gradients on the objects
   - Green wireframe/stroke-only linework
   - What to AVOID

5. **Use ImageMagick for background removal** - Do NOT use rembg for wireframe art. It adds gray halos. Use:
   ```bash
   magick input.png -fuzz 20% -transparent black -trim +repage output.png
   ```

6. **Always trim whitespace** - Generated images often have padding. Trim it.

## Visual Style (from CLAUDE.md)

**Color Palette:**
- Background: Pure black (#000000)
- Line art: Bright green (#22c55e) and lighter variants
- Monochrome green on black only

**Art Style:**
- Isometric vector line art
- Technical/blueprint aesthetic
- Green wireframe/hologram rendering
- Stroke-only linework, NO solid fills, NO gray shading
- 3/4 isometric perspective
- Elements floating in space

**Mood:**
- Sci-fi, Matrix-inspired, cyberpunk
- High-tech command center aesthetic
- AI/automation feel

## Generation Workflow

### Step 1: Craft the Prompt

For card/UI assets (small display), use this structure:

```
Create an isometric 3D illustration on a PURE BLACK background (#000000).

SUBJECT: [Simple description - e.g., "a digital wallet with paper bills emerging"]

STYLE:
- Green glowing wireframe/hologram aesthetic
- Bright neon green (#22c55e) lines ONLY
- NO gray shading, NO solid fills, NO gradients
- Stroke-only linework
- Technical blueprint look
- Isometric 3/4 perspective

CRITICAL REQUIREMENTS:
- Background MUST be pure solid black - no gray, no gradients, no texture
- Only green wireframe lines on black
- No gray anywhere on the object

COMPOSITION:
- Simple, uncluttered - only 1-2 main objects
- Centered in frame

AVOID: Gray shading, solid fills, gradients, complex scenes, multiple objects, any color other than green on black
```

### Step 2: Generate Image

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="AIzaSyCeHHLv6NSnVYMx7fQueIaZt6swTLEe2tY")

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents="YOUR DETAILED PROMPT HERE",
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"]
    )
)

output_path = "/Users/vibes/Documents/GitHub/closeout-deck/NEW_ASSET_NAME.png"

for part in response.candidates[0].content.parts:
    if part.inline_data:
        with open(output_path, 'wb') as f:
            f.write(part.inline_data.data)
        print(f"Generated: {output_path}")
        break
```

### Step 3: Post-Process with ImageMagick

**IMPORTANT:** Use ImageMagick, NOT rembg for wireframe art.

```bash
# Remove black background + trim whitespace (one command)
magick input.png -fuzz 20% -transparent black -trim +repage output.png
```

This single command:
- Makes black pixels transparent
- Trims whitespace around the subject
- Outputs clean PNG with transparency

### Step 4: Verify Result

Use the Read tool to view the image and ensure:
- Background is fully transparent
- No gray artifacts or halos
- Subject is properly cropped

If there are issues, adjust the `-fuzz` percentage:
- Lower (10-15%): More precise, keeps dark details
- Higher (25-30%): More aggressive, removes more dark pixels

## Example: Complete Card Asset Generation

```python
from google import genai
from google.genai import types
import subprocess

client = genai.Client(api_key="AIzaSyCeHHLv6NSnVYMx7fQueIaZt6swTLEe2tY")

prompt = """
Isometric 3D wallet with money bills and coins on PURE BLACK background.
Green glowing wireframe style, neon green (#22c55e) outlines only.
No shading, no gray fills. Just green lines on solid black.
Simple composition - wallet and 2-3 floating bills only.
Matrix/cyberpunk hologram aesthetic.
"""

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=prompt,
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"]
    )
)

# Save raw
raw_path = "/Users/vibes/Documents/GitHub/closeout-deck/asset-raw.png"
for part in response.candidates[0].content.parts:
    if part.inline_data:
        with open(raw_path, 'wb') as f:
            f.write(part.inline_data.data)
        break

# Post-process with ImageMagick
final_path = "/Users/vibes/Documents/GitHub/closeout-deck/card-payout-1.png"
subprocess.run([
    "magick", raw_path,
    "-fuzz", "20%", "-transparent", "black",
    "-trim", "+repage",
    final_path
])

# Clean up
subprocess.run(["rm", raw_path])
print(f"Final asset: {final_path}")
```

## Common Mistakes to Avoid

| Mistake | Solution |
|---------|----------|
| Using rembg for wireframe art | Use ImageMagick `-transparent black` |
| Complex scenes with many objects | Keep it simple: 1-2 objects max |
| Vague prompts | Be extremely specific, say "pure black" multiple times |
| Gray shading on objects | Explicitly say "NO gray shading, NO fills" |
| Forgetting to trim whitespace | Always use `-trim +repage` |
| Creating animation sprites | Generate ONE image only |
| Not verifying the result | Always Read the image to check |

## Asset Types

### Card Images (Most Common)
- Format: PNG with transparency
- Style: Single focused element (1-2 objects)
- Post-process: ImageMagick `-transparent black -trim`
- Display size: ~180-220px in the UI

### Hero Sprites
- Format: JPEG (no transparency needed)
- Style: Can be more complex holographic scene
- Size: Large, full-width display

## Post-Generation Checklist

- [ ] Single image generated (not multiple variants)
- [ ] Pure black background in raw output
- [ ] Processed with ImageMagick (not rembg)
- [ ] Whitespace trimmed
- [ ] Background fully transparent
- [ ] No gray halos or artifacts
- [ ] File placed in project directory with correct name
