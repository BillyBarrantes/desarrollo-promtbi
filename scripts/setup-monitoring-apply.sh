#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-monitoring-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"monitoring_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-monitoring-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-monitoring-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to install healthcheck script"

hc_script="/usr/local/bin/agentic-healthcheck.sh"
metrics_dir="/srv/agentic/metrics"

mkdir -p "$metrics_dir"
chown root:root "$metrics_dir"
chmod 750 "$metrics_dir"

cat > "$hc_script" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

METRICS_DIR="${METRICS_DIR:-/srv/agentic/metrics}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$METRICS_DIR/health-${STAMP}.json"

mkdir -p "$METRICS_DIR"

cpu="$(top -bn1 | awk '/%Cpu/ {print int($2+0)}' || echo 0)"
mem="$(free -m | awk 'NR==2 {print int($3*100/$2+0)}' || echo 0)"
disk="$(df -P / | awk 'NR==2 {gsub("%",""); print $5}' || echo 0)"

ssh_ok="false"
http_ok="false"
db_ok="false"

if command -v ssh >/dev/null 2>&1; then ssh_ok="true"; fi
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -m 5 -o /dev/null "http://localhost/" 2>/dev/null; then http_ok="true"; fi
fi

# DB check: only when a DB is present (placeholder for now)
if command -v pg_isready >/dev/null 2>&1; then
  if pg_isready -q; then db_ok="true"; fi
fi

jq -cn \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg cpu "$cpu" --arg mem "$mem" --arg disk "$disk" \
  --arg ssh "$ssh_ok" --arg http "$http_ok" --arg db "$db_ok" \
  '{ts:$ts, cpu_pct:($cpu|tonumber), mem_pct:($mem|tonumber), disk_pct:($disk|tonumber),
    healthchecks:{ssh:($ssh=="true"), http:($http=="true"), db:($db=="true")}}' \
  > "$OUT"

echo "healthcheck ok: $OUT"
EOF

chown root:root "$hc_script"
chmod 750 "$hc_script"

log "monitoring_apply: /usr/local/bin/agentic-healthcheck.sh y /srv/agentic/metrics listos. NO se instaló Prometheus/Grafana."

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  '{status:"passed", mode:"monitoring_apply",
    task_id:$task, project_id:$project,
    healthcheck_script:"/usr/local/bin/agentic-healthcheck.sh",
    metrics_directory:"/srv/agentic/metrics",
    note:"healthcheck script installed; no monitoring stack installed",
    production_blocked:true}'