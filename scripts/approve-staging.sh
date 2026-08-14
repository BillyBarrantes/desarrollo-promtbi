#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
approved_by="${3:-}"

APPROVAL_DIR=".ops/approvals"
LOG_DIR=".ops/logs"
state=".ops/state/${task_id}.json"
approval_file="${APPROVAL_DIR}/${task_id}-staging.json"
log_file="${LOG_DIR}/${task_id}-staging-approval.log"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"approve_staging", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" && -n "$approved_by" ]] ||
  fail "usage: approve-staging.sh <project_id> <task_id> <approved_by>"

[[ "$project_id" == "desarrollo-promtbi-main" ]] ||
  fail "invalid project_id: $project_id"

[[ "$*" != *production* ]] || fail "production target is forbidden"

command -v jq >/dev/null 2>&1 || fail "jq is required"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "not inside a git work tree"

[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "main" ]] ||
  fail "staging approval requires main branch (current=$current_branch)"

jq -e '
  (.pr_number // "" | tostring | length > 0) and
  (.pr_base // "") == "main" and
  (.commit_sha // "" | length > 0) and
  (.merge_commit_sha // "" | length > 0) and
  (.merge_status // "") == "merged"
' "$state" >/dev/null 2>&1 || fail "task state missing required post-merge fields"

current_approval="$(jq -r '.staging_approval // ""' "$state")"
commit_sha="$(jq -r '.commit_sha' "$state")"
merge_commit_sha="$(jq -r '.merge_commit_sha' "$state")"

case "$current_approval" in
  "PENDING")
    ;;
  "APPROVED")
    if [[ -f "$approval_file" ]]; then
      file_by="$(jq -r '.approved_by // ""' "$approval_file")"
      file_sha="$(jq -r '.commit_sha // ""' "$approval_file")"
      file_msha="$(jq -r '.merge_commit_sha // ""' "$approval_file")"
      file_at="$(jq -r '.approved_at // ""' "$approval_file")"
      if [[ "$file_by" == "$approved_by" &&
            "$file_sha" == "$commit_sha" &&
            "$file_msha" == "$merge_commit_sha" ]]; then
        jq -cn \
          --arg task "$task_id" --arg project "$project_id" \
          --arg by "$approved_by" --arg at "$file_at" \
          --arg sha "$commit_sha" --arg msha "$merge_commit_sha" \
          '{status:"approved", action:"approve_staging", idempotent:true,
            task_id:$task, project_id:$project, target:"staging",
            approved_by:$by, approved_at:$at,
            commit_sha:$sha, merge_commit_sha:$msha, production_blocked:true}'
        exit 0
      fi
      fail "staging already APPROVED but actor or commits differ"
    fi
    fail "staging already APPROVED but approval record missing"
    ;;
  *)
    fail "unexpected staging_approval state: ${current_approval} (expected PENDING)"
    ;;
esac

git merge-base --is-ancestor "$commit_sha" HEAD ||
  fail "commit_sha is not an ancestor of HEAD"
git merge-base --is-ancestor "$merge_commit_sha" HEAD ||
  fail "merge_commit_sha is not an ancestor of HEAD"

now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq --arg by "$approved_by" --arg at "$now" '
  .staging_approval = "APPROVED" |
  .staging_approved_by = $by |
  .staging_approved_at = $at |
  .staging_target = "staging" |
  .updated_at = $at
' "$state" > "$state.tmp.$$"
mv "$state.tmp.$$" "$state"

mkdir -p "$APPROVAL_DIR"
jq -n \
  --argjson sv 2 --arg task "$task_id" --arg project "$project_id" \
  --arg by "$approved_by" --arg at "$now" \
  --arg sha "$commit_sha" --arg msha "$merge_commit_sha" '
  {
    schema_version: $sv,
    task_id: $task,
    project_id: $project,
    action: "staging",
    target: "staging",
    decision: "APPROVED",
    approved_by: $by,
    approved_at: $at,
    commit_sha: $sha,
    merge_commit_sha: $msha,
    production_blocked: true
  }
' > "$approval_file.tmp.$$"
mv "$approval_file.tmp.$$" "$approval_file"

mkdir -p "$LOG_DIR"
jq -n \
  --arg ts "$now" --arg task "$task_id" --arg project "$project_id" \
  --arg by "$approved_by" --arg sha "$commit_sha" --arg msha "$merge_commit_sha" '
  {
    ts: $ts,
    task_id: $task,
    project_id: $project,
    action: "staging",
    decision: "APPROVED",
    target: "staging",
    approved_by: $by,
    commit_sha: $sha,
    merge_commit_sha: $msha,
    production_blocked: true
  }
' >> "$log_file"

jq -cn \
  --arg task "$task_id" --arg project "$project_id" \
  --arg by "$approved_by" --arg at "$now" \
  --arg sha "$commit_sha" --arg msha "$merge_commit_sha" \
  '{status:"approved", action:"approve_staging", idempotent:false,
    task_id:$task, project_id:$project, target:"staging",
    approved_by:$by, approved_at:$at,
    commit_sha:$sha, merge_commit_sha:$msha, production_blocked:true}'
