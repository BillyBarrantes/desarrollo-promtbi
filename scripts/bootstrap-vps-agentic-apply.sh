#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-bootstrap-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"bootstrap_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: bootstrap-vps-agentic-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "bootstrap-vps-agentic-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to bootstrap the VPS"

export OPENCODE_HOME="${OPENCODE_HOME:-/opt/opencode}"
export WORKSPACE_ROOT="${WORKSPACE_ROOT:-/srv/agentic/workspaces}"
export PROJECTS_ROOT="${PROJECTS_ROOT:-/srv/agentic/projects}"
export BOT_DIR="${BOT_DIR:-/opt/opencode-bot}"
export SCRIPTS_DIR="${SCRIPTS_DIR:-/usr/local/bin}"
export SECRETS_DIR="${SECRETS_DIR:-/srv/agentic/secrets}"
export CONFIG_DIR="${CONFIG_DIR:-/etc/agentic}"
export BACKUP_DIR="${BACKUP_DIR:-/srv/agentic/backups}"

env_vars=(
  "OPENCODE_HOME=${OPENCODE_HOME}"
  "WORKSPACE_ROOT=${WORKSPACE_ROOT}"
  "PROJECTS_ROOT=${PROJECTS_ROOT}"
  "BOT_DIR=${BOT_DIR}"
  "SCRIPTS_DIR=${SCRIPTS_DIR}"
  "SECRETS_DIR=${SECRETS_DIR}"
  "CONFIG_DIR=${CONFIG_DIR}"
  "BACKUP_DIR=${BACKUP_DIR}"
)

packages=(git node  python3 python3-pip jq curl)
users=(promtbi-bot promtbi-agent)
groups=(promtbi-bot promtbi-agent promtbi-users)
dirs=( "$OPENCODE_HOME" "$WORKSPACE_ROOT" "$PROJECTS_ROOT" "$BOT_DIR" "$SECRETS_DIR" "$CONFIG_DIR" "$BACKUP_DIR" )

# dependencias base
apt-get update -y
apt-get install -y --no-install-recommends \
  git nodejs  python3 python3-python3-pip jq curl

env_vars_installed=()
packages_installed=()
for p in "${packages[@]}"; do
  if command -v "$p" >/dev/null 2>&1; then
    packages_installed+=("$p")
    env_vars_installed+=("$p")
  fi
done

# grupos
for g in "${groups[@]}"; do
  getent group "$g" >/dev/null 2>&1 || groupadd "$g"
done

# usuarios + grupos primarios
for u in "${users[@]}"; do
  if ! id -u "$u" >/dev/null 2>&1; then
    useradd -m -s /bin/bash --shell /bin/bash --home-dir "/home/$u" --create-home "$u"
  fi
  usermod -a -G promtbi-users "$u"
  usermod -a -G "$u" "$u"
done

# directorios + permisos
for d in "${dirs[@]}"; do
  install -d -o root -g promtbi-users -m 750 "$d"
done
install -d -o root -g root -m 755 "$BOT_DIR"
install -d -o root -g root -m 755 "$CONFIG_DIR"
install -d -o root -g promtbi-users -m 700 "$SECRETS_DIR"

log "bootstrap_apply: dependencias, usuarios, grupos y directorios configurados."

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --argjson env_vars "$(printf '%s\n' "${env_vars[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson packages "$(printf '%s\n' "${packages_installed[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson users "$(printf '%s\n' "${users[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson groups "$(printf '%s\n' "${groups[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson dirs "$(printf '%s\n' "${dirs[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{status:"passed", mode:"bootstrap_apply",
    task_id:$task, project_id:$project,
    env_vars_set:$env_vars,
    packages_installed:$packages,
    users_created:$users,
    groups_created:$groups,
    directories_created:$dirs,
    note:"VPS bootstrap applied; requires sudo",
    production_blocked:true}'