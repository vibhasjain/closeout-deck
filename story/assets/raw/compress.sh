#!/bin/zsh
# raw PNG -> 1920w JPEG q70 in assets/
cd "$(dirname "$0")"
for f in *.png; do
  out="../${f%.png}.jpg"
  [ -e "$out" ] && [ "$out" -nt "$f" ] && continue
  sips -s format jpeg -s formatOptions 70 --resampleWidth 1920 "$f" --out "$out" >/dev/null && echo "$out $(stat -f%z "$out")B"
done
