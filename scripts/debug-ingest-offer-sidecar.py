#!/usr/bin/env python3
"""Serve Cursor Debug ingest offer JSON on the LAN.

Binds 0.0.0.0:7663 (override with DEBUG_INGEST_OFFER_PORT). Private LAN / localhost
use only — not a public service. See docs/debugging-lan-ingest.md.

Obsidian Ink does not request GET /offer and has no Connect setting. This process
exists so /debug-ingest can publish host, port, and ingest path for a client that
knows to ask. A reproduction still bakes the URL into dist/ and uses ingest-lan-relay.sh.
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

OFFER_PATH = Path(
    os.environ.get(
        "DEBUG_INGEST_OFFER_PATH",
        ".cursor/debug-ingest-offer.json",
    )
)
LISTEN_HOST = os.environ.get("DEBUG_INGEST_OFFER_BIND", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("DEBUG_INGEST_OFFER_PORT", "7663"))
# Override in the target project if the plugin uses custom discovery headers.
MAGIC_HEADER = os.environ.get("DEBUG_INGEST_MAGIC_HEADER", "X-Cursor-Debug-Ingest")
TOKEN_HEADER = os.environ.get("DEBUG_INGEST_TOKEN_HEADER", "X-Cursor-Debug-Ingest-Token")


def load_offer() -> dict | None:
    try:
        raw = OFFER_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    required = ("serverName", "host", "port", "ingestPath", "sessionId", "token")
    for key in required:
        if key not in data:
            return None
    return data


class OfferHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path != "/offer":
            self.send_error(404, "Not Found")
            return

        offer = load_offer()
        if offer is None:
            self.send_error(503, "Offer unavailable")
            return

        # Bootstrap: missing token header is allowed so first Connect can learn the token.
        # Wrong token is rejected so a stale client cannot silently pull a new session.
        expected = str(offer.get("token") or "")
        provided = self.headers.get(TOKEN_HEADER, "")
        if expected and provided and provided != expected:
            self.send_error(401, "Invalid token")
            return

        body = json.dumps(offer, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header(MAGIC_HEADER, "1")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        # Obsidian requestUrl is native (no CORS), but allow preflight if a browser probes.
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            f"{TOKEN_HEADER}, Content-Type",
        )
        self.end_headers()


def main() -> int:
    if not OFFER_PATH.is_file():
        sys.stderr.write(
            f"WARN: offer file missing at {OFFER_PATH} — GET /offer will 503 until written.\n"
        )
        sys.stderr.write(
            "Write it with: bash scripts/write-debug-ingest-offer.sh "
            "--session <id> --path /ingest/<uuid> --port <port>\n"
        )

    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), OfferHandler)
    sys.stderr.write(
        f"Debug ingest offer sidecar on http://{LISTEN_HOST}:{LISTEN_PORT}/offer "
        f"(file: {OFFER_PATH})\n"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("\nOffer sidecar stopped.\n")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
