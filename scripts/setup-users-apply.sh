#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-users-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"users_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-users-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-users-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to apply system user changes"
[[ -e /etc/passwd && -e /etc/group ]] || fail "system user databases not readable"

group_to_create="promtbi-users"
users_to_create=("promtbi-bot" "promtbi-agent")

created_users=()
created_group=""
for g in "$group_to_create"; do
  if ! getent group "$g" >/dev/null 2>&1; then
    groupadd "$g"
    created_group="$g"
  fi
done
for u in "${users_to_create[@]}"; do
  if ! getent passwd "$u" >/dev/null 2>&1; then
    useradd -s /usr/sbin/nologin -g "$group_to_create" "$u"
    created_users+=("$u")
  fi
  usermod -a -G "$group_to_create" "$u" 2>/dev/null || true
done

if [[ -n "$created_group" ]]; then
  log "users_apply: created group ${created_group}"
fi
for u in "${created_users[@]}"; do
  log "users_apply: created user ${u}"
done
log "users_apply: passed (groups=${created_group:-none}, users=${created_users[*]:-none})"

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --argjson groups_created "$(printf '%s\n' "$created_group" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson users_created "$(printf '%s\n' "${created_users[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{status:"passed", mode:"users_apply",
    task_id:$task, project_id:$project,
    groups_created:$groups_created,
    users_created:$users_created,
    production_blocked:true}'