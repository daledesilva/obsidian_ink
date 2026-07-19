#!/usr/bin/env bash
# Expose Cursor's localhost-only debug ingest (127.0.0.1:7662) on the LAN so
# iPad / Obsidian mobile can POST structured NDJSON over Wi‑Fi.
#
# Cursor binds ingest to localhost only. Run this relay on the Mac while a Cursor
# Debug session is active, then build the plugin with a baked LAN IP (see
# obsidian_ink/docs/debugging-on-ipad.md).
#
# Usage (from obsidian_ink/, while Cursor Debug mode is active):
#   bash scripts/ingest-lan-relay.sh
#
# Requires: socat (`brew install socat`). Allow inbound TCP 7662 in macOS Firewall if prompted.

set -euo pipefail

LISTEN_PORT="${INGEST_RELAY_PORT:-7662}"
TARGET_HOST="${INGEST_RELAY_TARGET_HOST:-127.0.0.1}"
TARGET_PORT="${INGEST_RELAY_TARGET_PORT:-7662}"

if ! command -v socat >/dev/null 2>&1; then
	echo "ERROR: socat not found. Install with: brew install socat" >&2
	exit 1
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
echo "Relaying 0.0.0.0:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}" >&2
if [[ -n "${LAN_IP}" ]]; then
	echo "Mobile ingest base: http://${LAN_IP}:${LISTEN_PORT}<INGEST_PATH from Cursor Debug session>" >&2
else
	echo "WARN: could not detect LAN IP (en0/en1). Check System Settings → Network." >&2
fi
echo "Press Ctrl+C to stop." >&2

exec socat "TCP-LISTEN:${LISTEN_PORT},fork,reuseaddr,bind=0.0.0.0" "TCP:${TARGET_HOST}:${TARGET_PORT}"
