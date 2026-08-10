#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"
TASK_ID="${2:-}"
BASE_REF="${3:-}"
TARGET_BRANCH="${4:-$BASE_REF}"

if [ -z "$PROJECT_ID" ] || [ -z "$TASK_ID" ] || [ -z "$BASE_REF" ]; then
  jq -nc '{status:"error",message:"Uso: open-pr.sh <project_id> <task_id> <base_ref> [target_branch]"}'
  exit 1
fi

STATE_FILE=".ops/state/${TASK_ID}.json"

if [ ! -f "$STATE_FILE" ]; then
  jq -nc --arg task_id "$TASK_ID" \
    '{status:"error",task_id:$task_id,message:"Estado de tarea inexistente"}'
  exit 1
fi

CONTRACT="$(bash scripts/review-contract.sh "$PROJECT_ID" "$TASK_ID")"
if [ "$(jq -r '.status' <<<"$CONTRACT")" != "success" ]; then
  printf '%s\n' "$CONTRACT"
  exit 1
fi

if [ "$(jq -r '.status' "$STATE_FILE")" != "awaiting_approval" ]; then
  jq -nc --arg status "$(jq -r '.status' "$STATE_FILE")" \
    '{status:"error",message:"La tarea no está en awaiting_approval",task_status:$status}'
  exit 1
fi

if ! jq -e '
  (.checks | type == "object")
  and (all(.checks[]; . == "passed"))
' "$STATE_FILE" >/dev/null; then
  jq -nc \
    '{status:"error",message:"QA incompleto o con checks fallidos"}'
  exit 1
fi

SECURITY="$(bash scripts/review-security.sh "$PROJECT_ID" "$TASK_ID" "$BASE_REF")"
if [ "$(jq -r '.status' <<<"$SECURITY")" != "success" ]; then
  printf '%s\n' "$SECURITY"
  exit 1
fi

if ! git diff --check "$BASE_REF"; then
  jq -nc '{status:"error",message:"git diff --check falló"}'
  exit 1
fi

mapfile -t CHANGED_FILES < <(
  {
    git diff --name-only "$BASE_REF"
    git ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u
)

FILES_JSON="$(
  printf '%s\n' "${CHANGED_FILES[@]}" |
    jq -Rsc 'split("\n") | map(select(length > 0))'
)"

TITLE="$(jq -r '.title' "$STATE_FILE")"
SUMMARY="$(jq -r '.goal' "$STATE_FILE")"

jq -nc \
  --arg project_id "$PROJECT_ID" \
  --arg task_id "$TASK_ID" \
  --arg base_ref "$BASE_REF" \
  --arg target_branch "$TARGET_BRANCH" \
  --arg title "$TITLE" \
  --arg summary "$SUMMARY" \
  --argjson changed_files "$FILES_JSON" \
  '{
    status:"proposal",
    project_id:$project_id,
    task_id:$task_id,
    base_ref:$base_ref,
    target_branch:$target_branch,
    title:$title,
    summary:$summary,
    qa_approved:true,
    security_reviewed:true,
    push_executed:false,
    remote_pr_created:false,
    merge_executed:false,
    changed_files:$changed_files,
    next_action:"human_approval_required"
  }'
