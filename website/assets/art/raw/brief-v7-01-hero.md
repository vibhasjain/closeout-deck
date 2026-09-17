You are an image-generation operator. Produce ONE image with your built-in image generation tool and save it into this repo. Do not edit any other file. Do not open a browser. Do not commit.

Read website/assets/art/ART.md. Build the prompt as: the STYLE-3 block verbatim (section "v3 — human first"), a blank line, the SCENE paragraph for "v7-01-hero" verbatim (section "v7 — human, from the deck"), a blank line, then the COMPOSITION-TOP clause verbatim (section "v5 — go big"; it is a composition rule only, none of v5's sci-fi content is reused). In that clause read "epic scale" as "full human scale".

The previous version of this image was REJECTED by the owner because the workers behind the nurse were asleep, which contradicts the headline "fastest growing". Use the current r2 SCENE paragraph only (skip the "r2, Sep 17" note line). Append this paragraph to the end of the prompt, verbatim: "This is a hand-drawn ILLUSTRATION printed as a two-ink risograph, not a photograph: faces and clothing are built from drawn contour lines, cross-hatching and coarse halftone dots in charcoal-green ink. The paper is warm cream (#efe9dc) everywhere, never white; no yellow, orange or warm tones, the morning light is bare cream paper. Every single person has open eyes and is visibly awake and energetic."

1. Call the image generation tool with that prompt (landscape 16:9, highest quality available).
2. Copy the resulting PNG from ~/.codex/generated_images/<thread-id>/ to website/assets/art/raw/v7-01-hero.png.
3. View it once. Regenerate (up to TWICE) if ANY person has closed eyes or looks asleep, slumped or tired; if any figure is giant, wireframe or holographic; if the people are not the clear foreground subject with readable emotion on their faces; if the open area for type is not genuinely empty light paper; or if there is text, logos, a watermark, a third colour, or a 3D-render or photographic look. Accept the third attempt regardless, but never accept an image with a sleeping person: say so in the final line instead.
4. Append one line to website/assets/art/raw/manifest.md: `v7-01-hero.png | <original path> | <retry note or none>`.

Retry transient errors. Finish with the line IMAGE v7-01-hero DONE.
