#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
LOG_DIR=".ops/logs"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"create_pull_request", reason:$reason}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "${LOG_DIR}/${task_id}.log" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: create-pull-request.sh <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  fail "not inside a git work tree"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$current_branch" == agent/* ]] ||
  fail "pull requests require an agent branch (current=${current_branch})"

changed="$(git status --porcelain || true)"

has_changes=false
[[ -n "$changed" ]] && has_changes=true

log "preparation_only: create_pull_request (has_changes=${has_changes}; gh NO fue invocado)"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg branch "$current_branch" \
  --argjson has_changes "$has_changes" \
  '{status:"preparation_only", action:"create_pull_request",
    project_id:$project, task_id:$task, current_branch:$branch,
    has_changes:$has_changes}'