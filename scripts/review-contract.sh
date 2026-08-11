#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", gate:"contract", reason:$reason}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] || fail "usage: review-contract.sh <project_id> <task_id>"
[[ -f "$state" ]] || fail "missing state file: $state"
command -v jq >/dev/null 2>&1 || fail "jq is required"

jq -e \
  --arg project "$project_id" \
  --arg task "$task_id" '
  .schema_version == 2 and
  .project_id == $project and
  .task_id == $task and
  (.status | IN("new","planning","ready","qa","blocked")) and
  (.current_agent | type == "string" and length > 0) and
  (.approval_required | type == "boolean") and
  (.retries | type == "number" and . >= 0 and . <= 3) and
  (.modified_files | type == "array") and
  (.acceptance_criteria | type == "array" and length > 0) and
  (.required_checks | type == "array" and length > 0)
' "$state" >/dev/null 2>&1 || fail "invalid task state contract"

branch="$(git branch --show-current)"
expected="agent/release-supervisor/${task_id}-fase-8-5"

[[ "$branch" == "$expected" ]] || fail "wrong branch: expected $expected, got $branch"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg branch "$branch" \
  '{status:"passed", gate:"contract", project_id:$project, task_id:$task, branch:$branch}'
