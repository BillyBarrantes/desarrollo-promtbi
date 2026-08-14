#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
mode="${3:-}"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"setup_logrotate", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-logrotate.sh <project_id> <task_id> --dry-run"
[[ "$mode" == "--dry-run" ]] || fail "only --dry-run mode is supported (no real logrotate config)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-logrotate requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

logs=(
  ".ops/logs/*.log"
  "/var/log/agentic/*.log"
)

jq -cn \
  --argjson logs "$(printf '%s\n' "${logs[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --arg project_id "$project_id" \
  --arg task_id "$task_id" \
  '{status:"preparation_only", action:"setup_logrotate",
    mode:"dry_run",
    project_id:$project_id,
    task_id:$task_id,
    logs_to_rotate:$logs,
    rotation_frequency:"daily",
    retention_days:7,
    compression:"gzip",
    note:"no /etc/logrotate.d/ changes will be applied in dry-run",
    production_blocked:true}'