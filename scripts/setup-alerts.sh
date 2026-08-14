#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
mode="${3:-}"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"setup_alerts", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-alerts.sh <project_id> <task_id> --dry-run"
[[ "$mode" == "--dry-run" ]] || fail "only --dry-run mode is supported (no real alerts)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-alerts requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

alerts=(
  "bucles (ejecuciones repetidas)"
  "costes excesivos"
  "fallos de despliegue"
  "locks expirados"
  "errores por agente"
)

jq -cn \
  --argjson alerts "$(printf '%s\n' "${alerts[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --arg project_id "$project_id" \
  --arg task_id "$task_id" \
  '{status:"preparation_only", action:"setup_alerts",
    mode:"dry_run",
    project_id:$project_id,
    task_id:$task_id,
    alerts_to_configure:$alerts,
    notification_channel:"telegram",
    note:"no real alerts configured in dry-run",
    production_blocked:true}'