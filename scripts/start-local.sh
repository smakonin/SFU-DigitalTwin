#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  twin_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
  export PATH="$twin_runtime/node/bin:$twin_runtime/bin/fallback:$PATH"
fi
exec node scripts/start-twin.mjs
