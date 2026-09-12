#!/bin/sh
# raw PNG -> 1920x1080 JPEG q70 in story/assets/. Portable: ImageMagick, then macOS sips, then Pillow.
cd "$(dirname "$0")" || exit 1
for f in *.png; do
  [ -e "$f" ] || continue
  out="../${f%.png}.jpg"
  [ -e "$out" ] && [ "$out" -nt "$f" ] && continue
  if command -v magick >/dev/null 2>&1; then
    magick "$f" -resize 1920x1080^ -gravity center -extent 1920x1080 -quality 70 "$out"
  elif command -v sips >/dev/null 2>&1; then
    sips -s format jpeg -s formatOptions 70 --resampleWidth 1920 "$f" --out "$out" >/dev/null
  else
    python3 - "$f" "$out" <<'PY' || { echo "need Pillow: pip3 install --user pillow" >&2; exit 1; }
import sys; from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB"); w, h = im.size
s = max(1920 / w, 1080 / h); im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
l, t = (im.width - 1920) // 2, (im.height - 1080) // 2
im.crop((l, t, l + 1920, t + 1080)).save(sys.argv[2], "JPEG", quality=70, optimize=True)
PY
  fi
  echo "$out $(wc -c < "$out" | tr -d ' ')B"
done
