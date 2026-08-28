#!/usr/bin/env bash
# Deploy numerical.run to /opt/sites/numerical (served, basicauth-gated, at
# jean-clawd.com/numerical/). Reuses streamlab's RunMat WASM runtime.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/host"
DEST=/opt/sites/numerical
RUNTIME_SRC=/opt/sites/streamlab/runtime
V="$(date +%Y%m%d%H%M%S)"

mkdir -p "$DEST/examples" "$DEST/runtime"

# app code (version-stamp index.html so Cloudflare can't serve a stale mix)
sed "s/__V__/$V/g" "$SRC/index.html" > "$DEST/index.html"
cp "$SRC/app.js" "$SRC/kernel.js" "$SRC/nbmd.js" "$SRC/md.js" "$SRC/render.js" "$DEST/"
cp "$SRC/style.css" "$DEST/"
cp "$SRC/lib.m" "$DEST/lib.m"
cp "$SRC"/examples/*.nb.md "$DEST/examples/"

# RunMat WASM runtime + figrender (shared with streamlab)
cp "$RUNTIME_SRC/runmat_wasm_web.js" "$RUNTIME_SRC/runmat_wasm_web_bg.wasm" "$DEST/runtime/"
cp "$SRC/../host/figrender.mjs" "$DEST/runtime/figrender.mjs" 2>/dev/null \
  || cp "$RUNTIME_SRC/figrender.mjs" "$DEST/runtime/figrender.mjs"

echo "deployed numerical.run v$V -> $DEST"
ls -la "$DEST"
