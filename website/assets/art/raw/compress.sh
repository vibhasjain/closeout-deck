#!/bin/sh
# raw PNG -> 1600x900 JPEG q58 (+ 960x540 phone) in website/assets/art/. Portable: ImageMagick, sips, Pillow.
cd "$(dirname "$0")" || exit 1
mkdir -p ../m
for f in *.png; do
  [ -e "$f" ] || continue
  out="../${f%.png}.jpg"
  [ -e "$out" ] && [ "$out" -nt "$f" ] && continue
  if command -v magick >/dev/null 2>&1; then
    magick "$f" -resize 1600x900^ -gravity center -extent 1600x900 -quality 58 "$out"
  elif command -v sips >/dev/null 2>&1; then
    sips -s format jpeg -s formatOptions 58 --resampleWidth 1600 "$f" --out "$out" >/dev/null
  else
    python3 - "$f" "$out" <<'PY' || { echo "need Pillow: pip3 install --user pillow" >&2; exit 1; }
import sys; from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB"); w, h = im.size
s = max(1600 / w, 900 / h); im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
l, t = (im.width - 1600) // 2, (im.height - 900) // 2
im.crop((l, t, l + 1600, t + 900)).save(sys.argv[2], "JPEG", quality=58, optimize=True)
PY
  fi
  m="../m/${f%.png}.jpg"
  if command -v magick >/dev/null 2>&1; then magick "$out" -resize 960x540 -quality 78 "$m"
  elif command -v sips >/dev/null 2>&1; then sips -s format jpeg -s formatOptions 78 --resampleWidth 960 "$out" --out "$m" >/dev/null
  else python3 -c 'import sys; from PIL import Image; Image.open(sys.argv[1]).resize((960,540), Image.LANCZOS).save(sys.argv[2], "JPEG", quality=78, optimize=True)' "$out" "$m"; fi
  echo "$out $(wc -c < "$out" | tr -d ' ')B  $m $(wc -c < "$m" | tr -d ' ')B"
done
