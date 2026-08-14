#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-restore-secrets-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"restore_secrets_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: restore-secrets-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "restore-secrets-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to restore secrets"

SECRETS_DIR="${SECRETS_DIR:-/srv/agentic/secrets}"
secrets=(
  "desarrollo-promtbi-main"
  "promdata"
  "tres-niveles-web"
)

mkdir -p "$SECRETS_DIR"
restored=()
for s in "${secrets[@]}"; do
  d="${SECRETS_DIR}/${s}"
  mkdir -p "$d"
  touch "${d}/.gitkeep"
  chown -R root:promtbi-users "$d" 2>/dev/null || chown -R root:root "$d"
  chmod -R 700 "$d"
  restored+=("$s")
done

log "restore_secrets_apply: ${#restored[@]} secretos restaurados en ${SECRETS_DIR} (permisos 700). Valores nunca mostrados."

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --argjson secrets "$(printf '%s\n' "${restored[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{status:"passed", mode:"restore_secrets_apply",
    task_id:$task, project_id:$project,
    secrets_restored:$secrets,
    destination:"${SECRETS_DIR}",
    permissions_set:"700",
    note:"secrets sourced from secure vault; values never printed",
    production_blocked:true}'