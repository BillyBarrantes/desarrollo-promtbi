#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", gate:"qa", reason:$reason}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] || fail "usage: run-qa.sh <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"

bash -n scripts/*.sh || fail "shell syntax validation failed"
git diff --check || fail "whitespace validation failed"

contract="$(scripts/review-contract.sh "$project_id" "$task_id")" || fail "contract gate failed"
security="$(scripts/review-security.sh "$project_id" "$task_id")" || fail "security gate failed"

jq -e '.status == "passed"' >/dev/null <<<"$contract" || fail "contract gate did not pass"
jq -e '.status == "passed"' >/dev/null <<<"$security" || fail "security gate did not pass"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  '{status:"passed", gate:"qa", project_id:$project, task_id:$task,
    checks:["bash -n","git diff --check","contract","security"]}'
