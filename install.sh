#!/usr/bin/env bash
# Install Three Finger Show Desktop GNOME Shell extension (user scope).
set -euo pipefail

UUID="three-finger-show-desktop@theDavidCoen.github.io"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "Installing ${UUID}"

rm -rf "${DEST}"
mkdir -p "${DEST}"

cp "${SRC}/extension.js" "${SRC}/metadata.json" "${DEST}/"

echo "Files copied to: ${DEST}"

if ! command -v gnome-extensions >/dev/null 2>&1; then
  echo "Install the gnome-extensions CLI to enable the extension from the terminal."
  exit 0
fi

if gnome-extensions list 2>/dev/null | grep -Fxq "${UUID}"; then
  gnome-extensions disable "${UUID}" 2>/dev/null || true
  gnome-extensions enable "${UUID}" 2>/dev/null || true
  echo ""
  gnome-extensions info "${UUID}" 2>/dev/null || true
  echo ""
  echo "If the extension does not load, log out and back in (Wayland), then run:"
  echo "  gnome-extensions enable ${UUID}"
else
  echo ""
  echo "Install completed. Log out and back in, then run:"
  echo "  gnome-extensions enable ${UUID}"
fi
