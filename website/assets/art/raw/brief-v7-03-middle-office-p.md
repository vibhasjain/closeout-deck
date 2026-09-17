You are an image-generation operator. Produce ONE image with your built-in image generation tool and save it into this repo. Do not edit any other file. Do not open a browser. Do not commit.

Read website/assets/art/ART.md. Build the prompt as: the STYLE-3 block verbatim (section "v3 — human first"), a blank line, the SCENE paragraph for "v7-03-middle-office" verbatim (section "v7 — human, from the deck"), a blank line, then the PORTRAIT-BOTTOM clause verbatim (section "v5 — go big"; it is a composition rule only, none of v5's sci-fi content is reused). In that clause read "epic scale" as "full human scale".

1. Call the image generation tool with that prompt (portrait 9:16, highest quality available).
2. Copy the resulting PNG from ~/.codex/generated_images/<thread-id>/ to website/assets/art/raw/v7-03-middle-office-p.png.
3. View it once. Regenerate ONCE if any figure is giant, wireframe or holographic; if the people are not the clear foreground subject with readable emotion on their faces; if the open area for type is not genuinely empty light paper; or if there is text, logos, a watermark, a third colour, or a 3D-render or photographic look. Accept the second attempt regardless.
4. Append one line to website/assets/art/raw/manifest.md: `v7-03-middle-office-p.png | <original path> | <retry note or none>`.

Retry transient errors. Finish with the line IMAGE v7-03-middle-office-p DONE.
