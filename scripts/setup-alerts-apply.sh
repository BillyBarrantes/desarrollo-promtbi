#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-alerts-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"alerts_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-alerts-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-alerts-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to install alerts script"

alerts_script="/usr/local/bin/agentic-alerts.sh"
project_root="/srv/agentic/projects/${project_id}"

cat > "$alerts_script" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Detection helpers; reads only, never sends secrets.
PROJECT_ROOT="${PROJECT_ROOT:-/srv/agentic/projects/desarrollo-promtbi-main}"
LOG_DIR="${PROJECT_ROOT}/.ops/logs"
LOCKS_DIR="${PROJECT_ROOT}/.ops/locks"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
ALERT_CHANNEL="${ALERT_CHANNEL:-telegram}"

notify() {
  local kind="$1" detail="$2"
  if [[ -n "$TELEGRAM_CHAT_ID" && -n "$TELEGRAM_BOT_TOKEN" ]]; then
    curl -fsS -m 10 \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=agentic-alert [${kind}]: ${detail}" \
      >/dev/null 2>&1 || true
  else
    echo "alert [${kind}]: ${detail}"
  fi
}

# 1) bucles: ejecuciones repetidas del mismo agente/tarea
detect_loops() {
  local count
  count="$(grep -ric 'rerun\|repeated' "${LOG_DIR}" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')"
  if [[ "${count}" -gt "${LOOP_THRESHOLD:-20}" ]]; then
    notify "loop" "alto volumen de ejecuciones repetidas (${count})"
  fi
}

# 2) costes excesivos (registros de coste si existen)
detect_costs() {
  local cost_file="${PROJECT_ROOT}/.ops/costs/cost_records.ndjson"
  if [[ -f "$cost_file" ]]; then
    local total
    total="$(awk '{s+=$NF} END{print s+0}' "$cost_file")"
    if [[ "${total}" -gt "${COST_THRESHOLD:-1000}" ]]; then
      notify "cost" "coste acumulado alto: ${total}"
    fi
  fi
}

# 3) fallos de despliegue
detect_deploys() {
  local fails
  fails="$(grep -ric 'deploy.*failed\|rollback.*failed' "${LOG_DIR}" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')"
  if [[ "${fails}" -gt 0 ]]; then
    notify "deploy_failure" "se detectaron ${fails} fallos de despliegue"
  fi
}

# 4) locks expirados
detect_locks() {
  local now
  now="$(date -u +%s)"
  local f
  for f in "${LOCKS_DIR}"/*.json; do
    [[ -f "$f" ]] || continue
    local exp
    exp="$(jq -r '.expires_at // 0' "$f" 2>/dev/null)"
    if [[ "$now" -ge "$exp" ]]; then
      notify "expired_lock" "lock vencido: $(basename "$f")"
    fi
  done
}

detect_loops
detect_costs
detect_deploys
detect_locks

echo "alerts scan ok"
EOF

chown root:root "$alerts_script"
chmod 750 "$alerts_script"

log "alerts_apply: /usr/local/bin/agentic-alerts.sh listo. NO se configuró cron."

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  '{status:"passed", mode:"alerts_apply",
    task_id:$task, project_id:$project,
    alerts_script:"/usr/local/bin/agentic-alerts.sh",
    notification_channel:"telegram",
    note:"alerts script installed; no cron configured",
    production_blocked:true}'