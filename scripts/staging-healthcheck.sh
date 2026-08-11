#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
target="${3:-}"
url="${4:-}"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", gate:"healthcheck", reason:$reason}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" && "$target" == "staging" && -n "$url" ]] ||
  fail "usage: staging-healthcheck.sh <project_id> <task_id> staging <url>"

[[ "$url" != *production* && "$url" != *prod.* ]] ||
  fail "production URL is not allowed"

command -v curl >/dev/null 2>&1 || fail "curl is required"

http_code="$(
  curl --silent --show-error --output /dev/null \
    --write-out '%{http_code}' --max-time 10 "$url"
)" || fail "staging endpoint is unreachable"

[[ "$http_code" =~ ^2[0-9][0-9]$ ]] ||
  fail "staging endpoint returned HTTP $http_code"

jq -cn \
  --arg project "$project_id" \
  --arg task "$task_id" \
  --arg target "$target" \
  --arg url "$url" \
  --arg http_code "$http_code" \
  '{status:"passed", gate:"healthcheck", target:$target,
    url:$url, http_code:$http_code,
    project_id:$project, task_id:$task}'
