#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
mode="${3:-}"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"bootstrap_vps_agentic", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: bootstrap-vps-agentic.sh <project_id> <task_id> --dry-run"
[[ "$mode" == "--dry-run" ]] || fail "only --dry-run mode is supported (no real install)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "bootstrap-vps-agentic requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

env_vars=(
  "OPENCODE_HOME"
  "WORKSPACE_ROOT"
  "PROJECTS_ROOT"
  "BOT_DIR"
  "SCRIPTS_DIR"
  "SECRETS_DIR"
  "CONFIG_DIR"
  "BACKUP_DIR"
)

packages=(
  "git"
  "node"
  "npm"
  "python"
  "pip"
  "jq"
  "curl"
)

users=(
  "promtbi-bot"
  "promtbi-agent"
)

groups=(
  "promtbi-bot"
  "promtbi-agent"
  "promtbi-users"
)

directories=(
  "${OPENCODE_HOME:-/opt/opencode}"
  "${WORKSPACE_ROOT:-/srv/agentic/workspaces}"
  "${PROJECTS_ROOT:-/srv/agentic/projects}"
  "${BOT_DIR:-/opt/opencode-bot}"
  "${SCRIPTS_DIR:-/usr/local/bin}"
  "${SECRETS_DIR:-/srv/agentic/secrets}"
  "${CONFIG_DIR:-/etc/agentic}"
  "${BACKUP_DIR:-/srv/agentic/backups}"
)

directory_values=(
  "OPENCODE_HOME=${OPENCODE_HOME:-/opt/opencode}"
  "WORKSPACE_ROOT=${WORKSPACE_ROOT:-/srv/agentic/workspaces}"
  "PROJECTS_ROOT=${PROJECTS_ROOT:-/srv/agentic/projects}"
  "BOT_DIR=${BOT_DIR:-/opt/opencode-bot}"
  "SCRIPTS_DIR=${SCRIPTS_DIR:-/usr/local/bin}"
  "SECRETS_DIR=${SECRETS_DIR:-/srv/agentic/secrets}"
  "CONFIG_DIR=${CONFIG_DIR:-/etc/agentic}"
  "BACKUP_DIR=${BACKUP_DIR:-/srv/agentic/backups}"
)

jq -cn \
  --argjson env_vars "$(printf '%s\n' "${env_vars[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson packages "$(printf '%s\n' "${packages[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson users "$(printf '%s\n' "${users[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson groups "$(printf '%s\n' "${groups[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson directories "$(printf '%s\n' "${directories[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson env_dir_values "$(printf '%s\n' "${directory_values[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --arg project_id "$project_id" \
  --arg task_id "$task_id" \
  '{status:"preparation_only", action:"bootstrap_vps_agentic",
    mode:"dry_run",
    project_id:$project_id,
    task_id:$task_id,
    env_vars_to_set:$env_vars,
    packages_to_install:$packages,
    users_to_create:$users,
    groups_to_create:$groups,
    directories_to_create:$directories,
    env_dir_values:$env_dir_values,
    note:"no apt/useradd/mkdir executed in dry-run; env names only, values are defaults",
    production_blocked:true}'