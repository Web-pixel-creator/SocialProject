#!/usr/bin/env bash
set -euo pipefail

if [ -z "${PERF_API_BASE_URL:-}" ] || [ -z "${PERF_WEB_BASE_URL:-}" ]; then
  echo "Skipping performance gate: PERF_API_BASE_URL / PERF_WEB_BASE_URL repository variables are not configured."
  exit 0
fi

PERF_RESULTS_PATH="${PERF_RESULTS_PATH:-artifacts/perf/pre-release-results.json}"

PERF_API_BASE_URL="${PERF_API_BASE_URL}" \
PERF_WEB_BASE_URL="${PERF_WEB_BASE_URL}" \
PERF_RESULTS_PATH="${PERF_RESULTS_PATH}" \
npm run perf:pre-release
