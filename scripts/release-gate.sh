#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
approval="${3:-}"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", gate:"release", reason:$reason}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] || fail "usage: release-gate.sh <project_id> <task_id> APPROVED"
[[ "$approval" == "APPROVED" ]] || fail "explicit release approval is required"
command -v jq >/dev/null 2>&1 || fail "jq is required"

branch="$(git branch --show-current)"
[[ "$branch" == agent/*/"$task_id"-* ]] || fail "release must run from isolated task branch"
[[ "$branch" != "main" && "$branch" != "develop" ]] || fail "protected branch release denied"

state=".ops/state/${task_id}.json"
[[ -f "$state" ]] || fail "missing state file: $state"

jq -e \
  --arg project "$project_id" \
  --arg task "$task_id" '
  .project_id == $project and
  .task_id == $task and
  .approval_required == true
' "$state" >/dev/null 2>&1 || fail "invalid release approval policy"

scripts/run-qa.sh "$project_id" "$task_id" >/dev/null ||
  fail "QA gate must pass before release"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg branch "$branch" \
  '{status:"passed", gate:"release", action:"release-candidate-only",
    production:"blocked", project_id:$project, task_id:$task, branch:$branch}'
