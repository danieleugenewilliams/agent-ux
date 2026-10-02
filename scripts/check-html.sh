#!/bin/bash
# Syntax-check every inline JavaScript <script> block in the given HTML files
# (default: every *.html in the repo root). Exits non-zero if any block fails.
# Catches syntax errors only, not runtime errors or broken CDN imports.
set -u
if [ $# -eq 0 ]; then
  cd "$(dirname "$0")/.." && set -- *.html
fi

fail=0
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for f in "$@"; do
  # Write each inline block to its own file; module scripts get .mjs so
  # import/export parse. Import maps, JSON blocks and src= scripts are skipped.
  n=$(node -e '
    const fs = require("fs");
    const html = fs.readFileSync(process.argv[1], "utf8");
    const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
    let m, i = 0;
    while ((m = re.exec(html))) {
      if (/importmap|application\/json|\bsrc=/.test(m[1])) continue;
      const ext = /type="module"/.test(m[1]) ? "mjs" : "js";
      fs.writeFileSync(`${process.argv[2]}/${i++}.${ext}`, m[2]);
    }
    console.log(i);' "$f" "$tmp") || { fail=1; continue; }

  status=ok
  for js in "$tmp"/*; do
    [ -e "$js" ] || continue
    if ! out=$(node --check "$js" 2>&1); then
      status=FAIL
      fail=1
      echo "$out" | sed "s|^.*/[0-9]*\.m\{0,1\}js:|$f (script block $(basename "${js%.*}")):|"
    fi
    rm -f "$js"
  done
  echo "$status  $f ($n script block(s))"
done

exit $fail
