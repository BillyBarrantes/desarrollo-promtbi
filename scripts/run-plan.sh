#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
LOG_DIR=".ops/logs"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"run_plan", reason:$reason}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "${LOG_DIR}/${task_id}.log" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: run-plan.sh <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

log "preparation_only: run_plan (punto de planificacion; OpenCode NO fue invocado)"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  '{status:"preparation_only", action:"run_plan",
    project_id:$project, task_id:$task}'