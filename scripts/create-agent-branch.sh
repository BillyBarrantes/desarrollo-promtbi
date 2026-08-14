#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
LOG_DIR=".ops/logs"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"create_agent_branch", reason:$reason}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "${LOG_DIR}/${task_id}.log" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: create-agent-branch.sh <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  fail "not inside a git work tree"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
[[ -n "$current_branch" ]] || fail "not on a valid branch (detached HEAD?)"

[[ "$current_branch" == "main" || "$current_branch" == agent/* ]] ||
  fail "unsupported current branch: ${current_branch}"

suggested_branch="agent/${task_id}"

log "preparation_only: create_agent_branch (rama NO creada; sugerida=${suggested_branch})"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg branch "$current_branch" \
  --arg suggested "$suggested_branch" \
  '{status:"preparation_only", action:"create_agent_branch",
    project_id:$project, task_id:$task, current_branch:$branch,
    suggested_branch:$suggested}'