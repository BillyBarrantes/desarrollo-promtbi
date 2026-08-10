#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"
TASK_ID="${2:-}"
BASE_REF="${3:-}"

if [ -z "$PROJECT_ID" ] || [ -z "$TASK_ID" ] || [ -z "$BASE_REF" ]; then
  jq -nc '{status:"error",message:"Uso: review-security.sh <project_id> <task_id> <base_ref>"}'
  exit 1
fi

CONTRACT_OUTPUT="$(bash scripts/review-contract.sh "$PROJECT_ID" "$TASK_ID")"

if [ "$(jq -r '.status' <<<"$CONTRACT_OUTPUT")" != "success" ]; then
  printf '%s\n' "$CONTRACT_OUTPUT"
  exit 1
fi

mapfile -t CHANGED_FILES < <(
  {
    git diff --name-only "$BASE_REF"
    git ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u
)

ALLOWED_JSON="$(jq -c '.scope.allowed_paths' ".ops/state/${TASK_ID}.json")"
FORBIDDEN_JSON="$(jq -c '.scope.forbidden_paths' ".ops/state/${TASK_ID}.json")"

for file in "${CHANGED_FILES[@]}"; do
  if ! jq -n -e --arg file "$file" --argjson allowed "$ALLOWED_JSON" '
    any($allowed[]; . as $prefix | ($file == $prefix or ($file | startswith($prefix))))
  ' >/dev/null; then
    jq -nc --arg file "$file" \
      '{status:"error",security_reviewed:false,message:"Archivo fuera del alcance permitido",file:$file}'
    exit 1
  fi

  if jq -n -e --arg file "$file" --argjson forbidden "$FORBIDDEN_JSON" '
    any($forbidden[]; . as $prefix | ($file == $prefix or ($file | startswith($prefix))))
  ' >/dev/null; then
    jq -nc --arg file "$file" \
      '{status:"error",security_reviewed:false,message:"Archivo dentro de una ruta prohibida",file:$file}'
    exit 1
  fi
done

if git diff "$BASE_REF" -- . ':!scripts/review-security.sh' \
  | grep -E '^\+[^+].*(BEGIN .*PRIVATE KEY|AWS_SECRET_ACCESS_KEY|TELEGRAM_BOT_TOKEN|PASSWORD=|SECRET=)' \
  >/dev/null 2>&1; then
  jq -nc \
    '{status:"error",security_reviewed:false,message:"Posible secreto detectado en el diff"}'
  exit 1
fi

if ! git diff --check "$BASE_REF"; then
  jq -nc \
    '{status:"error",security_reviewed:false,message:"git diff --check falló"}'
  exit 1
fi

CHANGED_JSON="$(
  printf '%s\n' "${CHANGED_FILES[@]}" |
    jq -Rsc 'split("\n") | map(select(length > 0))'
)"

jq -nc \
  --arg project_id "$PROJECT_ID" \
  --arg task_id "$TASK_ID" \
  --arg base_ref "$BASE_REF" \
  --argjson changed_files "$CHANGED_JSON" \
  '{
    status:"success",
    project_id:$project_id,
    task_id:$task_id,
    base_ref:$base_ref,
    security_reviewed:true,
    changed_files:$changed_files,
    forbidden_paths_detected:false,
    secrets_detected:false
  }'
