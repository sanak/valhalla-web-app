#!/usr/bin/env bash
# Copies the Valhalla wasm bindings' runtime artifacts into public/valhalla-wasm/.
#
# The artifacts are gitignored on purpose: this repository consumes them, the valhalla repository
# builds them. Vite never transforms them - worker.js imports valhalla.mjs relatively and
# valhalla.mjs loads valhalla.wasm next to itself, so the whole graph has to stay in public/.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VALHALLA_REPO="${VALHALLA_REPO:-$REPO_ROOT/../valhalla}"
BUILD_DIR="${VALHALLA_WASM_BUILD:-$VALHALLA_REPO/build-wasm/build-valhalla/src/bindings/wasm}"
DEST="$REPO_ROOT/public/valhalla-wasm"

sources=(
  "$BUILD_DIR/valhalla.mjs"
  "$BUILD_DIR/valhalla.wasm"
  "$VALHALLA_REPO/src/bindings/wasm/worker.js"
  "$VALHALLA_REPO/src/bindings/wasm/index.mjs"
  "$VALHALLA_REPO/test/bindings/wasm/valhalla.json"
)

missing=()
for source in "${sources[@]}"; do
  [ -f "$source" ] || missing+=("$source")
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing wasm artifacts:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  cat >&2 <<EOF

Build them in the valhalla repository first:

  cd $VALHALLA_REPO/src/bindings/wasm
  ./scripts/build_deps.sh
  ./scripts/build.sh

Point at a different checkout with:

  VALHALLA_REPO=/path/to/valhalla npm run wasm:sync
EOF
  exit 1
fi

mkdir -p "$DEST"
cp "${sources[@]}" "$DEST/"

echo "Synced $(basename "$DEST") from $VALHALLA_REPO:"
ls -1sh "$DEST"
