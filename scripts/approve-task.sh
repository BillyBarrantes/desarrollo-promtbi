#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"
TASK_ID="${2:-}"
APPROVED_BY="${3:-}"

if [[ -z "$PROJECT_ID" || -z "$TASK_ID" || -z "$APPROVED_BY" ]]; then
  echo "{\"status\":\"failed\",\"error\":\"Usage: approve-task.sh <project_id> <task_id> <approved_by>\"}"
  exit 1
fi

STATE_FILE=".ops/state/${TASK_ID}.json"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "{\"status\":\"failed\",\"error\":\"Task state file not found\"}"
  exit 1
fi

CURRENT_STATUS=$(jq -r ".status" "$STATE_FILE")
if [[ "$CURRENT_STATUS" != "open" ]]; then
  echo "{\"status\":\"failed\",\"error\":\"Task is not in open status\"}"
  exit 1
fi

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TMP=$(mktemp)

jq --arg status "approved" \
   --arg approved_by "$APPROVED_BY" \
   --arg approved_at "$NOW" \
   --arg updated_at "$NOW" \
   ".status = \$status | .approved_by = \$approved_by | .approved_at = \$approved_at | .updated_at = \$updated_at" \
   "$STATE_FILE" > "$TMP"
mv "$TMP" "$STATE_FILE"

jq -cn \
   --arg mode "task_approval" \
   --arg task_id "$TASK_ID" \
   --arg project_id "$PROJECT_ID" \
   --arg approved_by "$APPROVED_BY" \
   --arg approved_at "$NOW" \
   "{status:\"passed\", mode:\$mode, task_id:\$task_id, project_id:\$project_id, approved_by:\$approved_by, approved_at:\$approved_at, production_blocked:true}"
