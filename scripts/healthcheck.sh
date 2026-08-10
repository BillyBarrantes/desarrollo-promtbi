#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"
TASK_ID="${2:-}"
BASE_URL="${3:-http://127.0.0.1:8003}"
PATH_SUFFIX="${4:-/api/v1/health}"

if [ -z "$PROJECT_ID" ] || [ -z "$TASK_ID" ]; then
  jq -nc '{status:"error",message:"Uso: healthcheck.sh <project_id> <task_id> [base_url] [path]"}'
  exit 1
fi

URL="${BASE_URL}${PATH_SUFFIX}"

if ! python3 - <<PY >/dev/null 2>&1
import urllib.request
resp = urllib.request.urlopen("${URL}", timeout=10)
status = resp.getcode()
content_type = resp.headers.get("content-type", "")
body = resp.read().decode("utf-8", "replace")
if status != 200:
    raise SystemExit(1)
print(body)
PY
then
  jq -nc \
    --arg project_id "$PROJECT_ID" \
    --arg task_id "$TASK_ID" \
    --arg url "$URL" \
    '{status:"failed",project_id:$project_id,task_id:$task_id,url:$url,healthy:false,message:"Healthcheck no respondió correctamente"}'
  exit 1
fi

jq -nc \
  --arg project_id "$PROJECT_ID" \
  --arg task_id "$TASK_ID" \
  --arg url "$URL" \
  '{
    status:"passed",
    project_id:$project_id,
    task_id:$task_id,
    url:$url,
    healthy:true
  }'
