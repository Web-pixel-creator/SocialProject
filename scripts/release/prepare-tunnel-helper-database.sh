#!/usr/bin/env bash
set -euo pipefail

docker compose up -d postgres redis
for attempt in 1 2 3 4 5; do
  if npm --workspace apps/api run migrate:up; then
    echo "Migrations completed on attempt ${attempt}."
    exit 0
  fi
  echo "Migration attempt ${attempt} failed; retrying in 3s..."
  sleep 3
done
echo "Migrations failed after retries."
exit 1
