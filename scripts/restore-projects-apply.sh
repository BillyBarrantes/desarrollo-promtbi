#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-restore-projects-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"restore_projects_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: restore-projects-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "restore-projects-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to restore projects"

PROJECTS_ROOT="${PROJECTS_ROOT:-/srv/agentic/projects}"
repos=(
  "desarrollo-promtbi-main"
  "promdata"
  "tres-niveles-web"
)

mkdir -p "$PROJECTS_ROOT"
restored=()
for r in "${repos[@]}"; do
  dest="${PROJECTS_ROOT}/${r}"
  if [[ -d "$dest/.git" ]]; then
    restored+=("$r (already present)")
  else
    git clone "git@github.com:promtbi/${r}.git" "$dest" 2>/dev/null \
      || git clone "https://github.com/promtbi/${r}.git" "$dest" 2>/dev/null \
      || fail "failed to clone ${r}"
    restored+=("$r")
  fi
  chown -R root:promtbi-users "$dest"
  chmod -R 755 "$dest"
done

log "restore_projects_apply: ${#restored[@]} repositorios restaurados en ${PROJECTS_ROOT}."

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --argjson repos "$(printf '%s\n' "${restored[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{status:"passed", mode:"restore_projects_apply",
    task_id:$task, project_id:$project,
    repositories_restored:$repos,
    destination:"${PROJECTS_ROOT}",
    note:"SaaS repos restored via git clone",
    production_blocked:true}'