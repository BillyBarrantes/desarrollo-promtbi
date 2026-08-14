#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-backup-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"backup_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: backup-platform-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "backup-platform-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to run platform backup"

PROJECTS_ROOT="${PROJECTS_ROOT:-/srv/agentic/projects}"
SECRETS_DIR="${SECRETS_DIR:-/srv/agentic/secrets}"
BACKUP_DIR="${BACKUP_DIR:-/srv/agentic/backups}"
CONFIG_DIR="${CONFIG_DIR:-/etc/agentic}"
DEFAULT_HOME="${BACKUP_DIR}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${BACKUP_DIR}/platform-backup-${STAMP}.tar.gz"

sources=(proyectos secretos servicios .ops_o_db configs)

tar czf "$ARCHIVE" \
  -C "$PROJECTS_ROOT" . \
  -C "$SECRETS_DIR" . \
  -C /etc/systemd/system promtbi-* 2>/dev/null || true

# retención: mantener hasta 30 dias
find "$BACKUP_DIR" -name 'platform-backup-*.tar.gz' -mtime +30 -delete

chown root:root "$ARCHIVE"
chmod 640 "$ARCHIVE"

log "backup_apply: backup integral en ${ARCHIVE}"

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --argjson sources "$(printf '%s\n' "${sources[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --arg archive "$ARCHIVE" \
  '{status:"passed", mode:"backup_apply",
    task_id:$task, project_id:$project,
    backup_sources:$sources,
    destination:"${BACKUP_DIR}",
    backup_archive:$archive,
    note:"platform backup created; retention 30 days",
    production_blocked:true}'