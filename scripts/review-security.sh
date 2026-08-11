#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", gate:"security", reason:$reason}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] || fail "usage: review-security.sh <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"

branch="$(git branch --show-current)"
[[ "$branch" == agent/*/"$task_id"-* ]] || fail "changes must run on an isolated task branch"
[[ "$branch" != "main" && "$branch" != "develop" ]] || fail "direct work on protected branch"

forbidden_status="$(git status --porcelain=v1 | awk '{print $2}' | grep -E '^(backend/|frontend/|infra/production/|\.env($|\.)|secrets/|node_modules/|dist/)' || true)"
[[ -z "$forbidden_status" ]] || fail "forbidden path detected: $forbidden_status"

dangerous="$(git diff --no-ext-diff -- . ':!scripts/review-security.sh' | grep -Eiq \
  '(^|[^A-Za-z])(DROP[[:space:]]+DATABASE|TRUNCATE[[:space:]]+TABLE|rm[[:space:]]+-rf[[:space:]]+/( |$)|kubectl[[:space:]].*production|deploy[[:space:]].*production)([^A-Za-z]|$)' && echo detected || true)"
[[ -z "$dangerous" ]] || fail "dangerous production or destructive command detected"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg branch "$branch" \
  '{status:"passed", gate:"security", project_id:$project, task_id:$task, branch:$branch}'
