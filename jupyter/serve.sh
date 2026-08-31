#!/usr/bin/env bash
# Serve the built JupyterLite site locally.  Usage: ./serve.sh [port]
set -euo pipefail
cd "$(dirname "$0")/lite/_output"
PORT="${1:-8123}"
echo "JupyterLite (RunMat kernel) → http://127.0.0.1:$PORT/lab/index.html"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
