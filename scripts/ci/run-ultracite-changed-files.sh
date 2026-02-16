#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${ULTRACITE_BASE_SHA:-}"
HEAD_SHA="${ULTRACITE_HEAD_SHA:-}"

if [ -z "${BASE_SHA}" ] || [ -z "${HEAD_SHA}" ]; then
  echo "ULTRACITE_BASE_SHA and ULTRACITE_HEAD_SHA are required."
  exit 1
fi

mapfile -t FILES < <(
  git -c core.quotePath=false diff --name-only "${BASE_SHA}...${HEAD_SHA}" \
    | grep -E '^apps/(api|web)/src/.*\.(ts|tsx|js|jsx)$' \
    || true
)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "No changed source files for Ultracite changed-files gate."
  exit 0
fi

echo "Ultracite changed-files scope:"
printf '%s\n' "${FILES[@]}"
npx ultracite check "${FILES[@]}"
