#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
LOG_DIR=".ops/logs"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"deploy_staging", reason:$reason}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "${LOG_DIR}/${task_id}.log" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: deploy-staging.sh <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == agent/* ]] ||
  fail "staging deploy requires an agent branch (current=${current_branch})"

log "preparation_only: deploy_staging (sin deploy real; branch=${current_branch})"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg branch "$current_branch" \
  '{status:"preparation_only", action:"deploy_staging", target:"staging",
    project_id:$project, task_id:$task, current_branch:$branch}'