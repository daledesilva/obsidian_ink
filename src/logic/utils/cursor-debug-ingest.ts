/**
 * Structured NDJSON ingest for Cursor Debug sessions.
 *
 * Prefer this over ad-hoc `fetch` or raw `console.log` when debugging with a Cursor
 * agent in Debug mode. Obsidian mobile must use `requestUrl` (not `fetch`).
 *
 * @see obsidian_ink/docs/debugging-on-ipad.md
 */
import { Platform, requestUrl } from 'obsidian';
import { getDefaultStore } from 'jotai';
import { globalsAtom } from 'src/stores/global-store';
import { inkDebugLog } from 'src/logic/utils/universal-dev-logging';

/** Full ingest URL override (wins over baked LAN + path). */
export const INK_DEBUG_INGEST_URL_LOCAL_STORAGE_KEY = 'ink-debug-ingest-url';

/** Vault fallback when HTTP ingest fails (one NDJSON object per line). */
export const INK_CURSOR_DEBUG_VAULT_NDJSON_PATH = '.ink-cursor-debug.ndjson';

declare const INK_DEBUG_CURSOR_SESSION_ID: string | undefined;
declare const INK_DEBUG_INGEST_PATH: string | undefined;
declare const INK_DEBUG_LAN_IPV4: string | undefined;

const bakedSessionId =
	typeof INK_DEBUG_CURSOR_SESSION_ID === 'string' ? INK_DEBUG_CURSOR_SESSION_ID : '';
const bakedIngestPath =
	typeof INK_DEBUG_INGEST_PATH === 'string' ? INK_DEBUG_INGEST_PATH : '';
const bakedLanIpv4 =
	typeof INK_DEBUG_LAN_IPV4 === 'string' && INK_DEBUG_LAN_IPV4.length > 0
		? INK_DEBUG_LAN_IPV4
		: '';

const CURSOR_DEBUG_INGEST_PORT = 7662;

export type CursorDebugIngestEntry = {
	hypothesisId: string;
	location: string;
	message: string;
	data?: Record<string, unknown>;
	runId?: string;
};

function resolveSessionId(): string {
	return bakedSessionId;
}

function resolveIngestUrl(): string | null {
	try {
		const fromLocalStorage = window.localStorage.getItem(INK_DEBUG_INGEST_URL_LOCAL_STORAGE_KEY);
		if (fromLocalStorage?.startsWith('http')) return fromLocalStorage;
	} catch {
		/* ignore */
	}

	if (Platform.isMobile && bakedLanIpv4 && bakedIngestPath) {
		return `http://${bakedLanIpv4}:${CURSOR_DEBUG_INGEST_PORT}${bakedIngestPath}`;
	}

	if (bakedIngestPath) {
		return `http://127.0.0.1:${CURSOR_DEBUG_INGEST_PORT}${bakedIngestPath}`;
	}

	return null;
}

function appendCursorDebugVaultLine(line: string): void {
	try {
		const globals = getDefaultStore().get(globalsAtom);
		if (!globals?.plugin?.app?.vault?.adapter) return;
		const adapter = globals.plugin.app.vault.adapter;
		void (async () => {
			try {
				const exists = await adapter.exists(INK_CURSOR_DEBUG_VAULT_NDJSON_PATH);
				if (exists) {
					await adapter.append(INK_CURSOR_DEBUG_VAULT_NDJSON_PATH, `${line}\n`);
				} else {
					await adapter.write(INK_CURSOR_DEBUG_VAULT_NDJSON_PATH, `${line}\n`);
				}
			} catch {
				/* ignore */
			}
		})();
	} catch {
		/* plugin globals not ready */
	}
}

/** True when a Cursor Debug session is configured (baked and/or localStorage URL). */
export function isCursorDebugIngestConfigured(): boolean {
	return resolveSessionId().length > 0 || resolveIngestUrl() !== null;
}

/**
 * POST one NDJSON line to the Cursor Debug ingest endpoint (when configured).
 * Also mirrors to `[InkDebug]` console output and optional vault NDJSON fallback.
 */
export function postCursorDebugIngest(entry: CursorDebugIngestEntry): void {
	const sessionId = resolveSessionId();
	const ingestUrl = resolveIngestUrl();
	if (!sessionId && !ingestUrl) return;

	const payload = {
		...(sessionId ? { sessionId } : {}),
		...entry,
		timestamp: Date.now(),
	};
	const line = JSON.stringify(payload);

	try {
		inkDebugLog(entry);
	} catch {
		/* ignore */
	}

	appendCursorDebugVaultLine(line);

	if (!ingestUrl) return;

	void requestUrl({
		url: ingestUrl,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(sessionId ? { 'X-Debug-Session-Id': sessionId } : {}),
		},
		body: line,
		throw: false,
	}).catch(() => {});
}
