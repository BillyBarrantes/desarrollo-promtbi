#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
target="${3:-}"
approval="${4:-}"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", gate:"staging", reason:$reason}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" && -n "$target" ]] ||
  fail "usage: staging-gate.sh <project_id> <task_id> staging APPROVED"

[[ "$target" == "staging" ]] || fail "only staging deployment is allowed"
[[ "$approval" == "APPROVED" ]] || fail "explicit staging approval is required"
command -v jq >/dev/null 2>&1 || fail "jq is required"

branch="$(git branch --show-current)"
[[ "$branch" == agent/*/"$task_id"-* ]] ||
  fail "staging gate requires an isolated task branch"

scripts/release-gate.sh "$project_id" "$task_id" APPROVED >/dev/null ||
  fail "release gate must pass before staging"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg branch "$branch" \
  '{status:"passed", gate:"staging", action:"staging-only",
    target:"staging", production:"blocked",
    project_id:$project, task_id:$task, branch:$branch}'
