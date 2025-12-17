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
   - Read the HTML to find the EXACT filename being used (e.g., `card-location-intel-1.png` not `card-location-1.png`)
   - Check which slide the asset belongs to
   - Verify you're replacing the correct file

2. **ONE image per asset** - Generate a single image only. Never generate sprite variants or animation frames.

3. **Always use PURE BLACK backgrounds** - Explicitly request pure black (#000000). This makes transparency removal trivial.

4. **Include GRID FLOOR for consistency** - Most card assets in this deck use an isometric grid floor. Include it for visual cohesion unless specifically told otherwise.

5. **Keep scenes SIMPLE** - For card/UI assets, focus on 1-2 objects maximum. Complex scenes don't work well for smaller display sizes.

6. **OPTIMIZE FILE SIZE** - After generating, always optimize PNGs:
   ```bash
   magick input.png -colors 64 PNG8:output.png
   ```
   This typically reduces file size by 90% (e.g., 900KB -> 50KB).

7. **Detailed prompts are CRITICAL** - Be extremely specific about:
   - Pure black background (say it multiple times)
   - NO gray shading, NO fills, NO gradients on the objects
   - Green wireframe/stroke-only linework
   - Grid floor for consistency
   - What to AVOID

8. **Use ImageMagick for background removal** - Do NOT use rembg for wireframe art. It adds gray halos. Use:
   ```bash
   magick input.png -fuzz 20% -transparent black -trim +repage output.png
   ```

9. **DESCRIBE style in prompt, don't rely on reference images** - Passing multiple reference images can cause grid/mosaic artifacts.

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
grep -n "slide-name\|card-name" index.html
```

Verify:
- The exact filename being used
- Whether it's a single image or needs sprites (usually single now)
- The slide number and context

### Step 1: Craft the Prompt

For card/UI assets (small display), use this structure:

```
Create an isometric 3D illustration on a PURE BLACK background (#000000).

SUBJECT: [Simple description - e.g., "a smartphone with GPS signals radiating outward"]

STYLE:
- Green glowing wireframe/hologram aesthetic
- Bright neon green (#22c55e) lines ONLY
- NO gray shading, NO solid fills, NO gradients
- Stroke-only linework
- Technical blueprint look
- Isometric 3/4 perspective
- Grid floor underneath the object for grounding

CRITICAL REQUIREMENTS:
- Background MUST be pure solid black - no gray, no gradients, no texture
- Only green wireframe lines on black
- No gray anywhere on the object
- Compact composition filling the frame
- Include isometric grid floor for visual consistency

COMPOSITION:
- Simple, uncluttered - only 1-2 main objects
- Centered in frame
- Object on grid floor

AVOID: Gray shading, solid fills, gradients, complex scenes, multiple objects, any color other than green on black
```

### Step 2: Generate Image

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="AIzaSyCeHHLv6NSnVYMx7fQueIaZt6swTLEe2tY")

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents="YOUR DETAILED PROMPT HERE",
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"]
    )
)

# Use the EXACT filename from the HTML
output_path = "/Users/vibes/Documents/GitHub/closeout-deck/EXACT_FILENAME_FROM_HTML.png"

for part in response.candidates[0].content.parts:
    if part.inline_data:
        with open(output_path, 'wb') as f:
            f.write(part.inline_data.data)
        print(f"Generated: {output_path}")
        break
```

### Step 3: Post-Process with ImageMagick

```bash
# Remove black background + trim whitespace + optimize size (one pipeline)
magick input.png -fuzz 20% -transparent black -trim +repage -colors 64 PNG8:output.png
```

This single command:
- Makes black pixels transparent
- Trims whitespace around the subject
- Reduces to 64 colors for smaller file size
- Outputs optimized PNG with transparency

### Step 4: Verify Result

Use the Read tool to view the image and ensure:
- Background is fully transparent
- No gray artifacts or halos
- Subject is properly cropped
- File size is reasonable (under 100KB for card images)

If there are issues, adjust the `-fuzz` percentage:
- Lower (10-15%): More precise, keeps dark details
- Higher (25-30%): More aggressive, removes more dark pixels

## Complete Example

```python
from google import genai
from google.genai import types
import subprocess

client = genai.Client(api_key="AIzaSyCeHHLv6NSnVYMx7fQueIaZt6swTLEe2tY")

prompt = """
Create an isometric 3D illustration on a PURE BLACK background (#000000).

SUBJECT: A digital wallet with paper bills and coins

STYLE:
- Green glowing wireframe/hologram aesthetic
- Bright neon green (#22c55e) lines ONLY
- NO gray shading, NO solid fills, NO gradients
- Stroke-only linework
- Technical blueprint look
- Isometric 3/4 perspective
- Grid floor underneath for grounding

CRITICAL REQUIREMENTS:
- Background MUST be pure solid black
- Only green wireframe lines on black
- No gray anywhere
- Include isometric grid floor

COMPOSITION:
- Simple - wallet with 2-3 floating bills
- Centered on grid floor

AVOID: Gray shading, solid fills, gradients, complex scenes
"""

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
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

# Post-process: transparency + trim + optimize
final_path = "/Users/vibes/Documents/GitHub/closeout-deck/card-payout-1.png"
subprocess.run([
    "magick", raw_path,
    "-fuzz", "20%", "-transparent", "black",
    "-trim", "+repage",
    "-colors", "64",
    f"PNG8:{final_path}"
])

# Clean up
subprocess.run(["rm", raw_path])
print(f"Final asset: {final_path}")
```

## Common Mistakes to Avoid

| Mistake | Solution |
|---------|----------|
| Not checking HTML first | Always grep HTML for exact filename before generating |
| Using wrong filename | Match EXACTLY what HTML references |
| Large file sizes | Always optimize with `-colors 64 PNG8:` |
| Using rembg for wireframe art | Use ImageMagick `-transparent black` |
| Complex scenes with many objects | Keep it simple: 1-2 objects max |
| Vague prompts | Be extremely specific, say "pure black" multiple times |
| Gray shading on objects | Explicitly say "NO gray shading, NO fills" |
| Forgetting to trim whitespace | Always use `-trim +repage` |
| Missing grid floor | Include grid floor for consistency with other cards |
| Wrong green color | Always specify exact hex: #22c55e |

## Post-Generation Checklist

- [ ] Checked HTML for exact filename
- [ ] Single image generated (no variants)
- [ ] Pure black background in raw output
- [ ] Grid floor included (for card consistency)
- [ ] Processed with ImageMagick (not rembg)
- [ ] Whitespace trimmed
- [ ] Background fully transparent
- [ ] No gray halos or artifacts
- [ ] Correct green color (#22c55e)
- [ ] File size optimized (under 100KB for cards)
- [ ] File saved with EXACT name from HTML
