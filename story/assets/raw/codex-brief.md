You are an image-generation operator. Your only job: produce 12 storyboard frames with your built-in image generation tool, save them into this repo, and write a manifest. Do not edit any other file in the repository. Do not open a browser. Do not commit.

Source of truth: story/STORYBOARD.md (read it first). It has a STYLE block and 12 SCENE descriptions.

For each frame 01 through 12, in order:
1. Build the prompt as: the full STYLE block verbatim, then a blank line, then the frame's SCENE paragraph verbatim.
2. Call the image generation tool with that prompt, at the HIGHEST quality setting the tool offers and a landscape 16:9 size (the largest landscape size available, e.g. 1536x1024 or bigger). If the tool accepts a reference/previous image for consistency, pass the previous frame so the illustration language stays identical.
3. The tool saves a PNG under ~/.codex/generated_images/<thread-id>/. Copy that PNG to story/assets/raw/NN-slug.png using the exact slugs from STORYBOARD.md (01-the-lunch.png, 02-the-gap.png, 03-already-matched.png, 04-middle-office.png, 05-trust.png, 06-revolving-door.png, 07-the-choice.png, 08-left-hanging.png, 09-vms-choice.png, 10-flywheel.png, 11-one-coin.png, 12-real-time.png).
4. View the image once. If it contains any readable text, letters, numbers, logos or a watermark, or if it is a 3D/photoreal render instead of ink-and-cel illustration, regenerate that frame ONCE with "no text of any kind" strengthened. Accept the second attempt regardless.
5. Append a line to story/assets/raw/manifest.md: `NN-slug.png | <original path under ~/.codex/generated_images> | <one-line note on any retry>`.

Do all 12. Do not stop early, do not ask questions, do not skip a frame because of a transient error (retry it). When all 12 PNGs exist, print `ALL 12 FRAMES DONE` as the last line.
