#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"
TASK_ID="${2:-}"
AGENTIC_ROOT="${AGENTIC_ROOT:-/srv/agentic}"
REGISTRY="${AGENTIC_ROOT}/registry/projects.json"
VALIDATOR="${AGENTIC_ROOT}/global/scripts/task-validate-v2.sh"

if [ -z "$PROJECT_ID" ] || [ -z "$TASK_ID" ]; then
  jq -nc '{status:"error",message:"Uso: review-contract.sh <project_id> <task_id>"}'
  exit 1
fi

if ! VALIDATION="$(bash "$VALIDATOR" "$PROJECT_ID" "$TASK_ID")"; then
  printf '%s\n' "$VALIDATION"
  exit 1
fi

PROJECT="$(jq -c --arg id "$PROJECT_ID" \
  '.projects[] | select(.project_id == $id and .status == "active")' \
  "$REGISTRY")"

WORKSPACE_ROOT="$(jq -r '.workspace_root' <<<"$PROJECT")"
STATE_FILE="${WORKSPACE_ROOT}/.ops/state/${TASK_ID}.json"

if ! jq -e '
  [
    "schema_version",
    "task_id",
    "project_id",
    "workspace_root",
    "requested_by",
    "title",
    "goal",
    "status",
    "risk_level",
    "scope",
    "acceptance_criteria",
    "required_checks",
    "approval_required",
    "retries",
    "last_error",
    "modified_files",
    "created_at",
    "updated_at"
  ] as $required
  | (. as $root | ($required | all(.[]; . as $field | $root | has($field))))
  and (.schema_version == 2)
  and (.task_id == $task_id)
  and (.project_id == $project_id)
  and (.workspace_root == $workspace_root)
  and (.status | IN(
    "new",
    "planned",
    "in_progress",
    "awaiting_qa",
    "awaiting_approval",
    "released",
    "deployed",
    "failed_needs_human"
  ))
  and (.scope.allowed_paths | type == "array")
  and (.scope.forbidden_paths | type == "array")
  and (.acceptance_criteria | type == "array")
  and (.required_checks | type == "array")
  and (.modified_files | type == "array")
' --arg task_id "$TASK_ID" \
  --arg project_id "$PROJECT_ID" \
  --arg workspace_root "$WORKSPACE_ROOT" \
  "$STATE_FILE" >/dev/null; then
  jq -nc \
    --arg project_id "$PROJECT_ID" \
    --arg task_id "$TASK_ID" \
    '{status:"error",project_id:$project_id,task_id:$task_id,message:"Contrato completo inválido"}'
  exit 1
fi

jq -nc \
  --arg project_id "$PROJECT_ID" \
  --arg task_id "$TASK_ID" \
  --arg workspace_root "$WORKSPACE_ROOT" \
  --arg task_status "$(jq -r '.status' "$STATE_FILE")" \
  '{
    status:"success",
    project_id:$project_id,
    task_id:$task_id,
    workspace_root:$workspace_root,
    task_status:$task_status,
    contract_reviewed:true
  }'
