#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"release_status", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: release-status.sh <project_id> <task_id>"
command -v jq >/dev/null 2>&1 || fail "jq is required"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  fail "not inside a git work tree"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
status_short="$(git status --porcelain || true)"

has_changes=false
[[ -n "$status_short" ]] && has_changes=true

clean_worktree=false
[[ -z "$status_short" ]] && clean_worktree=true

if [[ -f "$state" ]]; then
  status="$(jq -r '.status // "unknown"' "$state")"
else
  status="not_found"
fi

pr_number="$(jq -r '.pr_number // ""' "$state" 2>/dev/null || true)"
pr_base="$(jq -r '.pr_base // ""' "$state" 2>/dev/null || true)"
commit_sha="$(jq -r '.commit_sha // ""' "$state" 2>/dev/null || true)"
merge_commit_sha="$(jq -r '.merge_commit_sha // ""' "$state" 2>/dev/null || true)"
merge_status="$(jq -r '.merge_status // ""' "$state" 2>/dev/null || true)"
staging_approval="$(jq -r '.staging_approval // ""' "$state" 2>/dev/null || true)"

ready_for_publish=false
[[ "$status" == "approved" && "$has_changes" == true ]] &&
  ready_for_publish=true

staging_mode_eligible=false
if [[ -n "$pr_number" && "$pr_base" == "main" &&
      -n "$commit_sha" && -n "$merge_commit_sha" &&
      "$merge_status" == "merged" && "$staging_approval" == "APPROVED" ]]; then
  staging_mode_eligible=true
fi

files="$(git status --porcelain | awk '{print $2}')"
files_json="$(printf '%s\n' "$files" | jq -R -s 'split("\n") | map(select(length > 0))')"

jq -cn \
  --arg task "$task_id" \
  --arg project "$project_id" \
  --arg branch "$current_branch" \
  --arg state_status "$status" \
  --argjson has_changes "$has_changes" \
  --argjson ready_for_publish "$ready_for_publish" \
  --argjson clean_worktree "$clean_worktree" \
  --argjson files "$files_json" \
  --arg pr_number "$pr_number" \
  --arg pr_base "$pr_base" \
  --arg commit_sha "$commit_sha" \
  --arg merge_commit_sha "$merge_commit_sha" \
  --arg merge_status "$merge_status" \
  --arg staging_approval "$staging_approval" \
  --argjson staging_mode_eligible "$staging_mode_eligible" \
  '{task_id:$task, project_id:$project, branch:$branch, state_status:$state_status,
    flags:{has_changes:$has_changes, ready_for_publish:$ready_for_publish, clean_worktree:$clean_worktree},
    pr_number:$pr_number, pr_base:$pr_base, commit_sha:$commit_sha,
    merge_commit_sha:$merge_commit_sha, merge_status:$merge_status,
    staging_approval:$staging_approval, staging_mode_eligible:$staging_mode_eligible,
    production_blocked:true, files:$files}'
