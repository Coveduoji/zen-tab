#!/usr/bin/env bash
# Regenerate the packaged icon sizes from the 2048px source artwork.
# Requires ImageMagick (`convert`). The generated PNGs are committed, so this
# only needs to run when the artwork changes.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/assets/icon-source.png"

if [[ ! -f "$src" ]]; then
  echo "missing source icon: $src" >&2
  exit 1
fi

for size in 16 32 48 128; do
  convert "$src" -resize "${size}x${size}" -strip "$root/icons/icon${size}.png"
  echo "icons/icon${size}.png"
done
