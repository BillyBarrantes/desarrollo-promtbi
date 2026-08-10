#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"
TASK_ID="${2:-}"

if [ -z "$PROJECT_ID" ] || [ -z "$TASK_ID" ]; then
  jq -nc '{status:"error",message:"Uso: run-release.sh <project_id> <task_id>"}'
  exit 1
fi

STATE_FILE=".ops/state/${TASK_ID}.json"
APPROVAL_FILE=".ops/approvals/${TASK_ID}-approval.json"

if [ ! -f "$STATE_FILE" ]; then
  jq -nc --arg task_id "$TASK_ID" \
    '{status:"error",task_id:$task_id,message:"Estado de tarea inexistente"}'
  exit 1
fi

if [ ! -f "$APPROVAL_FILE" ]; then
  jq -nc --arg task_id "$TASK_ID" \
    '{status:"blocked",task_id:$task_id,release_ready:false,message:"Falta aprobación humana explícita"}'
  exit 1
fi

if ! jq -e '
  (.decision == "approve" or .decision == "approved")
  and ((.approved_by // .approvedby // .telegram_user_id // .telegramuserid) != null)
' "$APPROVAL_FILE" >/dev/null; then
  jq -nc --arg task_id "$TASK_ID" \
    '{status:"blocked",task_id:$task_id,release_ready:false,message:"La aprobación humana no es válida"}'
  exit 1
fi

if [ "$(jq -r '.status' "$STATE_FILE")" != "awaiting_approval" ]; then
  jq -nc \
    --arg task_id "$TASK_ID" \
    --arg state "$(jq -r '.status' "$STATE_FILE")" \
    '{status:"blocked",task_id:$task_id,release_ready:false,task_status:$state,message:"La tarea no está en awaiting_approval"}'
  exit 1
fi

jq -nc \
  --arg project_id "$PROJECT_ID" \
  --arg task_id "$TASK_ID" \
  '{
    status:"proposal",
    project_id:$project_id,
    task_id:$task_id,
    release_ready:true,
    approval_verified:true,
    merge_executed:false,
    push_executed:false,
    production_deploy_executed:false,
    next_action:"human_release_confirmation_required"
  }'
