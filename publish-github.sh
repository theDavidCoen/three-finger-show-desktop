#!/usr/bin/env bash
# Create the GitHub repo (if needed) and push main. Requires: gh auth login OR an existing empty repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="theDavidCoen/three-finger-show-desktop"

GH="${GH:-gh}"
if ! command -v "${GH}" >/dev/null 2>&1 && [[ -x "${HOME}/.local/bin/gh" ]]; then
  GH="${HOME}/.local/bin/gh"
fi

cd "${ROOT}"

if ! "${GH}" auth status >/dev/null 2>&1; then
  echo "Log in to GitHub first:"
  echo "  ${GH} auth login -h github.com -p ssh -w"
  exit 1
fi

if ! "${GH}" repo view "${REPO}" >/dev/null 2>&1; then
  "${GH}" repo create "${REPO}" --public --source=. --remote=origin --push
else
  git remote remove origin 2>/dev/null || true
  git remote add origin "git@github.com:${REPO}.git"
  git push -u origin main
fi

echo ""
echo "Repository: https://github.com/${REPO}"
