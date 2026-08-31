#!/usr/bin/env bash
# Assemble the numerical.run static SPA into dist/ for Netlify.
#
# The RunMat wasm runtime and Monaco are pulled from jsDelivr at runtime (not
# committed and not fetched here), so the build is tiny and fast. Only the app's
# own small files + figrender + examples are published.
set -euo pipefail

DEST=dist
V="$(date +%Y%m%d%H%M%S)"
RUNTIME="https://unpkg.com/runmat@0.6.2/dist/pkg-web"      # runmat_wasm_web.js + _bg.wasm
MONACO="https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min"        # dir containing vs/
FIGR="/runtime/figrender.mjs"                                         # served locally (repo file)

rm -rf "$DEST"
mkdir -p "$DEST/examples" "$DEST/runtime"

sed -e "s|__V__|$V|g" \
    -e "s|__RUNTIME__|$RUNTIME|g" \
    -e "s|__FIGRENDER__|$FIGR|g" \
    -e "s|__MONACO__|$MONACO|g" \
    host/index.html > "$DEST/index.html"

cp host/app.js host/kernel.js host/nbmd.js host/md.js host/render.js host/importers.js host/style.css host/lib.m host/favicon.svg "$DEST/"
cp host/figrender.mjs "$DEST/runtime/figrender.mjs"
cp host/examples/*.nb.md "$DEST/examples/"
[ -d host/thumbs ] && mkdir -p "$DEST/thumbs" && cp host/thumbs/*.png "$DEST/thumbs/" 2>/dev/null || true

echo "built numerical.run SPA v$V -> $DEST (runtime+monaco via jsDelivr)"
