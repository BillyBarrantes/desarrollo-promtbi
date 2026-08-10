#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"
TASK_ID="${2:-}"
TARGET="${3:-}"

if [ -z "$PROJECT_ID" ] || [ -z "$TASK_ID" ] || [ -z "$TARGET" ]; then
  jq -nc '{status:"error",message:"Uso: rollback.sh <project_id> <task_id> <target>"}'
  exit 1
fi

if [ "$TARGET" != "staging" ]; then
  jq -nc --arg target "$TARGET" \
    '{status:"blocked",rollback_ready:false,target:$target,message:"Rollback automático limitado a staging"}'
  exit 1
fi

STATE_FILE=".ops/state/${TASK_ID}.json"

if [ ! -f "$STATE_FILE" ]; then
  jq -nc --arg task_id "$TASK_ID" \
    '{status:"error",task_id:$task_id,message:"Estado de tarea inexistente"}'
  exit 1
fi

DEPLOYED_SHA="$(jq -r '.deployed_sha // empty' "$STATE_FILE")"
PREVIOUS_SHA="$(jq -r '.previous_deployed_sha // empty' "$STATE_FILE")"

if [ -z "$DEPLOYED_SHA" ] || [ -z "$PREVIOUS_SHA" ]; then
  jq -nc \
    --arg task_id "$TASK_ID" \
    '{status:"blocked",task_id:$task_id,rollback_ready:false,message:"No existe un despliegue registrado con SHA anterior"}'
  exit 1
fi

jq -nc \
  --arg project_id "$PROJECT_ID" \
  --arg task_id "$TASK_ID" \
  --arg target "$TARGET" \
  --arg deployed_sha "$DEPLOYED_SHA" \
  --arg previous_sha "$PREVIOUS_SHA" \
  '{
    status:"proposal",
    project_id:$project_id,
    task_id:$task_id,
    target:$target,
    deployed_sha:$deployed_sha,
    previous_deployed_sha:$previous_sha,
    rollback_ready:true,
    rollback_executed:false,
    production_rollback_executed:false,
    next_action:"human_rollback_confirmation_required"
  }'
