#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
target="${3:-}"
approval="${4:-}"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", gate:"rollback", reason:$reason}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" && -n "$target" ]] ||
  fail "usage: rollback-gate.sh <project_id> <task_id> staging APPROVED"

[[ "$target" == "staging" ]] ||
  fail "rollback is restricted to staging"

[[ "$approval" == "APPROVED" ]] ||
  fail "explicit rollback approval is required"

command -v jq >/dev/null 2>&1 || fail "jq is required"

branch="$(git branch --show-current)"
[[ "$branch" == agent/*/"$task_id"-* ]] ||
  fail "rollback requires an isolated task branch"

[[ "$branch" != "main" && "$branch" != "develop" ]] ||
  fail "rollback from protected branch is denied"

scripts/run-qa.sh "$project_id" "$task_id" >/dev/null ||
  fail "QA gate must pass before rollback preparation"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg target "$target" \
  --arg branch "$branch" \
  '{status:"passed", gate:"rollback",
    action:"rollback-preparation-only",
    target:$target, production:"blocked",
    project_id:$project, task_id:$task, branch:$branch}'
