#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${RELEASE_TARGET_RUN_ID:-}"
if [ -z "${RUN_ID}" ]; then
  echo "RELEASE_TARGET_RUN_ID is required."
  exit 1
fi

mkdir -p artifacts/release

npm --silent run release:health:report -- "${RUN_ID}" --json --strict --skip-smoke-fetch > "artifacts/release/post-release-health-summary-${RUN_ID}.json"
npm --silent run release:health:schema:check -- "artifacts/release/post-release-health-run-${RUN_ID}.json"
npm --silent run release:health:schema:check:json -- "artifacts/release/post-release-health-run-${RUN_ID}.json" > "artifacts/release/post-release-health-schema-summary-${RUN_ID}.json"
