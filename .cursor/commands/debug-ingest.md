# Debug ingest (Wi‑Fi / Cursor Debug)

Set up live NDJSON ingest from the Obsidian plugin (desktop or mobile) into Cursor’s Debug log file so the agent can watch runtime evidence.

Any text after `/debug-ingest` is optional context (e.g. iPad, session id).

## Preconditions

- User should be in (or about to start) a **Cursor Debug** agent session — shell scripts **cannot** start the ingest listener.
- Note from Debug session context: **session ID** (slug), **ingest path** (`/ingest/<uuid>`), **ingest port**, **log file** (`.cursor/debug-<sessionId>.log`). Path UUID ≠ session slug.

## Steps

1. **Confirm Debug ingest is live**
   - If this is not a Debug-mode session, tell the user to start one (or switch) before continuing.
   - Record session id, ingest path, ingest port, and log file path from the system/debug context.

2. **Start the LAN relay** (required for a device that is not this Mac):
   ```bash
   bash scripts/ingest-lan-relay.sh
   ```
   Run in the background. Requires `socat`. It forwards `0.0.0.0:7662` to localhost. Ink does not read the offer on port 7663.

3. **Bake the session into a local build**, then copy `dist/`:
   ```bash
   INK_DEBUG_CURSOR_SESSION_ID=<sessionId> \
   INK_DEBUG_INGEST_PATH=<ingestPath> \
   npm run build
   ```
   For iPad or another computer, also set `INK_DEBUG_LAN_IPV4` to this Mac's Wi-Fi address. Never bake `127.0.0.1` for a remote device. Copy `dist/main.js`, `dist/styles.css`, and `dist/manifest.json` into the vault's `.obsidian/plugins/ink/`. `npm run internal-release` builds committed code only.

4. **Optional offer** (the plugin does not request it):
   ```bash
   bash scripts/write-debug-ingest-offer.sh \
     --session <sessionId> --path <ingestPath> --port <ingestPort>
   python3 scripts/debug-ingest-offer-sidecar.py
   ```
   Host check: `bash scripts/print-debug-ingest-settings.sh`.

5. **Clear only the session Cursor Debug log** when preparing a **new** reproduction you are about to ask for (not when analyzing a run the user already finished):
   - Truncate/delete **only** `.cursor/debug-<sessionId>.log` for this session.
   - Do **not** delete other sessions' logs. See `.cursor/rules/preserve-sync-debug-logs.mdc`.

6. **Reproduce**, then **read** `.cursor/debug-<sessionId>.log` and cite line evidence before fixing.

7. After a verified fix, remove temporary ad-hoc ingest call sites. Keep `src/logic/utils/cursor-debug-ingest.ts`.

## Do not

- Use `fetch('http://127.0.0.1:…')` inside the plugin — use `requestUrl` via `postCursorDebugIngest`.
- Assume USB alone bridges iOS to localhost (use Wi‑Fi + relay).
- Treat silent ingest failure as proof a code path did not run — read `.cursor/debug-<sessionId>.log` after a reproduction.
- Treat the offer sidecar as the ingest path. Ink posts to the baked URL through `scripts/ingest-lan-relay.sh`.

See `docs/debugging-lan-ingest.md`, `docs/debugging-on-ipad.md`, and `.cursor/rules/cursor-debug-ingest.mdc`.
