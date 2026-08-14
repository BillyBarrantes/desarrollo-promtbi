#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
mode="${3:-}"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"run_baseline_promdata", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: run-baseline-promdata.sh <project_id> <task_id> --dry-run"
[[ "$mode" == "--dry-run" ]] || fail "only --dry-run mode is supported (no real baseline)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "run-baseline-promdata requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

checks=(
  "lint"
  "typecheck"
  "tests"
  "build"
  "e2e"
  "screenshots"
  "security_scan"
  "healthcheck"
)

jq -cn \
  --argjson checks "$(printf '%s\n' "${checks[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --arg project_id "$project_id" \
  --arg task_id "$task_id" \
  '{status:"preparation_only", action:"run_baseline_promdata",
    mode:"dry_run",
    project_id:$project_id,
    task_id:$task_id,
    baseline_checks:$checks,
    approval_rule:"no approval if any check omitted or no evidence",
    note:"no real commands executed in dry-run",
    production_blocked:true}'