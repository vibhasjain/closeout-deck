You are an image-generation operator. Produce ONE storyboard frame with your built-in image generation tool and save it into this repo. Do not edit any other file. Do not open a browser. Do not commit.

Read story/STORYBOARD.md. Build the prompt as: the full STYLE block verbatim, a blank line, then the SCENE paragraph for frame "21 · flag-to-formula" verbatim. Where the SCENE explicitly allows text (frame 21's chalkboard), that allowance overrides the STYLE block's no-text rule for that element only; say so in the prompt.

1. Call the image generation tool with that prompt (landscape 16:9, highest quality available).
2. The tool saves a PNG under ~/.codex/generated_images/<thread-id>/. Copy it to story/assets/raw/21-flag-to-formula.png.
3. View it once. If it contains stray text outside what the SCENE allows, logos, a watermark, is 3D/photoreal instead of ink-and-cel, or (frame 21) the chalkboard text is misspelled or garbled, regenerate ONCE with the constraint strengthened and overwrite the file. Accept the second attempt regardless.
4. Append one line to story/assets/raw/manifest.md: `21-flag-to-formula.png | <original path> | <retry note or none>`.

Retry transient errors. Finish with the line FRAME 21 DONE.
