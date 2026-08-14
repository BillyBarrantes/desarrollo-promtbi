#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-ssh-apply.log"
SSHD_CONFIG="/etc/ssh/sshd_config"
BACKUP_FILE="/etc/ssh/sshd_config.bak.${task_id}"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"ssh_harden_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

set_ssh_option() {
  local key="$1"; local value="$2"
  if [[ -f "$SSHD_CONFIG" ]]; then
    if grep -qE "^\s*#?\s*${key}\s" "$SSHD_CONFIG"; then
      sed -i "s|^\(\s*#\?\s*\)${key}\s.*|${key} ${value}|" "$SSHD_CONFIG"
    else
      printf '%s %s\n' "$key" "$value" >> "$SSHD_CONFIG"
    fi
  fi
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: harden-ssh-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "harden-ssh-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to modify sshd_config"
[[ -f "$SSHD_CONFIG" ]] || fail "missing ${SSHD_CONFIG}"
command -v sshd >/dev/null 2>&1 || fail "sshd binary not found"

cp "$SSHD_CONFIG" "$BACKUP_FILE"
log "ssh_harden_apply: backup creado en ${BACKUP_FILE}"

set_ssh_option "PermitRootLogin" "no"
set_ssh_option "PasswordAuthentication" "no"
set_ssh_option "PubkeyAuthentication" "yes"

if grep -qE "^\s*AllowUsers\s" "$SSHD_CONFIG"; then
  sed -i "s|^\(\s*\)AllowUsers\s.*|AllowUsers promtbi-bot promtbi-agent|" "$SSHD_CONFIG"
else
  printf '%s\n' "AllowUsers promtbi-bot promtbi-agent" >> "$SSHD_CONFIG"
fi

if grep -qE "^\s*AllowGroups\s" "$SSHD_CONFIG"; then
  sed -i "s|^\(\s*\)AllowGroups\s.*|AllowGroups promtbi-users|" "$SSHD_CONFIG"
else
  printf '%s\n' "AllowGroups promtbi-users" >> "$SSHD_CONFIG"
fi

config_valid=false
if sshd -t >/dev/null 2>&1; then
  config_valid=true
fi
[[ "$config_valid" == "true" ]] || fail "sshd config syntax invalid"

log "ssh_harden_apply: passed (config_valid=true, ssh_restarted=false)"

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --arg backup "$BACKUP_FILE" \
  --argjson config_valid "$config_valid" \
  --argjson restarted false \
  '{status:"passed", mode:"ssh_harden_apply",
    task_id:$task, project_id:$project,
    backup_file:$backup,
    config_valid:$config_valid,
    ssh_restarted:$restarted,
    production_blocked:true}'