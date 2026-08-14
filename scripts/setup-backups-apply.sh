#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-backups-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"backups_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-backups-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-backups-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to install backup script"

backup_dir="/srv/agentic/backups"
backup_script="/usr/local/bin/agentic-backup.sh"
project_root="/srv/agentic/projects/${project_id}"

mkdir -p "$backup_dir"
chown root:root "$backup_dir"
chmod 750 "$backup_dir"

cat > "$backup_script" <<EOF
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="\${PROJECT_ROOT:-/srv/agentic/projects/${project_id}}"
DEST="\${BACKUP_DEST:-/srv/agentic/backups}"
RETAIN_DAYS="\${RETAIN_DAYS:-30}"
STAMP="\$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "\$DEST"
ARCHIVE="\$DEST/backup-\${STAMP}.tar.gz"

# back up .ops/, secrets/, workspaces/ (DB included later when present)
tar czf "\$ARCHIVE" \\
  -C "\$PROJECT_ROOT" .ops \\
  -C /srv/agentic secrets \\
  -C /srv/agentic workspaces 2>/dev/null

# purge backups older than RETAIN_DAYS
find "\$DEST" -name 'backup-*.tar.gz' -mtime +"\$RETAIN_DAYS" -delete

echo "backup ok: \$ARCHIVE"
EOF

chown root:root "$backup_script"
chmod 750 "$backup_script"

log "backups_apply: /srv/agentic/backups y /usr/local/bin/agentic-backup.sh listos. NO se ejecutó backup."

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  '{status:"passed", mode:"backups_apply",
    task_id:$task, project_id:$project,
    backup_directory:"/srv/agentic/backups",
    backup_script:"/usr/local/bin/agentic-backup.sh",
    retention_days:30,
    note:"backup script installed; NOT executed",
    production_blocked:true}'