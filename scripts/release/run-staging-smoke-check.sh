#!/usr/bin/env bash
set -euo pipefail

API_URL="${RELEASE_INPUT_API_BASE_URL:-}"
WEB_URL="${RELEASE_INPUT_WEB_BASE_URL:-}"
CSRF_TOKEN="${RELEASE_INPUT_CSRF_TOKEN:-}"
PREFLIGHT_SUMMARY_PATH="artifacts/release/tunnel-preflight-summary.json"
ENV_PREFLIGHT_SUMMARY_PATH="artifacts/release/env-preflight-summary.json"
SMOKE_RESULTS_PATH="artifacts/release/smoke-results.json"
MODE=""
EFFECTIVE_API_URL=""
EFFECTIVE_WEB_URL=""
CSRF_CONFIGURED="no"

write_step_summary() {
  local status="$1"
  local summary_md_path="artifacts/release/release-smoke-step-summary.md"
  node scripts/release/render-release-smoke-step-summary.mjs \
    --status "$status" \
    --mode "$MODE" \
    --api-url "$EFFECTIVE_API_URL" \
    --web-url "$EFFECTIVE_WEB_URL" \
    --csrf-configured "$CSRF_CONFIGURED" \
    --smoke-results "$SMOKE_RESULTS_PATH" \
    --env-preflight "$ENV_PREFLIGHT_SUMMARY_PATH" \
    --output "$summary_md_path"
}

on_exit() {
  local code=$?
  if [ "$code" -eq 0 ]; then
    write_step_summary "success"
  else
    write_step_summary "failed"
  fi
}

trap on_exit EXIT

if [ -z "$API_URL" ]; then
  API_URL="${RELEASE_DEFAULT_API_BASE_URL_VAR:-}"
fi
if [ -z "$WEB_URL" ]; then
  WEB_URL="${RELEASE_DEFAULT_WEB_BASE_URL_VAR:-}"
fi
if [ -z "$CSRF_TOKEN" ]; then
  CSRF_TOKEN="${RELEASE_DEFAULT_CSRF_TOKEN_SECRET:-}"
fi
if [ -z "$CSRF_TOKEN" ]; then
  CSRF_TOKEN="${RELEASE_DEFAULT_CSRF_TOKEN_VAR:-}"
fi
if [ -n "$CSRF_TOKEN" ]; then
  CSRF_CONFIGURED="yes"
fi

if { [ -n "$API_URL" ] && [ -z "$WEB_URL" ]; } || { [ -z "$API_URL" ] && [ -n "$WEB_URL" ]; }; then
  echo "::error::Release smoke configuration is partial. Set both API and WEB URLs or leave both empty for local fallback."
  echo "API_URL set: $([ -n "$API_URL" ] && echo yes || echo no)"
  echo "WEB_URL set: $([ -n "$WEB_URL" ] && echo yes || echo no)"
  exit 1
fi

if [ -n "$API_URL" ] && [ -n "$WEB_URL" ]; then
  MODE="staging"
  EFFECTIVE_API_URL="$API_URL"
  EFFECTIVE_WEB_URL="$WEB_URL"
  echo "Release smoke mode: staging"
  echo "Resolved API URL: $EFFECTIVE_API_URL"
  echo "Resolved WEB URL: $EFFECTIVE_WEB_URL"
  echo "CSRF token configured: $CSRF_CONFIGURED"
else
  MODE="local-fallback"
  EFFECTIVE_API_URL="http://127.0.0.1:4000"
  EFFECTIVE_WEB_URL="http://127.0.0.1:3000"
  echo "Release smoke mode: local fallback"
  echo "Reason: staging URLs are not configured."
fi

RELEASE_PREFLIGHT_API_BASE_URL="$API_URL" \
RELEASE_PREFLIGHT_WEB_BASE_URL="$WEB_URL" \
RELEASE_PREFLIGHT_OUTPUT_PATH="$PREFLIGHT_SUMMARY_PATH" \
node scripts/release/preflight-smoke-targets.mjs --allow-skip

if [ "$MODE" = "staging" ]; then
  echo "Running release env preflight gate for staging smoke check."

  RESOLVED_RELEASE_ENV_EXPORTS="$(node scripts/release/resolve-release-smoke-env.mjs \
    --effective-api-url "$EFFECTIVE_API_URL" \
    --effective-web-url "$EFFECTIVE_WEB_URL" \
    --csrf-token "$CSRF_TOKEN")"
  eval "$RESOLVED_RELEASE_ENV_EXPORTS"

  npm run release:preflight:env:json | tee "$ENV_PREFLIGHT_SUMMARY_PATH"

  echo "Running release smoke check against configured staging URLs."
  RELEASE_API_BASE_URL="$EFFECTIVE_API_URL" \
  RELEASE_WEB_BASE_URL="$EFFECTIVE_WEB_URL" \
  RELEASE_CSRF_TOKEN="$CSRF_TOKEN" \
  RELEASE_RESULTS_PATH="$SMOKE_RESULTS_PATH" \
  npm run release:smoke
else
  mkdir -p "$(dirname "$ENV_PREFLIGHT_SUMMARY_PATH")"
  node scripts/release/write-release-env-preflight-skipped-summary.mjs --output "$ENV_PREFLIGHT_SUMMARY_PATH"

  echo "Staging URLs are not configured. Running local-stack release dry-run fallback."
  RELEASE_API_BASE_URL="$EFFECTIVE_API_URL" \
  RELEASE_WEB_BASE_URL="$EFFECTIVE_WEB_URL" \
  RELEASE_RESULTS_PATH="$SMOKE_RESULTS_PATH" \
  npm run release:dry-run:local
fi
