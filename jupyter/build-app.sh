#!/usr/bin/env bash
# Build the numerical.run "app" view inside the Jupyter deployment: the web app's
# own renderer (nr_* widgets, figures, whole-doc rerun), on the same RunMat WASM
# the kernel uses, opening the bundled .ipynb notebooks via toNbMd.
#
# Populates <site>/app/. Run build-lite.sh first (it creates the site + the
# static/runmat runtime this page points at). Deploys to both the local _output
# and /opt/sites/numerical-jupyter (the served route).
set -euo pipefail
cd "$(dirname "$0")"

HOST="../host"
RUNTIME_REL="../static/runmat"                 # where build-lite.sh staged the wasm + figrender
V="$(date +%Y%m%d%H%M%S)"

build_into() {
  local dest="$1/app"
  mkdir -p "$dest/examples"
  sed -e "s|__V__|$V|g" \
      -e "s|__RUNTIME__|$RUNTIME_REL|g" \
      -e "s|__FIGRENDER__|$RUNTIME_REL/figrender.mjs|g" \
      -e "s|__MONACO__|$RUNTIME_REL/monaco|g" \
      "$HOST/index.html" > "$dest/index.html"
  cp "$HOST/app.js" "$HOST/kernel.js" "$HOST/nbmd.js" "$HOST/md.js" "$HOST/render.js" \
     "$HOST/importers.js" "$HOST/style.css" "$HOST/favicon.svg" "$HOST/lib.m" "$dest/"
  # a Jupyter-flavored gallery that opens the bundled .ipynb notebooks as apps
  cp app-gallery.nb.md "$dest/examples/gallery.nb.md"
}

build_into lite/_output
[ -d /opt/sites/numerical-jupyter ] && build_into /opt/sites/numerical-jupyter

echo "built app view -> <site>/app/ (v$V)"
