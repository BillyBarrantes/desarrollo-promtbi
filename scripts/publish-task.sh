#!/usr/bin/env bash
set -euo pipefail

STAGE=false
args=()
for a in "$@"; do
  if [[ "$a" == "--stage" ]]; then
    STAGE=true
  else
    args+=("$a")
  fi
done

project_id="${args[0]:-}"
task_id="${args[1]:-}"
LOG_DIR=".ops/logs"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"publish_task", reason:$reason}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "${LOG_DIR}/${task_id}-publish.log" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: publish-task.sh [--stage] <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  fail "not inside a git work tree"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$current_branch" == agent/* ]] ||
  fail "publish requires an agent branch (current=${current_branch})"

[[ -f "$state" ]] || fail "missing state file: $state"
status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] ||
  fail "task is not approved (status=${status})"

status_short="$(git status --short || true)"
files="$(git status --porcelain | awk '{print $2}')"

has_changes=false
[[ -n "$files" ]] && has_changes=true

staged=false
if [[ "$has_changes" == true && "$STAGE" == true ]]; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    git add -- "$f"
  done <<< "$files"
  staged=true
fi

files_json="$(printf '%s\n' "$files" | jq -R -s 'split("\n") | map(select(length > 0))')"

log "preparation_only: publish_task (approved; staged=${staged}, changes=${has_changes}; sin commit)"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg branch "$current_branch" \
  --argjson has_changes "$has_changes" \
  --argjson staged "$staged" \
  --argjson files "$files_json" \
  '{status:"preparation_only", action:"publish_task",
    project_id:$project, task_id:$task, current_branch:$branch,
    has_changes:$has_changes, staged:$staged, files:$files}'