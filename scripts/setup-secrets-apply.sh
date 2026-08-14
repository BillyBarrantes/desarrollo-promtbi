#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-secrets-apply.log"
SECRETS_ROOT="/srv/agentic/secrets"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"secrets_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-secrets-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-secrets-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to create secrets layout"

dirs=(
  "${SECRETS_ROOT}/desarrollo-promtbi-main"
  "${SECRETS_ROOT}/promdata"
  "${SECRETS_ROOT}/tres-niveles-web"
)

created_dirs=()
for d in "${dirs[@]}"; do
  if [[ ! -d "$d" ]]; then
    mkdir -p "$d"
    created_dirs+=("$d")
  fi
  touch "${d}/.gitkeep"
  chown root:promtbi-users "$d" 2>/dev/null || chown root:root "$d" 2>/dev/null || true
  chmod 700 "$d"
done

log "secrets_apply: layout creado (${#created_dirs[@]} dirs nuevos; placeholders .gitkeep; perms 700)"

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --argjson dirs "$(printf '%s\n' "${created_dirs[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{status:"passed", mode:"secrets_apply",
    task_id:$task, project_id:$project,
    directories_created:$dirs,
    permissions_set:"700",
    note:"only empty placeholders created; no real secrets",
    production_blocked:true}'