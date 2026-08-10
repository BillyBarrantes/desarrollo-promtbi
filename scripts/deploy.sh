#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"
TASK_ID="${2:-}"
TARGET="${3:-}"

if [ -z "$PROJECT_ID" ] || [ -z "$TASK_ID" ] || [ -z "$TARGET" ]; then
  jq -nc '{status:"error",message:"Uso: deploy.sh <project_id> <task_id> <target>"}'
  exit 1
fi

if [ "$TARGET" != "staging" ]; then
  jq -nc --arg target "$TARGET" \
    '{status:"blocked",deploy_ready:false,target:$target,message:"Solo se permite el destino staging"}'
  exit 1
fi

STATE_FILE=".ops/state/${TASK_ID}.json"

if [ ! -f "$STATE_FILE" ]; then
  jq -nc --arg task_id "$TASK_ID" \
    '{status:"error",task_id:$task_id,message:"Estado de tarea inexistente"}'
  exit 1
fi

TASK_STATUS="$(jq -r '.status' "$STATE_FILE")"

if [ "$TASK_STATUS" != "released" ]; then
  jq -nc \
    --arg task_id "$TASK_ID" \
    --arg task_status "$TASK_STATUS" \
    '{status:"blocked",task_id:$task_id,task_status:$task_status,deploy_ready:false,message:"La tarea no está released"}'
  exit 1
fi

if ! git diff --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  jq -nc \
    '{status:"blocked",deploy_ready:false,message:"El árbol Git no está limpio"}'
  exit 1
fi

DEPLOYED_SHA="$(git rev-parse HEAD)"

jq -nc \
  --arg project_id "$PROJECT_ID" \
  --arg task_id "$TASK_ID" \
  --arg target "$TARGET" \
  --arg deployed_sha "$DEPLOYED_SHA" \
  '{
    status:"proposal",
    project_id:$project_id,
    task_id:$task_id,
    target:$target,
    deployed_sha:$deployed_sha,
    deploy_ready:true,
    production_deploy_executed:false,
    deployment_executed:false,
    next_action:"human_staging_confirmation_required"
  }'
