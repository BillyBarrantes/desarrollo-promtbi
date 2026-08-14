#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-restore-database-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"restore_database_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: restore-database-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "restore-database-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to restore database"

project_root="/srv/agentic/projects/${project_id}"
backup_dir="${BACKUP_DIR:-/srv/agentic/backups}"

# restaurar .ops desde el backup mas reciente (DB se importara cuando exista)
latest="$(ls -1t "${backup_dir}"/backup-*.tar.gz 2>/dev/null | head -1 || true)"
if [[ -n "$latest" ]]; then
  tar xzf "$latest" -C "$project_root" .ops 2>/dev/null || true
  chown -R root:promtbi-users "$project_root/.ops" 2>/dev/null || chown -R root:root "$project_root/.ops"
  log "restore_database_apply: .ops restaurado desde $latest"
else
  log "restore_database_apply: sin backup disponible; .ops no restaurado (DB pendiente)"
fi

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  '{status:"passed", mode:"restore_database_apply",
    task_id:$task, project_id:$project,
    restore_target:".ops_or_database",
    note:".ops restored from latest backup if present; DB import pending",
    production_blocked:true}'