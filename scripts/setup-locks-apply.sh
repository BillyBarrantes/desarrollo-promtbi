#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
flag="${3:-}"
state=".ops/state/${task_id}.json"
LOG_DIR=".ops/logs"
log_file="${LOG_DIR}/${task_id}-locks-apply.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", mode:"locks_apply", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "$log_file" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-locks-apply.sh <project_id> <task_id> --apply"
[[ "$flag" == "--apply" ]] || fail "only --apply mode is supported (requires sudo and human approval)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-locks-apply requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root (EUID=0) to install locks script"

locks_script="/usr/local/bin/agentic-locks.sh"
project_root="/srv/agentic/projects/${project_id}"
locks_dir="${project_root}/.ops/locks"

mkdir -p "$locks_dir"
chown root:root "$locks_dir"
chmod 770 "$locks_dir"

cat > "$locks_script" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

LOCKS_DIR="${LOCKS_DIR:-/srv/agentic/projects/desarrollo-promtbi-main/.ops/locks}"
DEFAULT_TTL_HOURS="${DEFAULT_TTL_HOURS:-1}"

_usage() {
  echo "usage: agentic-locks.sh {acquire <name>|release <name>|recover|audit}" >&2
  exit 2
}

acquire() {
  local name="$1" now expires_at
  now="$(date -u +%s)"
  expires_at="$(( now + DEFAULT_TTL_HOURS * 3600 ))"
  local file="${LOCKS_DIR}/${name}.json"
  if [[ -f "$file" ]]; then
    local existing
    existing="$(jq -r '.expires_at // 0' "$file" 2>/dev/null)"
    if [[ "$now" -lt "$existing" ]]; then
      jq -cn --arg name "$name" '{status:"locked", lock:$name, note:"already held"}'
      return 1
    fi
  fi
  jq -cn \
    --arg name "$name" \
    --argjson now "$now" \
    --argjson expires "$expires_at" \
    '{lock:$name, acquired_at:$now, expires_at:$expires, ttl_hours:'"$DEFAULT_TTL_HOURS"', status:"acquired"}' \
    > "$file"
  echo "lock acquired: $name"
}

release() {
  local name="$1"
  rm -f "${LOCKS_DIR}/${name}.json"
  echo "lock released: $name"
}

recover() {
  local now f exp
  now="$(date -u +%s)"
  for f in "${LOCKS_DIR}"/*.json; do
    [[ -f "$f" ]] || continue
    exp="$(jq -r '.expires_at // 0' "$f" 2>/dev/null)"
    if [[ "$now" -ge "$exp" ]]; then
      rm -f "$f"
      echo "recovered expired lock: $(basename "$f")"
    fi
  done
}

audit() {
  local f
  for f in "${LOCKS_DIR}"/*.json; do
    [[ -f "$f" ]] || continue
    jq -c '{lock:.lock, acquired_at:.acquired_at, expires_at:.expires_at} + {status:"active"}' "$f"
  done
}

command="${1:-}"
[[ -n "$command" ]] || _usage
shift

mkdir -p "$LOCKS_DIR"

case "$command" in
  acquire) acquire "$@" ;;
  release) release "$@" ;;
  recover) recover ;;
  audit) audit ;;
  *) _usage ;;
esac
EOF

chown root:root "$locks_script"
chmod 750 "$locks_script"

log "locks_apply: .ops/locks/ y /usr/local/bin/agentic-locks.sh listos. NO se crearon locks reales."

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  '{status:"passed", mode:"locks_apply",
    task_id:$task, project_id:$project,
    locks_directory:".ops/locks",
    locks_script:"/usr/local/bin/agentic-locks.sh",
    default_ttl_hours:1,
    note:"locks script installed; no real locks created",
    production_blocked:true}'