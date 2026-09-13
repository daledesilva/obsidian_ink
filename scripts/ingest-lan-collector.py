#!/usr/bin/env python3
"""Local NDJSON ingest stand-in for Cursor Debug (127.0.0.1:7662).

Cursor Debug normally owns this port. Use this collector when ingest is not
listening so a LAN socat relay still has a destination, and so we can verify
Windows → Mac Wi-Fi posts land in .cursor/debug-<session>.log.

Usage (from obsidian_ink/). Bind a port other than 7662 if Cursor Debug already owns
127.0.0.1:7662, then point the relay at this process:

  python3 scripts/ingest-lan-collector.py --host 127.0.0.1 --port 17662 \
    --session <slug> --log .cursor/debug-<slug>.log
  INGEST_RELAY_TARGET_PORT=17662 bash scripts/ingest-lan-relay.sh
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Write POSTed NDJSON ingest lines to a log file.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7662)
    parser.add_argument("--session", default="winstrt")
    parser.add_argument("--log", default=".cursor/debug-winstrt.log")
    return parser.parse_args()


def add_cors_headers(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, X-Debug-Session-Id")


def main() -> int:
    args = parse_args()
    log_path = Path(args.log).resolve()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.touch(exist_ok=True)

    class IngestHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *log_args: object) -> None:
            sys.stderr.write("%s - %s\n" % (datetime.now(timezone.utc).isoformat(), format % log_args))

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            add_cors_headers(self)
            self.end_headers()

        def do_POST(self) -> None:
            length_header = self.headers.get("Content-Length", "0")
            try:
                body_length = int(length_header)
            except ValueError:
                body_length = 0
            raw_body = self.rfile.read(body_length) if body_length > 0 else b""
            try:
                text = raw_body.decode("utf-8")
            except UnicodeDecodeError:
                text = raw_body.decode("utf-8", errors="replace")
            line = text.strip()
            if not line:
                line = json.dumps(
                    {
                        "sessionId": args.session,
                        "message": "empty-body",
                        "path": self.path,
                        "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
                    }
                )
            with log_path.open("a", encoding="utf-8") as log_file:
                log_file.write(line + "\n")
                log_file.flush()
            self.send_response(204)
            add_cors_headers(self)
            self.end_headers()

        def do_GET(self) -> None:
            payload = json.dumps({"ok": True, "session": args.session, "log": str(log_path)}).encode("utf-8")
            self.send_response(200)
            add_cors_headers(self)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    server = ThreadingHTTPServer((args.host, args.port), IngestHandler)
    sys.stderr.write(
        "Ingest collector listening on http://%s:%s (session=%s log=%s)\n"
        % (args.host, args.port, args.session, log_path)
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("\nStopping ingest collector.\n")
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
