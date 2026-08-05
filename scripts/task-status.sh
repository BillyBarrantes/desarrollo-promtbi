#!/usr/bin/env bash
set -euo pipefail

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Debe indicar un TASK_ID"}'
  exit 1
fi

STATE_FILE=".ops/state/${TASK_ID}.json"

if [ ! -f "$STATE_FILE" ]; then
  echo "{\"error\": \"No existe el archivo de estado en ${STATE_FILE}\"}"
  exit 1
fi

cat "$STATE_FILE"
