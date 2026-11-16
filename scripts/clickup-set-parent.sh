#!/usr/bin/env bash
# Move an existing ClickUp task under another task as a subtask (same ID / history).
#
# Why this script exists: official ClickUp MCP (https://mcp.clickup.com/mcp)
# can create a NEW subtask with clickup_create_task + parent, but clickup_update_task
# has no parent field and strips extra arguments. REST Update Task does support parent:
#   PUT https://api.clickup.com/api/v2/task/<task_id>
#   {"parent":"<parent_task_id>"}
#   Authorization: raw pk_… token (not Bearer)
#
# Token (macOS/Linux ~/.zshenv, Windows User Environment Variables): export CLICKUP_API_TOKEN
# Create token: https://app.clickup.com/settings/apps
# Never hardcode the plaintext token in mcp.json (use "${env:CLICKUP_API_TOKEN}" per docs/cursor-mcp-clickup-cloud-agents.md).
# If this fails, do not keep an empty grouping parent: delete it and fall back to the
# original tickets (each In Progress / Review). Tell the user the checklist in
# docs/cursor-mcp-clickup-cloud-agents.md (section "If nesting stops working").
set -euo pipefail

task_id="${1:-}"
parent_task_id="${2:-}"
token="${CLICKUP_API_TOKEN:-${CLICKUP_API_KEY:-}}"

if [[ -z "${task_id}" || -z "${parent_task_id}" ]]; then
  echo "Usage: clickup-set-parent.sh <task_id> <parent_task_id>" >&2
  exit 2
fi

if [[ -z "${token}" ]]; then
  echo "Set CLICKUP_API_TOKEN (or CLICKUP_API_KEY) to a ClickUp personal API token (pk_…)." >&2
  exit 1
fi

response_file="$(mktemp)"
trap 'rm -f "${response_file}"' EXIT

http_code="$(
  curl -sS -o "${response_file}" -w "%{http_code}" -X PUT \
    "https://api.clickup.com/api/v2/task/${task_id}" \
    -H "Authorization: ${token}" \
    -H "Content-Type: application/json" \
    -d "{\"parent\":\"${parent_task_id}\"}"
)"

if [[ "${http_code}" != "200" ]]; then
  echo "ClickUp reparent failed (HTTP ${http_code}) for task ${task_id} -> parent ${parent_task_id}." >&2
  cat "${response_file}" >&2
  echo >&2
  exit 1
fi

echo "Reparented ${task_id} under ${parent_task_id}."
