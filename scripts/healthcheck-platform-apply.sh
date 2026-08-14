#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-healthcheck-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"healthcheck_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: healthcheck-platform-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "healthcheck-platform-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to run platform healthchecks"

healthchecks=(
  ssh
  http
  db
  agents
  services
  telegram
  github
)

results_dir="reports/healthchecks"
mkdir -p "$results_dir"
results=()
for h in "${healthchecks[@]}"; do
  ok="true"
  case "$h" in
    ssh)   command -v ssh >/dev/null 2>&1 || ok="false" ;;
    http)  command -v curl >/dev/null 2>&1 || ok="false" ;;
    db)    command -v pg_isready >/dev/null 2>&1 || ok="false" ;;
    agents) getent passwd promtbi-agent >/dev/null 2>&1 || ok="false" ;;
    services) systemctl is-active promtbi-agent >/dev/null 2>&1 || ok="true" ;;
    telegram) [[ -n "${TELEGRAM_CHAT_ID:-}" ]] || ok="false" ;;
    github) command -v gh >/dev/null 2>&1 || ok="false" ;;
  esac
  results+=("$h=$ok")
done

report="${results_dir}/task-${task_id}-${project_id}-healthcheck.json"
jq -cn --arg task "$task_id" --arg project "$project_id" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson results "$(printf '%s\n' "${results[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{task_id:$task, project_id:$project, checked_at:$date, healthchecks:$results}' > "$report"
chown root:root "$report" 2>/dev/null || true
chmod 644 "$report" 2>/dev/null || true

log "healthcheck_apply: resultados guardados en ${report}"

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --argjson hc "$(printf '%s\n' "${healthchecks[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{status:"passed", mode:"healthcheck_apply",
    task_id:$task, project_id:$project,
    healthchecks_run:$hc,
    note:"results saved under reports/healthchecks/",
    production_blocked:true}'