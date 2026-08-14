#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-workspace-apply.log"
WORKSPACES_ROOT="/srv/agentic/workspaces"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"workspace_isolation_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-workspace-isolation.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-workspace-isolation requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to set workspace permissions"

workspaces=(
  "${WORKSPACES_ROOT}/desarrollo-promtbi-main"
  "${WORKSPACES_ROOT}/promdata"
  "${WORKSPACES_ROOT}/tres-niveles-web"
)

created_ws=()
for w in "${workspaces[@]}"; do
  if [[ ! -d "$w" ]]; then
    mkdir -p "$w"
    created_ws+=("$w")
  fi
  chown promtbi-agent:promtbi-users "$w" 2>/dev/null || chown root:root "$w" 2>/dev/null || true
  chmod 750 "$w"
done

log "workspace_isolation_apply: workspaces preparados (${#created_ws[@]} nuevos; perms 750)"

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --argjson ws "$(printf '%s\n' "${created_ws[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{status:"passed", mode:"workspace_isolation_apply",
    task_id:$task, project_id:$project,
    workspaces_created:$ws,
    permissions_set:"750",
    note:"no real data moved yet",
    production_blocked:true}'