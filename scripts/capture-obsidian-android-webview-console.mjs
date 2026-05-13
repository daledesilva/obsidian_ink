#!/usr/bin/env node
/**
 * Streams Obsidian Android WebView console + JS exceptions to stdout and a file
 * via Chrome DevTools Protocol over adb port forward.
 *
 * Ink Suite defaults: package md.obsidian, local devtools port 9223, output
 * `obsidian-webview-<session-ts>.log` under `DEBUG_CAPTURE_LOG_DIR`, or if unset under
 * `<repo>/.cursor/logs` (<repo> is two levels above this file).
 *
 * **`--session-ts YYYYMMDD-HHMMSS` is required** (same format as `date +%Y%m%d-%H%M%S`) so the
 * filename pairs with **`eink-bridge-<same>.log`** when `start-boox-debug-log-capture.sh` runs both.
 * Run with no args to print instructions on stderr and exit non-zero.
 *
 * After the first successful CDP attach, the script **auto-reconnects** when the WebSocket drops
 * (e.g. Obsidian restart → new PID): it re-runs `pidof`, updates `adb forward`, and reopens the
 * WebView target, appending to the **same** log file until you stop the process (Ctrl+C / SIGTERM).
 *
 * Log directory comes only from **`DEBUG_CAPTURE_LOG_DIR`** (optional env) or the repo default above.
 *
 * Prerequisites: USB debugging, Obsidian (md.obsidian) running on device, WebView inspectable.
 *
 * Usage (from obsidian_ink/):
 *   node scripts/capture-obsidian-android-webview-console.mjs --session-ts "$(date +%Y%m%d-%H%M%S)"
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

/** Ink Suite: Play Store Obsidian Android package */
const OBSIDIAN_ANDROID_PACKAGE = 'md.obsidian';
/** Local TCP port for adb forward (must match nothing else on the host) */
const ADB_LOCAL_DEVTOOLS_PORT = 9223;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
/** Same as `start-boox-debug-log-capture.sh`: parent may set `DEBUG_CAPTURE_LOG_DIR`. */
const CURSOR_LOGS_DIR = process.env.DEBUG_CAPTURE_LOG_DIR
	? path.resolve(process.env.DEBUG_CAPTURE_LOG_DIR)
	: path.join(REPO_ROOT, '.cursor', 'logs');

/** Same shape as `date +%Y%m%d-%H%M%S` (reject path injection / odd values). */
const SESSION_TS_SLUG_RE = /^\d{8}-\d{6}$/;

function printSessionTimestampRequiredAndExit() {
	console.error(`obsidian-android-webview capture: --session-ts is required.

It must match YYYYMMDD-HHMMSS (same as: date +%Y%m%d-%H%M%S). Use the same slug as your paired
eink-bridge-<slug>.log when both captures run together.

From obsidian_ink/:
  node scripts/capture-obsidian-android-webview-console.mjs --session-ts "$(date +%Y%m%d-%H%M%S)"

With npm (POSIX shell; supplies the slug for you):
  npm run capture:android-webview-console

Or pass an explicit slug:
  npm run capture:android-webview-console -- --session-ts "$(date +%Y%m%d-%H%M%S)"
`);
	process.exit(1);
}

function parseCaptureCliArgs(argv) {
	const args = argv.slice(2);
	if (args.length === 0) {
		printSessionTimestampRequiredAndExit();
	}

	let sessionTimestampSlug = null;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === '--help' || arg === '-h') {
			console.log(`Usage: node scripts/capture-obsidian-android-webview-console.mjs --session-ts YYYYMMDD-HHMMSS

Required:
  --session-ts   Log filename slug: obsidian-webview-<slug>.log (must match eink-bridge-<slug>.log
                 when using start-boox-debug-log-capture.sh). Format: YYYYMMDD-HHMMSS
                 (same as: date +%Y%m%d-%H%M%S).

Example:
  node scripts/capture-obsidian-android-webview-console.mjs --session-ts "$(date +%Y%m%d-%H%M%S)"
`);
			process.exit(0);
		}
		if (arg === '--session-ts') {
			const value = args[index + 1];
			if (!value || value.startsWith('-')) {
				console.error('capture: missing value after --session-ts.\n');
				printSessionTimestampRequiredAndExit();
			}
			if (!SESSION_TS_SLUG_RE.test(value)) {
				console.error(
					'capture: --session-ts must match YYYYMMDD-HHMMSS (e.g. from date +%Y%m%d-%H%M%S)'
				);
				process.exit(1);
			}
			sessionTimestampSlug = value;
			index++;
			continue;
		}
		console.error(`capture: unknown argument "${arg}". Use --help.`);
		process.exit(1);
	}

	if (!sessionTimestampSlug) {
		printSessionTimestampRequiredAndExit();
	}

	return sessionTimestampSlug;
}

function adb(args) {
	return execSync(['adb', ...args].join(' '), { encoding: 'utf8' }).trim();
}

function httpGetJson(url) {
	return new Promise((resolve, reject) => {
		http.get(url, (res) => {
			let body = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => {
				body += chunk;
			});
			res.on('end', () => {
				try {
					resolve(JSON.parse(body));
				} catch (e) {
					reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
				}
			});
		}).on('error', reject);
	});
}

function formatRemoteObject(obj) {
	if (!obj) return '';
	if (obj.value !== undefined) {
		if (typeof obj.value === 'string') return obj.value;
		try {
			return JSON.stringify(obj.value);
		} catch {
			return String(obj.value);
		}
	}
	if (obj.description) return obj.description;
	if (obj.objectId) return `[${obj.type}]`;
	return obj.type || '';
}

function pickObsidianTarget(list) {
	if (!Array.isArray(list) || list.length === 0) return null;
	const scored = list
		.filter((t) => t.webSocketDebuggerUrl)
		.map((t) => {
			const url = (t.url || '').toLowerCase();
			const title = (t.title || '').toLowerCase();
			let score = 0;
			if (url.includes('obsidian')) score += 3;
			if (url.includes('app://obsidian')) score += 5;
			if (title.includes('obsidian')) score += 2;
			return { t, score };
		})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score);
	if (scored.length > 0) return scored[0].t;
	return list.find((t) => t.webSocketDebuggerUrl && (t.type === 'webview' || t.type === 'page')) || null;
}

function appendLine(outPath, line) {
	process.stdout.write(`${line}\n`);
	if (outPath) {
		fs.appendFileSync(outPath, `${line}\n`, 'utf8');
	}
}

function removeAdbForwardQuietly() {
	try {
		execSync(`adb forward --remove tcp:${ADB_LOCAL_DEVTOOLS_PORT}`, { stdio: 'ignore' });
	} catch {
		// ignore
	}
}

function readObsidianPidOrEmpty() {
	try {
		return adb(['shell', 'pidof', '-s', OBSIDIAN_ANDROID_PACKAGE]);
	} catch {
		return '';
	}
}

async function interruptibleSleep(totalMilliseconds, shouldAbort = () => false) {
	const stepMilliseconds = 250;
	let remaining = totalMilliseconds;
	while (remaining > 0 && !shouldAbort()) {
		const chunk = Math.min(stepMilliseconds, remaining);
		await new Promise((resolve) => setTimeout(resolve, chunk));
		remaining -= chunk;
	}
}

/**
 * @param {string} outPath
 * @param {{ waitIfMissing: boolean; shouldAbort: () => boolean }} options
 * @returns {Promise<string | null>} pid, or null if not running (when not waiting) or abort
 */
async function waitForObsidianPid(outPath, { waitIfMissing, shouldAbort }) {
	let backoffMilliseconds = 1500;
	const backoffMaxMilliseconds = 12000;
	while (!shouldAbort()) {
		const pid = readObsidianPidOrEmpty();
		if (pid) {
			return pid;
		}
		if (!waitIfMissing) {
			return null;
		}
		appendLine(
			outPath,
			`# WebView capture: ${OBSIDIAN_ANDROID_PACKAGE} not running (pidof empty); retry in ${Math.round(backoffMilliseconds / 1000)}s`
		);
		await interruptibleSleep(backoffMilliseconds, shouldAbort);
		if (shouldAbort()) {
			return null;
		}
		backoffMilliseconds = Math.min(
			backoffMaxMilliseconds,
			Math.floor(backoffMilliseconds * 1.5)
		);
	}
	return null;
}

function handleCdpMessage(outPath, data) {
	let msg;
	try {
		msg = JSON.parse(data.toString());
	} catch {
		return;
	}
	if (msg.method === 'Runtime.consoleAPICalled') {
		const p = msg.params;
		const type = p.type || 'log';
		const text = (p.args || []).map(formatRemoteObject).join(' ');
		appendLine(outPath, `[console.${type}] ${text}`);
	} else if (msg.method === 'Runtime.exceptionThrown') {
		const desc = msg.params?.exceptionDetails?.text || JSON.stringify(msg.params);
		appendLine(outPath, `[exception] ${desc}`);
	} else if (msg.method === 'Log.entryAdded') {
		const entry = msg.params?.entry;
		if (entry) {
			appendLine(outPath, `[browser.${entry.level || 'log'}] ${entry.text || ''} ${entry.url || ''}`);
		}
	}
}

async function main() {
	fs.mkdirSync(CURSOR_LOGS_DIR, { recursive: true });
	const tsSlug = parseCaptureCliArgs(process.argv);
	const outPath = path.join(CURSOR_LOGS_DIR, `obsidian-webview-${tsSlug}.log`);

	let shuttingDown = false;
	/** After first successful CDP `open`, wait for Obsidian if it disappears (restart / force-stop). */
	let waitForObsidianIfMissing = false;
	let activeWebSocket = null;

	const shutdownAndExit = (exitCode) => {
		shuttingDown = true;
		if (activeWebSocket) {
			try {
				activeWebSocket.removeAllListeners();
				activeWebSocket.close();
			} catch {
				// ignore
			}
			activeWebSocket = null;
		}
		removeAdbForwardQuietly();
		process.exit(exitCode);
	};

	process.on('SIGINT', () => {
		appendLine(outPath, `# capture stopped (SIGINT)`);
		shutdownAndExit(0);
	});
	process.on('SIGTERM', () => {
		shutdownAndExit(0);
	});

	appendLine(outPath, `# output file=${outPath}`);

	const shouldAbort = () => shuttingDown;

	while (!shuttingDown) {
		const pid = await waitForObsidianPid(outPath, {
			waitIfMissing: waitForObsidianIfMissing,
			shouldAbort,
		});
		if (shuttingDown) {
			break;
		}
		if (!pid) {
			if (shuttingDown) {
				break;
			}
			console.error(
				`No running process for package ${OBSIDIAN_ANDROID_PACKAGE} (pidof returned empty). Start Obsidian on the device, then run this script again.`
			);
			removeAdbForwardQuietly();
			process.exit(1);
		}

		try {
			removeAdbForwardQuietly();
			execSync(
				`adb forward tcp:${ADB_LOCAL_DEVTOOLS_PORT} localabstract:webview_devtools_remote_${pid}`,
				{ stdio: 'ignore' }
			);
		} catch {
			console.error(
				'adb forward failed. Check adb devices; another process may be using the devtools port.'
			);
			await interruptibleSleep(3000, shouldAbort);
			continue;
		}

		const base = `http://127.0.0.1:${ADB_LOCAL_DEVTOOLS_PORT}`;
		let list;
		try {
			list = await httpGetJson(`${base}/json/list`);
		} catch (e) {
			appendLine(outPath, `# /json/list failed: ${e.message}; retrying`);
			removeAdbForwardQuietly();
			await interruptibleSleep(2000, shouldAbort);
			continue;
		}

		const target = pickObsidianTarget(list);
		if (!target || !target.webSocketDebuggerUrl) {
			appendLine(outPath, '# no suitable CDP WebView target yet; retrying');
			removeAdbForwardQuietly();
			await interruptibleSleep(2000, shouldAbort);
			continue;
		}

		if (!waitForObsidianIfMissing) {
			appendLine(
				outPath,
				`# Obsidian WebView console capture — package=${OBSIDIAN_ANDROID_PACKAGE} pid=${pid}`
			);
			appendLine(outPath, `# target url=${target.url || ''} title=${target.title || ''}`);
		} else {
			appendLine(
				outPath,
				`# CDP reattach pid=${pid} url=${target.url || ''} title=${target.title || ''}`
			);
		}

		const wsUrl = target.webSocketDebuggerUrl.replace('localhost', '127.0.0.1');
		const ws = new WebSocket(wsUrl);
		activeWebSocket = ws;
		let nextId = 1;

		await new Promise((resolve) => {
			let socketFinished = false;
			const finishSocketSession = () => {
				if (socketFinished) {
					return;
				}
				socketFinished = true;
				activeWebSocket = null;
				resolve();
			};

			ws.on('open', () => {
				waitForObsidianIfMissing = true;
				ws.send(JSON.stringify({ id: nextId++, method: 'Runtime.enable', params: {} }));
				ws.send(JSON.stringify({ id: nextId++, method: 'Log.enable', params: {} }));
			});

			ws.on('message', (data) => {
				handleCdpMessage(outPath, data);
			});

			ws.on('error', (err) => {
				appendLine(outPath, `# WebSocket error: ${err.message}`);
				finishSocketSession();
			});

			ws.on('close', () => {
				appendLine(outPath, '# WebSocket closed');
				finishSocketSession();
			});
		});

		if (shuttingDown) {
			break;
		}
		appendLine(outPath, '# WebView capture: reconnecting after disconnect…');
		await interruptibleSleep(1500, shouldAbort);
	}

	removeAdbForwardQuietly();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
