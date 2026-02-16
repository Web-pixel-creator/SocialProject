#!/usr/bin/env bash
set -euo pipefail

mapfile -t SHELL_SCRIPTS < <(find scripts -type f -name '*.sh' | sort)

if [ "${#SHELL_SCRIPTS[@]}" -eq 0 ]; then
  echo "No shell scripts found under scripts/."
  exit 0
fi

echo "Validating shell script syntax:"
for script_path in "${SHELL_SCRIPTS[@]}"; do
  echo "- ${script_path}"
  bash -n "${script_path}"
done

echo "Shell script syntax validation passed."
