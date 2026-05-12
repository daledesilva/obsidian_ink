#!/usr/bin/env node
/**
 * Runs before `tsc` / esbuild: writes ingest-related keys into obsidian_ink/.env
 * so the bundle picks them up (see esbuild.config.mjs).
 *
 * Keys written:
 * - `INK_DEBUG_CURSOR_INGEST_URL` — desktop / `adb reverse` default (`http://127.0.0.1:7662/ingest/…`).
 * - `INK_DEBUG_INGEST_PATH` — path only (`/ingest/…`); on Obsidian **mobile**, combined with LAN at runtime.
 * - `INK_DEBUG_LAN_IPV4` — build host’s LAN IPv4 (auto-discovered for Boox over Wi‑Fi).
 * - `INK_DEBUG_INGEST_SESSION_ID` — NDJSON session slug (see `deriveIngestSessionId` in `ink-debug-ingest-env-lib.mjs`).
 *
 * Discovery order for path / loopback URL (see `deriveIngestEnvBundle` in `ink-debug-ingest-env-lib.mjs`):
 * 1. Shell `INK_DEBUG_CURSOR_INGEST_URL`
 * 2. Repo `../.cursor/cursor-debug-ingest-url` (one http line)
 * 3. Newest `../.cursor/debug-*.log` — `"httpIngestPath":"/ingest/…"`
 * 4. Preserve existing non-loopback `.env` URL vs loopback-from-log when applicable
 * 5. Defaults
 *
 * Set `INK_DEBUG_SKIP_AUTO_INGEST=1` to skip writing .env.
 * Set `INK_DEBUG_SKIP_LAN_DISCOVERY=1` to leave `INK_DEBUG_LAN_IPV4` empty (CI / no Wi‑Fi dev host).
 *
 * After a successful write, stale **`.cursor/debug-*.log`** files are pruned (newest 5 kept) unless
 * `INK_DEBUG_SKIP_DEBUG_LOG_PRUNE=1`. Count: `INK_DEBUG_DEBUG_LOG_PRUNE_KEEP`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	applyIngestBundleToEnv,
	applyIngestSessionIdToEnv,
	deriveIngestEnvBundle,
	deriveIngestSessionId,
	pruneStaleCursorDebugLogs,
} from './ink-debug-ingest-env-lib.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pluginRoot, '..');
const envPath = resolve(pluginRoot, '.env');

if (process.env.INK_DEBUG_SKIP_AUTO_INGEST === '1') {
	console.log('[ink-debug-ingest] skip write (INK_DEBUG_SKIP_AUTO_INGEST=1)');
	process.exit(0);
}

const bundle = deriveIngestEnvBundle({ repoRoot, pluginRoot });
const session = deriveIngestSessionId(repoRoot);
applyIngestBundleToEnv(envPath, bundle);
applyIngestSessionIdToEnv(envPath, session.sessionId);
const pruned = pruneStaleCursorDebugLogs(repoRoot);
console.log(
	`[ink-debug-ingest] updated .env (ingest: ${bundle.source}; session: ${session.source}); URL + path + LAN + INK_DEBUG_INGEST_SESSION_ID`,
);
if (pruned.removed > 0) {
	console.log(`[ink-debug-ingest] pruned ${pruned.removed} stale .cursor/debug-*.log (kept ${pruned.kept})`);
}
