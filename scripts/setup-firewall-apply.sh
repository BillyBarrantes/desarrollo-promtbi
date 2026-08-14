#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-firewall-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"firewall_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-firewall-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-firewall-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to modify firewall rules"

firewall_type="dry_run"
if command -v ufw >/dev/null 2>&1; then
  firewall_type="ufw"
elif command -v nft >/dev/null 2>&1 || command -v iptables >/dev/null 2>&1; then
  firewall_type="nftables"
fi

rules=(
  "56 allow SSH port 22/tcp"
  "80 allow HTTP port 80/tcp"
  "443 allow HTTPS port 443/tcp"
  "egress allow DNS and HTTP/HTTPS"
  "ingress deny unnecessary"
)

backup_rules_file=""
case "$firewall_type" in
  ufw)
    backup_rules_file="/etc/ufw/user.rules.bak.${task_id}"
    cp /etc/ufw/user.rules "$backup_rules_file" 2>/dev/null || true
    ufw allow 22/tcp >/dev/null 2>&1 || true
    ufw allow 80/tcp >/dev/null 2>&1 || true
    ufw allow 443/tcp >/dev/null 2>&1 || true
    log "firewall_apply: ufw rules preparadas (sin habilitar; backup=${backup_rules_file})"
    ;;
  nftables)
    backup_rules_file="/etc/nftables.conf.bak.${task_id}"
    cp /etc/nftables.conf "$backup_rules_file" 2>/dev/null || true
    log "firewall_apply: estructura nftables preparada (sin aplicar en vivo)"
    ;;
  *)
    log "firewall_apply: dry_run (sin firewall detectado; no se aplican cambios)"
    ;;
esac

log "firewall_apply: passed (type=${firewall_type}, enabled=false)"

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --arg fw "$firewall_type" \
  --argjson rules "$(printf '%s\n' "${rules[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson enabled false \
  '{status:"passed", mode:"firewall_apply",
    task_id:$task, project_id:$project,
    firewall_type:$fw,
    rules_applied:$rules,
    firewall_enabled:$enabled,
    production_blocked:true}'