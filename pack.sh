#!/usr/bin/env bash
# Build a zip bundle for extensions.gnome.org (EGO).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${ROOT}/dist"

mkdir -p "${OUT}"
rm -f "${OUT}"/*.zip

gnome-extensions pack "${ROOT}" \
  --extra-source=LICENSE \
  --extra-source=COPYING \
  --out-dir="${OUT}" \
  --force

echo ""
echo "Created:"
ls -1 "${OUT}"/*.zip
