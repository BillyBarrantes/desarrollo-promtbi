#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
mode="${3:-}"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"register_saas_promdata", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: register-saas-promdata.sh <project_id> <task_id> --dry-run"
[[ "$mode" == "--dry-run" ]] || fail "only --dry-run mode is supported (no real registration)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "register-saas-promdata requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

docs=(
  "PRODUCT.md"
  "ARCHITECTURE.md"
  "DESIGN.md"
  "RUNBOOK.md"
  "AGENTS.md"
  "AGENT_POLICY.md"
)

jq -cn \
  --argjson docs "$(printf '%s\n' "${docs[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --arg project_id "$project_id" \
  --arg task_id "$task_id" \
  '{status:"preparation_only", action:"register_saas_promdata",
    mode:"dry_run",
    project_id:$project_id,
    task_id:$task_id,
    documents_to_create:$docs,
    registration_json:{
      project_id:"promdata",
      workspace_root:"${WORKSPACE_ROOT}/promdata",
      stack:"{install, lint, typecheck, tests, build, start, migration, e2e, deploy, rollback, healthcheck}",
      commands:{install:null,lint:null,typecheck:null,tests:null,build:null,start:null,migration:null,e2e:null,deploy:null,rollback:null,healthcheck:null},
      healthcheck_url:null,
      allowed_paths:["src","test"],
      forbidden_paths:["secrets",".env"],
      telegram_enabled:true,
      staging_enabled:true
    },
    note:"no files created in dry-run",
    production_blocked:true}'