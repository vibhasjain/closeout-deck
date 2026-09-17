You are an image-generation operator. Produce ONE image with your built-in image generation tool and save it into this repo. Do not edit any other file. Do not open a browser. Do not commit.

Read website/assets/art/ART.md. Build the prompt as: the STYLE-3 block verbatim (section "v3 — human first"), a blank line, the SCENE paragraph for "v7-02-fortune" verbatim (section "v7 — human, from the deck"), a blank line, then the PORTRAIT-BOTTOM clause verbatim (section "v5 — go big"; it is a composition rule only, none of v5's sci-fi content is reused). In that clause read "epic scale" as "full human scale".

The previous attempt at this image was REJECTED by the art director: it read as a desaturated photograph on white paper (smooth photographic faces and gradients, a yellow sunrise, clouds in the type area). Append this paragraph to the end of the prompt, verbatim: "This is a hand-drawn ILLUSTRATION printed as a two-ink risograph, not a photograph: faces and clothing are built from drawn contour lines, cross-hatching and coarse halftone dots in charcoal-green ink, like an engraved editorial illustration or a graphic-novel panel. The paper is warm cream (#efe9dc) everywhere, never white. There is no sun, no sky colour, no clouds, no yellow, orange or warm tones: the sky is plain empty cream paper. The general manager and the staffing coordinator shaking hands are the largest figures, in the near foreground, with warm, proud, readable smiles."

1. Call the image generation tool with that prompt (portrait 9:16, highest quality available).
2. Copy the resulting PNG from ~/.codex/generated_images/<thread-id>/ to website/assets/art/raw/v7-02-fortune-p.png.
3. View it once. Regenerate (up to TWICE) if it could be mistaken for a photograph at a glance; if the paper is white instead of cream; if any figure is giant, wireframe or holographic; if the people are not the clear foreground subject with readable emotion on their faces; if the open area for type is not genuinely empty light paper; or if there is text, logos, a watermark, a third colour, or a 3D-render or photographic look. Accept the third attempt regardless.
4. Append one line to website/assets/art/raw/manifest.md: `v7-02-fortune-p.png | <original path> | <retry note or none>`.

Retry transient errors. Finish with the line IMAGE v7-02-fortune-p DONE.
