#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"release_status", reason:$reason}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: release-status.sh <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  fail "not inside a git work tree"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
status_short="$(git status --porcelain || true)"

has_changes=false
[[ -n "$status_short" ]] && has_changes=true

clean_worktree=false
[[ -z "$status_short" ]] && clean_worktree=true

if [[ -f "$state" ]]; then
  status="$(jq -r '.status // "unknown"' "$state")"
else
  status="not_found"
fi

ready_for_publish=false
[[ "$status" == "approved" && "$has_changes" == true ]] &&
  ready_for_publish=true

files="$(git status --porcelain | awk '{print $2}')"
files_json="$(printf '%s\n' "$files" | jq -R -s 'split("\n") | map(select(length > 0))')"

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --arg branch "$current_branch" \
  --arg state_status "$status" \
  --argjson has_changes "$has_changes" \
  --argjson ready_for_publish "$ready_for_publish" \
  --argjson clean_worktree "$clean_worktree" \
  --argjson files "$files_json" \
  '{task_id:$task, project_id:$project, branch:$branch, state_status:$state_status,
    flags:{has_changes:$has_changes, ready_for_publish:$ready_for_publish, clean_worktree:$clean_worktree},
    files:$files}'