#!/usr/bin/env bash
# Build a JupyterLite site for numerical.run that runs on the RunMat kernel.
#
# Reuses the RunMat Jupyter kernel from the runmat-jupyter project: its venv has
# the `jupyterlite-runmat-kernel` labextension enabled, which `jupyter lite build`
# picks up automatically. The RunMat WASM runtime is copied into static/runmat
# (where the kernel's runtimeUrl points). Notebooks in ./notebooks are preloaded.
#
# Output: jupyter/lite/_output  (git-ignored). Serve it with ./serve.sh.
set -euo pipefail
cd "$(dirname "$0")"

RJ="${RUNMAT_JUPYTER:-/root/Projects/runmat-jupyter}"      # source of the kernel + venv
VENV="$RJ/.venv"
RUNTIME_SRC="${RUNMAT_RUNTIME:-/opt/runmat-runtime}"        # runmat_wasm_web.js + _bg.wasm
SHARED="$RJ/shared"                                         # figrender.mjs

[ -x "$VENV/bin/jupyter" ] || { echo "runmat-jupyter venv not found at $VENV (set RUNMAT_JUPYTER)"; exit 1; }

# regenerate .ipynb from the source examples so the site is always current
node nbmd2ipynb.mjs ../host/examples/waves.nb.md  notebooks/waves.ipynb
node nbmd2ipynb.mjs ../host/examples/signal.nb.md notebooks/signal.ipynb
node nbmd2ipynb.mjs ../host/examples/knn.nb.md    notebooks/knn.ipynb
node nbmd2ipynb.mjs ../host/examples/hello.nb.md  notebooks/hello.ipynb

cd lite
"$VENV/bin/jupyter" lite build --contents ../notebooks --output-dir _output

# stage the WASM runtime + figrender where the kernel's runtimeUrl points
# (./static/runmat). Done AFTER the build, since jupyter lite build rewrites
# _output/static with the app's own assets.
mkdir -p _output/static/runmat
cp "$RUNTIME_SRC/runmat_wasm_web.js" "$RUNTIME_SRC/runmat_wasm_web_bg.wasm" _output/static/runmat/
if [ -f "$SHARED/figrender.mjs" ]; then cp "$SHARED/figrender.mjs" _output/static/runmat/; else cp ../../host/figrender.mjs _output/static/runmat/; fi

echo
echo "Built jupyter/lite/_output — serve with:  ./serve.sh"
