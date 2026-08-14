#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
LOG_DIR=".ops/logs"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"deploy_staging", reason:$reason, production_blocked:true}'
  exit 1
}

log() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  printf '[%s] %s project=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$project_id" "$task_id" \
    >> "${LOG_DIR}/${task_id}.log" 2>/dev/null || true
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: deploy-staging.sh <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"

current_branch="$(git branch --show-current)"
state=".ops/state/${task_id}.json"
commit_sha="$(git rev-parse HEAD)"

production_hint="${PRODUCTION:-${DEPLOY_TARGET:-}}"
if [[ "$*" == *production* || "$production_hint" != "" ]]; then
  fail "production deployment is blocked"
fi

mode="preview"
[[ "$current_branch" == "main" ]] && mode="post_merge_staging"

if [[ "$mode" == "preview" ]]; then
  [[ "$current_branch" == agent/* ]] ||
    fail "staging deploy requires an agent branch (current=${current_branch})"

  log "preparation_only: deploy_staging preview (sin deploy real; branch=${current_branch})"

  jq -cn \
    --arg project "$project_id" \
    --arg task "$task_id" \
    --arg mode "$mode" \
    --arg target "staging" \
    --arg sha "$commit_sha" \
    --arg msha "" \
    '{status:"preparation_only", action:"deploy_staging", mode:$mode,
      target:$target, commit_sha:$sha, merge_commit_sha:$msha,
      production_blocked:true, project_id:$project, task_id:$task}'
  exit 0
fi

[[ -f "$state" ]] || fail "missing state file: $state"

jq -e \
  --arg project "$project_id" \
  --arg task "$task_id" '
  .project_id == $project and
  .task_id == $task and
  (.pr_number // "" | length > 0) and
  (.pr_base // "") == "main" and
  (.commit_sha // "" | length > 0) and
  (.merge_commit_sha // "" | length > 0) and
  (.merge_status // "") == "merged" and
  (.staging_approval // "") == "APPROVED"
' "$state" >/dev/null 2>&1 || fail "staging approval not granted"

state_commit_sha="$(jq -r '.commit_sha' "$state")"
state_merge_sha="$(jq -r '.merge_commit_sha' "$state")"

git merge-base --is-ancestor "$state_commit_sha" HEAD ||
  fail "commit_sha is not integrated in main HEAD"
git merge-base --is-ancestor "$state_merge_sha" HEAD ||
  fail "merge_commit_sha is not integrated in main HEAD"

log "preparation_only: deploy_staging post_merge_staging (sin deploy real; branch=${current_branch})"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg mode "$mode" \
  --arg target "staging" \
  --arg sha "$state_commit_sha" \
  --arg msha "$state_merge_sha" \
  '{status:"preparation_only", action:"deploy_staging", mode:$mode,
    target:$target, commit_sha:$sha, merge_commit_sha:$msha,
    production_blocked:true, project_id:$project, task_id:$task}'
