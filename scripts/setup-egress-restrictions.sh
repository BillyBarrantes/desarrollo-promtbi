#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-egress-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"egress_restrictions_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-egress-restrictions.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-egress-restrictions requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to configure egress rules"

firewall_type="dry_run"
if command -v ufw >/dev/null 2>&1; then
  firewall_type="ufw"
elif command -v nft >/dev/null 2>&1 || command -v iptables >/dev/null 2>&1; then
  firewall_type="nftables"
fi

rules=(
  "OUTPUT ALLOW port 53/udp (DNS)"
  "OUTPUT ALLOW port 53/tcp (DNS)"
  "OUTPUT ALLOW port 80/tcp (HTTP)"
  "OUTPUT ALLOW port 443/tcp (HTTPS)"
  "OUTPUT ALLOW api.github.com"
  "OUTPUT ALLOW api.telegram.org"
  "OUTPUT DENY all other for users promtbi-*"
)

case "$firewall_type" in
  ufw)
    log "egress_restrictions_apply: ufw reglas de egress preparadas (no habilitadas; paso manual)"
    ;;
  nftables)
    log "egress_restrictions_apply: estructura nftables preparada (no aplicada en vivo; paso manual)"
    ;;
  *)
    log "egress_restrictions_apply: dry_run (sin firewall detectado; reglas generadas para revision manual)"
    ;;
esac

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --arg fw "$firewall_type" \
  --argjson rules "$(printf '%s\n' "${rules[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson enabled false \
  '{status:"passed", mode:"egress_restrictions_apply",
    task_id:$task, project_id:$project,
    firewall_type:$fw,
    egress_rules_applied:$rules,
    firewall_enabled:$enabled,
    note:"firewall must be enabled manually with human approval",
    production_blocked:true}'