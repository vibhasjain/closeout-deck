#!/bin/sh
# Assemble the public site. ponytail: explicit whitelist; anything not listed
# stays private (repo docs like CLAUDE.md, tasks/*.md were public before this).
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
for p in index.html closeout assets favicon.svg logo-small.svg og-image.png _headers answers job product story logos shared; do
  [ -e "$p" ] && cp -R "$p" dist/
done
# story/assets/raw is the image-model originals (~65 MB); only the compressed JPEGs ship
rm -rf dist/story/assets/raw
# dotfiles and docs never ship, even inside whitelisted dirs
find dist \( -name '*.md' -o -name '*.d.ts' -o -name '.env*' -o -name '.DS_Store' \) -delete
