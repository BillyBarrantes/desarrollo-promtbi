#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"
TASK_ID="${2:-}"
LOG_FILE=".ops/logs/${TASK_ID}-qa.log"
RESULTS_FILE="$(mktemp)"

cleanup() {
  rm -f "$RESULTS_FILE"
}
trap cleanup EXIT

if [ -z "$PROJECT_ID" ] || [ -z "$TASK_ID" ]; then
  jq -nc '{status:"error",message:"Uso: run-qa.sh <project_id> <task_id>"}'
  exit 1
fi

: > "$LOG_FILE"

run_check() {
  local name="$1"
  local directory="$2"
  shift 2

  printf '\n[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$name" >> "$LOG_FILE"

  if (cd "$directory" && "$@" >> "$OLDPWD/$LOG_FILE" 2>&1); then
    jq -nc --arg name "$name" \
      '{name:$name,status:"passed"}' >> "$RESULTS_FILE"
  else
    jq -nc --arg name "$name" \
      '{name:$name,status:"failed"}' >> "$RESULTS_FILE"
  fi
}

run_check "frontend_lint" frontend npm run lint
run_check "frontend_typecheck" frontend npm run typecheck
run_check "frontend_format_check" frontend npm run format:check
run_check "frontend_unit" frontend npm run unit
run_check "frontend_e2e" frontend npm run e2e

if [ -x backend/.venv/bin/python ]; then
  run_check "backend_pytest" backend .venv/bin/python -m pytest -q
else
  jq -nc \
    '{name:"backend_pytest",status:"failed",message:"No existe backend/.venv/bin/python"}' \
    >> "$RESULTS_FILE"
fi

CHECKS="$(jq -s '.' "$RESULTS_FILE")"

if jq -e 'any(.[]; .status == "failed")' <<<"$CHECKS" >/dev/null; then
  FINAL_STATUS="failed"
else
  FINAL_STATUS="passed"
fi

jq -nc \
  --arg project_id "$PROJECT_ID" \
  --arg task_id "$TASK_ID" \
  --arg status "$FINAL_STATUS" \
  --arg log_file "$LOG_FILE" \
  --argjson checks "$CHECKS" \
  '{
    status:$status,
    project_id:$project_id,
    task_id:$task_id,
    qa_executed:true,
    log_file:$log_file,
    checks:$checks
  }'
