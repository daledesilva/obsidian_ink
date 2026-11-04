#!/usr/bin/env bash
# Print host/port hints for Cursor Debug ingest.
# The offer on :7663 is optional. Ink follows docs/debugging-lan-ingest.md
# (baked LAN URL + ingest-lan-relay.sh), not a Connect button.
#
# Usage:
#   bash scripts/print-debug-ingest-settings.sh
#
# See docs/debugging-lan-ingest.md

set -euo pipefail

LISTEN_PORT="${INGEST_RELAY_PORT:-7662}"
OFFER_PORT="${DEBUG_INGEST_OFFER_PORT:-7663}"
OFFER_PATH="${DEBUG_INGEST_OFFER_PATH:-.cursor/debug-ingest-offer.json}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

echo "=== Cursor Debug ingest ==="
echo ""
echo "Ink path (baked URL + relay):"
echo "  1. Start relay:  bash scripts/ingest-lan-relay.sh"
echo "  2. Build with INK_DEBUG_CURSOR_SESSION_ID and INK_DEBUG_INGEST_PATH, then copy dist/"
echo "Optional offer (not read by the plugin):"
echo "  bash scripts/write-debug-ingest-offer.sh --session <slug> --path /ingest/<uuid> --port ${LISTEN_PORT}"
echo "  Offer port: ${OFFER_PORT}  (GET /offer)"
if [[ -f "${OFFER_PATH}" ]]; then
	echo "  Offer file: ${OFFER_PATH} (present)"
else
	echo "  Offer file: ${OFFER_PATH} (missing)"
fi
echo ""
echo "Manual Advanced fields (fallback):"
if [[ -n "${LAN_IP}" ]]; then
	echo "  Host:  ${LAN_IP}"
else
	echo "  Host:  (could not detect — check System Settings → Network / Wi‑Fi IP)"
fi
echo "  Port:  ${LISTEN_PORT}"
echo "  Session ID + Ingest path: from the active Cursor Debug session"
echo ""
echo "Then: reproduce in Obsidian and read .cursor/debug-<sessionId>.log."
