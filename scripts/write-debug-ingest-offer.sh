#!/usr/bin/env bash
# Write .cursor/debug-ingest-offer.json for the discovery sidecar (port 7663).
# Agents should run this from /debug-ingest before starting ingest-lan-relay.sh.
# Ink does not read the offer file. Keep writing it so the sidecar can serve a
# session, and still bake the ingest URL into dist/ (docs/debugging-lan-ingest.md).
#
# Usage:
#   bash scripts/write-debug-ingest-offer.sh \
#     --session <slug> --path /ingest/<uuid> [--port 7662] [--host <lan-ip>]
#
# See docs/debugging-lan-ingest.md

set -euo pipefail

SESSION_ID=""
INGEST_PATH=""
INGEST_PORT="${INGEST_RELAY_PORT:-7662}"
HOST_OVERRIDE=""
OFFER_PATH="${DEBUG_INGEST_OFFER_PATH:-.cursor/debug-ingest-offer.json}"

usage() {
	cat <<'EOF' >&2
Usage: write-debug-ingest-offer.sh --session <slug> --path /ingest/<uuid> [--port N] [--host IP]
EOF
	exit 2
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--session)
			SESSION_ID="${2:-}"
			shift 2
			;;
		--path)
			INGEST_PATH="${2:-}"
			shift 2
			;;
		--port)
			INGEST_PORT="${2:-}"
			shift 2
			;;
		--host)
			HOST_OVERRIDE="${2:-}"
			shift 2
			;;
		--offer-path)
			OFFER_PATH="${2:-}"
			shift 2
			;;
		-h|--help)
			usage
			;;
		*)
			echo "Unknown argument: $1" >&2
			usage
			;;
	esac
done

if [[ -z "${SESSION_ID}" || -z "${INGEST_PATH}" ]]; then
	echo "ERROR: --session and --path are required." >&2
	usage
fi

if [[ "${INGEST_PATH}" != /* ]]; then
	INGEST_PATH="/${INGEST_PATH}"
fi

LAN_IP="${HOST_OVERRIDE}"
if [[ -z "${LAN_IP}" ]]; then
	LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [[ -z "${LAN_IP}" ]]; then
	echo "ERROR: could not detect LAN IP. Pass --host <ip>." >&2
	exit 1
fi

SERVER_NAME="$(scutil --get ComputerName 2>/dev/null || hostname -s 2>/dev/null || echo Mac)"

# Short random token; plugin echoes it on later offer GETs.
TOKEN="$(openssl rand -hex 8 2>/dev/null || head -c 16 /dev/urandom | xxd -p | head -c 16)"

mkdir -p "$(dirname "${OFFER_PATH}")"

# Prefer python for safe JSON encoding of computer names with quotes/spaces.
python3 - "${OFFER_PATH}" "${SERVER_NAME}" "${LAN_IP}" "${INGEST_PORT}" "${INGEST_PATH}" "${SESSION_ID}" "${TOKEN}" <<'PY'
import json, sys
path, server_name, host, port_s, ingest_path, session_id, token = sys.argv[1:]
offer = {
    "serverName": server_name,
    "host": host,
    "port": int(port_s),
    "ingestPath": ingest_path,
    "sessionId": session_id,
    "token": token,
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(offer, f, indent=2)
    f.write("\n")
print(path)
PY

echo "Wrote debug ingest offer:" >&2
echo "  file:       ${OFFER_PATH}" >&2
echo "  serverName: ${SERVER_NAME}" >&2
echo "  host:       ${LAN_IP}" >&2
echo "  port:       ${INGEST_PORT}" >&2
echo "  sessionId:  ${SESSION_ID}" >&2
echo "  ingestPath: ${INGEST_PATH}" >&2
echo "" >&2
echo "Next: bash scripts/ingest-lan-relay.sh" >&2
echo "Ink does not read this offer. Bake the session into dist/ (docs/debugging-lan-ingest.md)." >&2
