#!/bin/sh
# Assemble the public site. ponytail: explicit whitelist; anything not listed
# stays private (repo docs like CLAUDE.md, tasks/*.md were public before this).
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
for p in index.html closeout assets favicon.svg logo-small.svg og-image.png _headers answers job product; do
  [ -e "$p" ] && cp -R "$p" dist/
done
# dotfiles and docs never ship, even inside whitelisted dirs
find dist \( -name '*.md' -o -name '.env*' -o -name '.DS_Store' \) -delete
