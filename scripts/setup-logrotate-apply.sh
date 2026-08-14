#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-logrotate-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"logrotate_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-logrotate-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-logrotate-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to configure logrotate"

config_file="/etc/logrotate.d/agentic"
project_logs="/srv/agentic/projects/${project_id}/.ops/logs/*.log"

umask 022
cat > "$config_file" <<EOF
/var/log/agentic/*.log ${project_logs} {
    daily
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
    su root root
}
EOF

log "logrotate_apply: /etc/logrotate.d/agentic escrito (daily, rotate 7, gzip). NO se ejecutó logrotate."

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  '{status:"passed", mode:"logrotate_apply",
    task_id:$task, project_id:$project,
    config_file:"/etc/logrotate.d/agentic",
    rotation_frequency:"daily",
    retention_days:7,
    compression:"gzip",
    note:"config installed; logrotate NOT executed",
    production_blocked:true}'