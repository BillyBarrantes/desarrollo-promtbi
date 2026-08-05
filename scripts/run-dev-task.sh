#!/usr/bin/env bash
set -euo pipefail

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Debe proporcionar un TASK_ID"}'
  exit 1
fi

BRANCH_NAME="agent/dev/${TASK_ID}"

if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
  git checkout "$BRANCH_NAME"
else
  git checkout -b "$BRANCH_NAME"
fi

echo "{\"status\": \"branch_ready\", \"task_id\": \"$TASK_ID\", \"branch\": \"$BRANCH_NAME\"}"
