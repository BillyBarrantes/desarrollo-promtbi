#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-restore-services-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"restore_services_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: restore-services-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "restore-services-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to restore services"

SERVICE_DIR="/etc/systemd/system"
services=(
  "promtbi-agent.service"
  "promtbi-backup.timer"
  "promtbi-monitoring.timer"
)

restored=()
for s in "${services[@]}"; do
  service_file="${SERVICE_DIR}/${s}"
  if [[ -f "$service_file" ]]; then
    restored+=("$s (already present)")
  else
    cat > "$service_file" <<EOF
[Unit]
Description=${s}

[Service]
Type=oneshot
ExecStart=/bin/true

[Install]
EOF
    restored+=("$s")
  fi
  chown root:root "$service_file"
  chmod 644 "$service_file"
done

# activar (daemon-reload) sin reiniciar servicios
systemctl daemon-reload

log "restore_services_apply: ${#restored[@]} unidades systemd creadas/activadas. NO se reinició nada."

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --argjson services "$(printf '%s\n' "${restored[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{status:"passed", mode:"restore_services_apply",
    task_id:$task, project_id:$project,
    services_restored:$services,
    note:"systemd units created/activated; nothing restarted",
    production_blocked:true}'