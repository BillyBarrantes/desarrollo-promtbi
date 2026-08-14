#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
task_id="${2:-}"
mode="${3:-}"
state=".ops/state/${task_id}.json"

fail() {
  jq -cn --arg reason "$1" \
    '{status:"failed", action:"setup_playwright_promdata", reason:$reason, production_blocked:true}'
  exit 1
}

[[ -n "$project_id" && -n "$task_id" ]] ||
  fail "usage: setup-playwright-promdata.sh <project_id> <task_id> --dry-run"
[[ "$mode" == "--dry-run" ]] || fail "only --dry-run mode is supported (no real install)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$state" ]] || fail "missing state file: $state"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$task_id" || "$current_branch" == "agent/$task_id" ]] ||
  fail "setup-playwright-promdata requires branch agent/$task_id (current=$current_branch)"

status="$(jq -r '.status // "unknown"' "$state")"
[[ "$status" == "approved" ]] || fail "task is not approved (status=${status})"

production_blocked="$(jq -r '.production_blocked // true' "$state")"
[[ "$production_blocked" == "true" ]] || fail "production must remain blocked"

jq -cn \
  --arg project_id "$project_id" \
  --arg task_id "$task_id" \
  '{status:"preparation_only", action:"setup_playwright_promdata",
    mode:"dry_run",
    project_id:$project_id,
    task_id:$task_id,
    applies_to:"frontend_web_only",
    playwright_config:{
      package_install:"@playwright/test",
      config_files:["playwright.config.ts"],
      test_dirs:["tests/e2e","tests/visual"],
      baseURL:"http://localhost:<port>",
      local_server:true,
      timeouts:30000,
      screenshots:true,
      traces:true,
      retries:1,
      browsers:["chromium","firefox"],
      artifacts:true
    },
    note:"no npm install or file creation in dry-run",
    production_blocked:true}'