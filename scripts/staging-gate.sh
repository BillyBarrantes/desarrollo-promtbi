#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
target="${3:-}"
approval="${4:-}"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", gate:"staging", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" && -n "$target" ]] ||
  fail "usage: staging-gate.sh <project_id> <task_id> staging APPROVED"

[[ "$target" == "staging" ]] || fail "only staging deployment is allowed"
command -v jq >/dev/null 2>&1 || fail "jq is required"

branch="$(git branch --show-current)"
state=".ops/state/${task_id}.json"
commit_sha="$(git rev-parse HEAD)"

production_hint="${PRODUCTION:-${DEPLOY_TARGET:-}}"
if [[ "$*" == *production* || "$production_hint" != "" ]]; then
  fail "production deployment is blocked"
fi

mode="preview"
[[ "$branch" == "main" ]] && mode="post_merge_staging"

if [[ "$mode" == "preview" ]]; then
  [[ "$branch" == agent/*/"$task_id"-* ]] ||
    fail "staging gate requires an isolated task branch"
  [[ "$approval" == "APPROVED" ]] || fail "explicit staging approval is required"

  scripts/release-gate.sh "$project_id" "$task_id" APPROVED >/dev/null ||
    fail "release gate must pass before staging"

  jq -cn \
    --arg project "$project_id" \
    --arg task "$task_id" \
    --arg branch "$branch" \
    --arg mode "$mode" \
    --arg target "$target" \
    --arg sha "$commit_sha" \
    --arg msha "" \
    '{status:"passed", gate:"staging", action:"staging-only",
      mode:$mode, current_branch:$branch, target:$target,
      commit_sha:$sha, merge_commit_sha:$msha,
      production_blocked:true, project_id:$project, task_id:$task}'
  exit 0
fi

[[ -f "$state" ]] || fail "missing state file: $state"

[[ "$approval" == "APPROVED" ]] || fail "explicit staging approval is required"

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

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg branch "$branch" \
  --arg mode "$mode" \
  --arg target "$target" \
  --arg sha "$state_commit_sha" \
  --arg msha "$state_merge_sha" \
  '{status:"passed", gate:"staging", action:"staging-only",
    mode:$mode, current_branch:$branch, target:$target,
    commit_sha:$sha, merge_commit_sha:$msha,
    production_blocked:true, project_id:$project, task_id:$task}'
