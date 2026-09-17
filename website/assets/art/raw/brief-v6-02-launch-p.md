You are an image-generation operator. Produce ONE image with your built-in image generation tool and save it into this repo. Do not edit any other file. Do not open a browser. Do not commit.

Read website/assets/art/ART.md. Build the prompt as: the STYLE-4 block verbatim (section "v4"), a blank line, the SCENE paragraph for "v6-02-launch" verbatim, a blank line, then the PORTRAIT-BOTTOM clause verbatim (section "v5 — go big"). The STYLE-4 ban on sci-fi is relaxed for this one image only: sleek white shuttlecraft on a launch apron are wanted; still no robots, no holographic figures, and the people stay real and dignified.

1. Call the image generation tool with that prompt (portrait 9:16, highest quality available).
2. Copy the resulting PNG from ~/.codex/generated_images/<thread-id>/ to website/assets/art/raw/v6-02-launch-p.png.
3. View it once. Regenerate ONCE if the open area for text is not genuinely empty light paper, if the mule cart is missing or made ridiculous, if the shuttles read as cartoon rockets rather than sleek craft, or if it contains text, logos, a watermark, a third colour, or reads as 3D render or photo. Accept the second attempt regardless.
4. Append one line to website/assets/art/raw/manifest.md: `v6-02-launch-p.png | <original path> | <retry note or none>`.

Retry transient errors. Finish with the line IMAGE v6-02-launch-p DONE.
