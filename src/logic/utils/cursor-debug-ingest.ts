/**
 * Structured NDJSON ingest for Cursor Debug sessions.
 *
 * Prefer this over ad-hoc `fetch` or raw `console.log` when debugging with a Cursor
 * agent in Debug mode. Obsidian mobile must use `requestUrl` (not `fetch`).
 *
 * Remote desktop (Windows) and mobile both POST to the Mac's baked LAN IPv4 — never
 * 127.0.0.1 on the remote machine. Sync XHR runs first so a crash immediately after
 * a log still has a chance to leave the process.
 *
 * @see obsidian_ink/docs/debugging-lan-ingest.md
 */
import { Platform, requestUrl } from 'obsidian';
import { getDefaultStore } from 'jotai';
import { globalsAtom } from 'src/stores/global-store';
import { inkDebugLog } from 'src/logic/utils/universal-dev-logging';

////////

/** Full ingest URL override (wins over baked LAN + path). */
export const INK_DEBUG_INGEST_URL_LOCAL_STORAGE_KEY = 'ink-debug-ingest-url';

/** Vault fallback when HTTP ingest fails (one NDJSON object per line). */
export const INK_CURSOR_DEBUG_VAULT_NDJSON_PATH = '.ink-cursor-debug.ndjson';

/** Groups Windows startup-crash investigation posts in the ingest log. */
export const INK_WINDOWS_STARTUP_DEBUG_RUN_ID = 'windows-startup-crash';

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

/** Returns the baked Cursor Debug session slug, if any. */
function resolveSessionId(): string {
	return bakedSessionId;
}

/**
 * Resolves the ingest URL for this process.
 * Prefers a baked LAN IPv4 whenever present so Windows/iPad reach this Mac over Wi‑Fi.
 */
function resolveIngestUrl(): string | null {
	try {
		const fromLocalStorage = window.localStorage.getItem(INK_DEBUG_INGEST_URL_LOCAL_STORAGE_KEY);
		if (fromLocalStorage?.startsWith('http')) return fromLocalStorage;
	} catch {
		/* ignore */
	}

	const hasBakedLanAndPath = bakedLanIpv4.length > 0 && bakedIngestPath.length > 0;
	if (hasBakedLanAndPath) {
		// Same-network devices (Windows desktop, iPad) cannot use the Mac's loopback.
		return `http://${bakedLanIpv4}:${CURSOR_DEBUG_INGEST_PORT}${bakedIngestPath}`;
	}

	if (bakedIngestPath) {
		return `http://127.0.0.1:${CURSOR_DEBUG_INGEST_PORT}${bakedIngestPath}`;
	}

	return null;
}

/** Appends one NDJSON line to the vault fallback file when the plugin adapter is ready. */
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

/** Turns an unknown throw into JSON-safe fields for ingest. */
export function serializeUnknownError(error: unknown): Record<string, unknown> {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack ?? null,
		};
	}
	try {
		return { message: String(error) };
	} catch {
		return { message: 'unserializable-error' };
	}
}

/**
 * Snapshot of host/runtime fields for a remote startup crash.
 * `isDesktop` / `isMobile` are Obsidian **UI mode**, not OS; Windows Electron can be isMobile.
 */
export function collectInkHostProbe(): Record<string, unknown> {
	const probe: Record<string, unknown> = {
		bakedLanIpv4,
		bakedIngestPath,
		ingestUrl: resolveIngestUrl(),
		userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
		navigatorPlatform: typeof navigator !== 'undefined' ? navigator.platform : null,
		language: typeof navigator !== 'undefined' ? navigator.language : null,
		isWin: Platform.isWin,
		isMacOS: Platform.isMacOS,
		isLinux: Platform.isLinux,
		isDesktop: Platform.isDesktop,
		isMobile: Platform.isMobile,
		isMobileApp: Platform.isMobileApp,
	};
	try {
		type InkWindowWithOptionalProcess = Window & {
			process?: {
				platform?: string;
				arch?: string;
				versions?: Record<string, string>;
				type?: string;
			};
		};
		const inkProcess = (window as InkWindowWithOptionalProcess).process;
		probe.processPlatform = inkProcess?.platform ?? null;
		probe.processArch = inkProcess?.arch ?? null;
		probe.processType = inkProcess?.type ?? null;
		probe.processVersions = inkProcess?.versions ?? null;
	} catch {
		probe.processProbeError = true;
	}
	return probe;
}

/**
 * Blocks until the ingest POST finishes (or errors). Used so a crash in the next
 * statement does not drop the last breadcrumb.
 */
function postCursorDebugIngestSync(ingestUrl: string, sessionId: string, line: string): void {
	try {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', ingestUrl, false);
		xhr.setRequestHeader('Content-Type', 'application/json');
		if (sessionId) xhr.setRequestHeader('X-Debug-Session-Id', sessionId);
		xhr.send(line);
	} catch {
		/* Electron may reject sync XHR; async requestUrl still runs. */
	}
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
		runId: entry.runId ?? INK_WINDOWS_STARTUP_DEBUG_RUN_ID,
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

	postCursorDebugIngestSync(ingestUrl, sessionId, line);

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
