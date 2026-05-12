/**
 * Universal dev logging: helpers always emit to the host console, and when an
 * ingest base URL is configured (`configureNetworkIngest` / `localStorage`), the
 * same structured payload is POSTed via Obsidian `requestUrl` so a LAN or
 * USB-reversed ingest server can append NDJSON if it is running.
 */
import chalk from "chalk";
import { requestUrl, Platform } from "obsidian";
// import * as chalk from 'chalk';

/////////////

// Troubleshooting
// If this error is returned in the console upon running...
// ` TypeError: Cannot read properties of undefined (reading 'userAgentData') `
// It is because some of chalks features are not compatible in the environment you're trying to run it in.
// Downgrade to Chalk version 4 with this:
// npm uninstall chalk
// npm install chalk@4
// And use...
// import * as chalk from 'chalk';

/////////////
/////////////

// Network ingest configuration
let networkIngestUrl: string | null = null;
let networkSessionId: string | null = null;
let networkRunId: string | null = null;

/** For boot diagnostics (e.g. main.ts onload ping). */
export function getInkDebugIngestDiagnostics(): {
	httpIngestUrl: string | null;
	sessionId: string | null;
	runId: string | null;
} {
	return {
		httpIngestUrl: networkIngestUrl,
		sessionId: networkSessionId,
		runId: networkRunId,
	};
}

export type ConfigureNetworkIngestOptions = {
	/**
	 * Full ingest URL for **desktop** builds (inlined loopback from `.env`).
	 * On **Obsidian mobile**, `universal-dev-logging` prefers `http://<INK_DEBUG_LAN_IPV4>:<port><INK_DEBUG_INGEST_PATH>`
	 * when those build-time values exist, so Boox over Wi‑Fi does not require typing the Mac IP in `localStorage`.
	 * `localStorage` `ink-debug-ingest-url` still overrides when set.
	 */
	ingestUrl?: string;
	/**
	 * Path starting with `/`, e.g. `/ingest/1aedc3`. Default when unset: `/ingest/<sessionId>`
	 * (works with `node .cursor/debug-ingest-server.mjs` → `.cursor/ingest-logs.ndjson`).
	 */
	ingestPath?: string;
};

function readBakedProcessEnv(name: string): string {
	try {
		const v =
			typeof process !== 'undefined' && process.env
				? (process.env as Record<string, string | undefined>)[name]
				: undefined;
		return typeof v === 'string' ? v.trim() : '';
	} catch {
		return '';
	}
}

/** Boox / phone: POST to dev machine on LAN using build-time `INK_DEBUG_LAN_IPV4` + `INK_DEBUG_INGEST_PATH`. */
function tryMobileLanIngestUrl(port: number): string | null {
	let isMobileApp = false;
	try {
		isMobileApp = Platform.isMobileApp === true;
	} catch {
		return null;
	}
	if (!isMobileApp) {
		return null;
	}
	const lanIpv4 = readBakedProcessEnv('INK_DEBUG_LAN_IPV4');
	const ingestPath = readBakedProcessEnv('INK_DEBUG_INGEST_PATH');
	if (!lanIpv4 || !ingestPath.startsWith('/')) {
		return null;
	}
	return `http://${lanIpv4}:${port}${ingestPath}`;
}

function resolveIngestUrl(port: number, sessionId: string, options?: ConfigureNetworkIngestOptions): string {
	try {
		const fromLsUrl = localStorage.getItem('ink-debug-ingest-url');
		if (fromLsUrl?.startsWith('http')) {
			return fromLsUrl.trim();
		}
	} catch {
		/* no localStorage (SSR / tests) */
	}

	const mobileLanUrl = tryMobileLanIngestUrl(port);
	if (mobileLanUrl) {
		return mobileLanUrl;
	}

	if (options?.ingestUrl?.startsWith('http')) {
		return options.ingestUrl.trim();
	}

	try {
		const fromLsPath = localStorage.getItem('ink-debug-ingest-path');
		if (fromLsPath?.startsWith('/')) {
			return `http://127.0.0.1:${port}${fromLsPath}`;
		}
	} catch {
		/* no localStorage (SSR / tests) */
	}

	const path = options?.ingestPath ?? `/ingest/${encodeURIComponent(sessionId)}`;
	// 127.0.0.1 on a Boox is the tablet itself; it reaches the dev machine only with adb reverse or LAN URL above.
	return `http://127.0.0.1:${port}${path}`;
}

/**
 * Resolve the HTTP ingest URL and session/run ids. Call once at plugin entry (`main.ts` module scope).
 * Every log helper posts here when a URL exists; failed requests are ignored aside from a console warning.
 *
 * Desktop (Electron): default `http://127.0.0.1:<port>/ingest/<sessionId>` matches
 * `.cursor/debug-ingest-server.mjs`. On **Obsidian mobile**, when the bundle was built with
 * `INK_DEBUG_LAN_IPV4` and `INK_DEBUG_INGEST_PATH` from `ensure-ink-debug-ingest-before-build.mjs`,
 * logs POST to `http://<that-LAN-IP>:<port>/ingest/…` for Boox over Wi‑Fi without `localStorage`.
 * With USB only, `adb reverse tcp:7662 tcp:7662` and the loopback baked URL still work.
 * `localStorage` `ink-debug-ingest-url` / `ink-debug-ingest-path` override when set.
 */
export function configureNetworkIngest(
	port: number,
	sessionId: string,
	runId: string,
	options?: ConfigureNetworkIngestOptions,
): void {
	networkIngestUrl = resolveIngestUrl(port, sessionId, options);
	networkSessionId = sessionId;
	networkRunId = runId;
}

/**
 * Structured agent/debug line (hypothesisId, location, …) for NDJSON ingest.
 * Always logs one JSON line to the console; POSTs the same body when an ingest URL is configured.
 */
export function postAgentDebugIngest(entry: {
	hypothesisId: string;
	location: string;
	message: string;
	data?: Record<string, unknown>;
	runId?: string;
}): void {
	const sessionId = networkSessionId ?? 'ingest-not-configured';
	const runId = entry.runId ?? networkRunId ?? 'unknown';
	const body = {
		sessionId,
		runId,
		hypothesisId: entry.hypothesisId,
		location: entry.location,
		message: entry.message,
		data: entry.data ?? {},
		timestamp: Date.now(),
	};
	const json = JSON.stringify(body);
	// #region agent log
	try {
		console.log('[InkAgentDebug]', json);
	} catch {
		/* ignore */
	}
	const url = networkIngestUrl;
	if (!url) {
		return;
	}
	void requestUrl({
		url,
		method: 'POST',
		contentType: 'application/json',
		body: json,
		headers: {
			...(sessionId ? { 'X-Debug-Session-Id': sessionId } : {}),
		},
		throw: false,
	})
		.then((res) => {
			if (res.status < 200 || res.status >= 300) {
				console.warn('[InkAgentDebug] ingest HTTP non-OK', res.status, url);
			}
		})
		.catch((err: unknown) => {
			console.warn('[InkAgentDebug] ingest requestUrl failed — adb reverse + ingest URL?', url, err);
		});
	// #endregion
}

function postToIngest(level: string, message: string, data?: Record<string, unknown>): void {
	if (!networkIngestUrl) {
		return;
	}
	const sessionId = networkSessionId ?? 'ingest-not-configured';
	const runId = networkRunId ?? 'unknown';
	const payload = {
		sessionId,
		runId,
		level,
		message,
		data: data ?? {},
		timestamp: Date.now(),
	};
	const json = JSON.stringify(payload);
	void requestUrl({
		url: networkIngestUrl,
		method: 'POST',
		contentType: 'application/json',
		body: json,
		headers: {
			'X-Debug-Session-Id': sessionId,
		},
		throw: false,
	})
		.then((res) => {
			if (res.status < 200 || res.status >= 300) {
				console.warn('[Ink] ingest HTTP non-OK', res.status, networkIngestUrl);
			}
		})
		.catch((err: unknown) => {
			console.warn('[Ink] ingest requestUrl failed:', networkIngestUrl, err);
		});
}


function getTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

interface LogOptions {
    freeze?: boolean, // Freeze an object before logging, otherwise changes afterward will be reflected in earlier logs
    stringify?: boolean, // Stringify an object and pretty print it
}

export function info(_data: any|any[], _options: LogOptions = {}) {
    print(chalk.blue.bold('Ink info:'), _data, _options);
    forwardToIngest('info', _data);
}
export function warn(_data: any|any[], _options: LogOptions = {}) {
    print(chalk.yellow.bold('Ink warn:'), _data, _options);
    forwardToIngest('warn', _data);
}
export function error(_data: any|any[], _options: LogOptions = {}) {
    print(chalk.red.bold('Ink error:'), _data, _options);
    forwardToIngest('error', _data);
}
export function debug(_data: any|any[], _options: LogOptions = {}) {
    print(chalk.green.bold('Ink debug:'), _data, _options);
    forwardToIngest('debug', _data);
}
export function http(_data: any|any[], _options: LogOptions = {}) {
    print(chalk.magenta.bold('Ink http:'), _data, _options);
    forwardToIngest('http', _data);
}
export function verbose(_data: any|any[], _options: LogOptions = {}) {
    print(chalk.cyan.bold('Ink verbose:'), _data, _options);
    forwardToIngest('verbose', _data);
}

function forwardToIngest(level: string, _data: any|any[]): void {
    if (_data instanceof Array) {
        const message = _data.filter(d => typeof d === 'string').join(' ');
        const dataObj = _data.find(d => d instanceof Object && !(d instanceof Array));
        postToIngest(level, message || level, dataObj);
    } else if (_data instanceof Object) {
        postToIngest(level, level, _data);
    } else {
        postToIngest(level, String(_data));
    }
}

function print(_label: string, _data: any|any[], _options: LogOptions = {}) {
    if(_data instanceof Array) {
        printArray(_label, _data, _options);
    } else if(_data instanceof Object) {
        printTimestampAndLabel(_label);
        printObj(_data, _options);
        printEmptyLine();
    } else {
        printStr(`${getTimestampAndLabel(_label)} ${_data}`);
    }
}

function printArray(_label: string, _data: any[], _options: LogOptions = {}) {
    let accString = '';

    // If an object is first, print a timestamp and label on line before it
    if(_data[0] instanceof Object) {
        printTimestampAndLabel(_label);
    }
    for(let i=0; i<_data.length; i++) {

        if(_data[i] instanceof Object) {
            // Print accumulated strings so far and reset
            if(accString.length) {
                printStr(accString);
                accString = '';
            }
            // Print object on next line
            printObj(_data[i], _options);

        } else {
            // Collect strings to print on the same line
            if(i===0) {
                accString = `${getTimestampAndLabel(_label)} ${_data[i]}`;
            } else {
                if(accString.length) {
                    // It's already started accumulating, so just add the next item
                    accString = `${accString} ${_data[i]}`;
                } else {
                    // It's after an object, so just don't reshow timestamp
                    accString = `${_label} ${_data[i]}`;
                }
            }

            // If there's no more data, print the accumulated string
            if(i===_data.length-1) {
                printStr(accString);
            }
        }
    }
    // If an object was last, put an empty line after it
    if(_data[_data.length-1] instanceof Object) {
        printEmptyLine();
    }
    
}

function printStr(_str: string) {
    console.log(`${_str}`);
}

function printObj(_data: any, _options: LogOptions) {
    let data: any;
    if(_options.freeze) {
        data = JSON.parse(JSON.stringify(_data));
    } else {
        data = _data;
    }
    if(_options.stringify) {
        data = JSON.stringify(data, null, 2);
    }
    console.log(data);
}

function printTimestampAndLabel(_label: string) {
    console.log(getTimestampAndLabel(_label));
}

function printEmptyLine() {
    console.log('');
}

function getTimestampAndLabel(_label: string): string {
    return `${chalk.grey(getTimestamp())} ${_label}`;
}

