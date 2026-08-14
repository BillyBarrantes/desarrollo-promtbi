#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
target="${3:-}"
approval="${4:-}"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", gate:"rollback", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" && -n "$target" ]] ||
  fail "usage: rollback-gate.sh <project_id> <task_id> staging APPROVED"

[[ "$approval" == "APPROVED" ]] ||
  fail "explicit rollback approval is required"

command -v jq >/dev/null 2>&1 || fail "jq is required"

branch="$(git branch --show-current)"
state=".ops/state/${task_id}.json"

if [[ "$target" != "staging" ||
      "$*" == *production* ||
      "$target" == "prod" || "$target" == "production" || "$target" == "development" ]]; then
  fail "rollback is restricted to staging target"
fi

mode="preview"
[[ "$branch" == "main" ]] && mode="post_merge_staging"

if [[ "$mode" == "preview" ]]; then
  [[ "$branch" == agent/*/"$task_id"-* ]] ||
    fail "rollback requires an isolated task branch"
  [[ "$branch" != "main" && "$branch" != "develop" ]] ||
    fail "rollback from protected branch is denied"

  scripts/run-qa.sh "$project_id" "$task_id" >/dev/null ||
    fail "QA gate must pass before rollback preparation"

  jq -cn \
    --arg project "$project_id" \
    --arg task "$task_id" \
    --arg target "$target" \
    --arg branch "$branch" \
    --arg mode "$mode" \
    --arg msha "" \
    '{status:"passed", gate:"rollback",
      action:"rollback-preparation-only", mode:$mode,
      current_branch:$branch, target:$target,
      merge_commit_sha:$msha,
      production_blocked:true,
      project_id:$project, task_id:$task}'
  exit 0
fi

[[ -f "$state" ]] || fail "missing state file: $state"

jq -e \
  --arg project "$project_id" \
  --arg task "$task_id" '
  .project_id == $project and
  .task_id == $task and
  (.pr_number // "" | tostring | length > 0) and
  (.pr_base // "") == "main" and
  (.commit_sha // "" | length > 0) and
  (.merge_commit_sha // "" | length > 0) and
  (.merge_status // "") == "merged" and
  (.staging_approval // "") == "APPROVED" and
  (.staging_target // "") == "staging"
' "$state" >/dev/null 2>&1 || fail "rollback post-merge conditions not satisfied"

state_commit_sha="$(jq -r '.commit_sha' "$state")"
state_merge_sha="$(jq -r '.merge_commit_sha' "$state")"

git merge-base --is-ancestor "$state_commit_sha" HEAD ||
  fail "commit_sha is not integrated in main HEAD"
git merge-base --is-ancestor "$state_merge_sha" HEAD ||
  fail "merge_commit_sha is not integrated in main HEAD"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg target "$target" \
  --arg branch "$branch" \
  --arg mode "$mode" \
  --arg sha "$state_commit_sha" \
  --arg msha "$state_merge_sha" \
  '{status:"passed", gate:"rollback",
    action:"rollback-preparation-only", mode:$mode,
    current_branch:$branch, target:$target,
    commit_sha:$sha, merge_commit_sha:$msha,
    production_blocked:true,
    project_id:$project, task_id:$task}'