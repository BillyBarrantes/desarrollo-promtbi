#!/usr/bin/env bash
set -euo pipefail

TASK_ID="${1:-}"
ACTION="${2:-lock}"

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Debe proporcionar un TASK_ID"}'
  exit 1
fi

LOCK_FILE=".ops/locks/${TASK_ID}.lock"

if [ "$ACTION" == "lock" ]; then
  if [ -f "$LOCK_FILE" ]; then
    BUSY_BY=$(cat "$LOCK_FILE")
    echo "{\"status\": \"locked\", \"task_id\": \"$TASK_ID\", \"locked_at\": \"$BUSY_BY\"}"
    exit 1
  fi
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$LOCK_FILE"
  echo "{\"status\": \"acquired\", \"task_id\": \"$TASK_ID\"}"
elif [ "$ACTION" == "unlock" ]; then
  rm -f "$LOCK_FILE"
  echo "{\"status\": \"released\", \"task_id\": \"$TASK_ID\"}"
fi
