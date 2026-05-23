#!/usr/bin/env bash
# Create the GitHub repo (if needed) and push main. Requires: gh auth login
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="theDavidCoen/three-finger-show-desktop"
REMOTE_URL="git@github.com:${REPO}.git"

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

ensure_origin() {
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "${REMOTE_URL}"
  else
    git remote add origin "${REMOTE_URL}"
  fi
}

if ! "${GH}" repo view "${REPO}" >/dev/null 2>&1; then
  if git remote get-url origin >/dev/null 2>&1; then
    # Repo missing but origin already configured (e.g. previous local setup).
    "${GH}" repo create "${REPO}" --public --source=.
    ensure_origin
    git push -u origin main
  else
    "${GH}" repo create "${REPO}" --public --source=. --remote=origin --push
  fi
else
  ensure_origin
  git push -u origin main
fi

echo ""
echo "Repository: https://github.com/${REPO}"
