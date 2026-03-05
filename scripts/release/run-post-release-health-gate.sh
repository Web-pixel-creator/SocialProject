#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${RELEASE_TARGET_RUN_ID:-}"
if [ -z "${RUN_ID}" ]; then
  echo "RELEASE_TARGET_RUN_ID is required."
  exit 1
fi

mkdir -p artifacts/release

REPORT_SUMMARY_PATH="artifacts/release/post-release-health-summary-${RUN_ID}.json"
RUNTIME_REPORT_PATH="artifacts/release/post-release-health-run-${RUN_ID}.json"
SCHEMA_SUMMARY_PATH="artifacts/release/post-release-health-schema-summary-${RUN_ID}.json"

report_status=0
schema_text_status=0
schema_json_status=0

npm --silent run release:health:report -- "${RUN_ID}" --json --strict --skip-smoke-fetch > "${REPORT_SUMMARY_PATH}" || report_status=$?
npm --silent run release:health:schema:check -- "${RUNTIME_REPORT_PATH}" || schema_text_status=$?
npm --silent run release:health:schema:check:json -- "${RUNTIME_REPORT_PATH}" > "${SCHEMA_SUMMARY_PATH}" || schema_json_status=$?

if [ ! -s "${REPORT_SUMMARY_PATH}" ]; then
  printf '{"label":"release:health:report","status":"fail","reason":"summary output missing","runId":%s}\n' "${RUN_ID}" > "${REPORT_SUMMARY_PATH}"
fi

if [ ! -s "${SCHEMA_SUMMARY_PATH}" ]; then
  printf '{"label":"release:health:schema:check","status":"fail","reason":"schema summary output missing","runId":%s}\n' "${RUN_ID}" > "${SCHEMA_SUMMARY_PATH}"
fi

if [ "${report_status}" -ne 0 ] || [ "${schema_text_status}" -ne 0 ] || [ "${schema_json_status}" -ne 0 ]; then
  echo "Post-release health gate completed with failures (report=${report_status}, schemaText=${schema_text_status}, schemaJson=${schema_json_status})."
  exit 1
fi
