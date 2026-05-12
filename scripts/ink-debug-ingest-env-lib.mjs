/**
 * Shared helpers for Ink debug ingest → obsidian_ink/.env
 * (keep DEFAULT_INGEST_PORT and DEFAULT_SESSION_SLUG in sync with `main.ts` fallback for `INK_DEBUG_INGEST_SESSION_ID`).
 */
import fs from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

export const KEY = 'INK_DEBUG_CURSOR_INGEST_URL';
export const KEY_INGEST_PATH = 'INK_DEBUG_INGEST_PATH';
export const KEY_LAN_IPV4 = 'INK_DEBUG_LAN_IPV4';
/** NDJSON `sessionId` / `X-Debug-Session-Id` (Cursor names `.cursor/debug-<slug>.log` from this, not from `/ingest/<uuid>`). */
export const KEY_INGEST_SESSION_ID = 'INK_DEBUG_INGEST_SESSION_ID';

/** Must match `configureNetworkIngest(7662, …)` in main.ts. */
export const DEFAULT_INGEST_PORT = 7662;
export const DEFAULT_INGEST_ORIGIN = `http://127.0.0.1:${DEFAULT_INGEST_PORT}`;
/** Must match the `sessionId` string passed to `configureNetworkIngest` in main.ts. */
export const DEFAULT_SESSION_SLUG = '1aedc3';

export function firstHttpLine(text) {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0 && !line.startsWith('#') && line.startsWith('http'));
}

export function upsertEnvKey(envFilePath, key, value) {
	const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	const newLine = `${key}="${escaped}"`;
	let content = '';
	if (fs.existsSync(envFilePath)) {
		content = fs.readFileSync(envFilePath, 'utf8');
	}
	const lines = content.length ? content.split(/\n/) : [];
	const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=`);
	let found = false;
	const out = lines.map((line) => {
		if (re.test(line)) {
			found = true;
			return newLine;
		}
		return line;
	});
	if (!found) {
		const hasInkDebugKeyAlready = out.some((line) => /^INK_DEBUG_[A-Z0-9_]+=/.test(line.trim()));
		if (!hasInkDebugKeyAlready) {
			if (out.length && out[out.length - 1] !== '') {
				out.push('');
			}
			out.push('# HTTP ingest (universal-dev-logging / esbuild). See eink-bridge/docs/implementations/debug-logging.md');
		} else if (out.length && out[out.length - 1] !== '') {
			out.push('');
		}
		out.push(newLine);
		if (!hasInkDebugKeyAlready) {
			out.push('');
		}
	}
	fs.writeFileSync(envFilePath, out.join('\n'), 'utf8');
}

export function applyIngestBundleToEnv(envFilePath, bundle) {
	upsertEnvKey(envFilePath, KEY, bundle.desktopLoopbackUrl);
	upsertEnvKey(envFilePath, KEY_INGEST_PATH, bundle.ingestPath);
	upsertEnvKey(envFilePath, KEY_LAN_IPV4, bundle.lanIpv4);
}

/** Slug for NDJSON session (alphanumeric + `_` `-`; must stay filesystem-safe for `.cursor/debug-<slug>.log`). */
export function isValidIngestSessionSlug(value) {
	return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
}

/**
 * Resolves the ingest **session slug** (not the `/ingest/<uuid>` path — that still comes from the URL bundle).
 * Discovery: shell `INK_DEBUG_INGEST_SESSION_ID` → `.cursor/cursor-debug-session-id` → `DEFAULT_SESSION_SLUG`.
 */
export function deriveIngestSessionId(repoRoot) {
	const shell = process.env.INK_DEBUG_INGEST_SESSION_ID?.trim();
	if (shell && isValidIngestSessionSlug(shell)) {
		return { sessionId: shell, source: 'shell:INK_DEBUG_INGEST_SESSION_ID' };
	}
	const sessionFile = resolve(repoRoot, '.cursor', 'cursor-debug-session-id');
	if (fs.existsSync(sessionFile)) {
		const raw = fs.readFileSync(sessionFile, 'utf8');
		for (const part of raw.split(/\r?\n/)) {
			const t = part.trim();
			if (!t || t.startsWith('#')) {
				continue;
			}
			if (isValidIngestSessionSlug(t)) {
				return { sessionId: t, source: 'file:.cursor/cursor-debug-session-id' };
			}
		}
	}
	return { sessionId: DEFAULT_SESSION_SLUG, source: 'default(main.ts session slug)' };
}

export function applyIngestSessionIdToEnv(envFilePath, sessionId) {
	upsertEnvKey(envFilePath, KEY_INGEST_SESSION_ID, sessionId);
}

export function readExistingEnvIngestUrl(pluginRoot) {
	return readExistingEnvKey(pluginRoot, KEY);
}

function readExistingEnvKey(pluginRoot, key) {
	const envFilePath = resolve(pluginRoot, '.env');
	if (!fs.existsSync(envFilePath)) {
		return '';
	}
	try {
		for (const rawLine of fs.readFileSync(envFilePath, 'utf8').split(/\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith('#')) {
				continue;
			}
			const match = line.match(new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(.+)$`));
			if (!match) {
				continue;
			}
			let value = match[1].trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			return value;
		}
	} catch {
		/* ignore */
	}
	return '';
}

function urlLooksLoopback(url) {
	return url.includes('127.0.0.1') || url.includes('localhost');
}

function parseIngestPathFromFullUrl(url) {
	try {
		const u = new URL(url);
		if (u.pathname.startsWith('/ingest/')) {
			return u.pathname;
		}
	} catch {
		/* ignore */
	}
	return '';
}

function ipv4FromHostname(hostname) {
	if (!hostname || hostname === 'localhost') {
		return '';
	}
	const m = hostname.match(/^(\d{1,3}(?:\.\d{1,3}){3})$/);
	const ip = m ? m[1] : '';
	if (!ip || ip.startsWith('127.')) {
		return '';
	}
	return ip;
}

/**
 * Best-effort primary LAN IPv4 of the machine running the build (Mac dev host for Boox Wi‑Fi).
 * Skipped when `INK_DEBUG_SKIP_LAN_DISCOVERY=1`.
 */
export function discoverPrimaryLanIpv4() {
	if (process.env.INK_DEBUG_SKIP_LAN_DISCOVERY === '1') {
		return '';
	}
	const nets = os.networkInterfaces();
	const candidates = [];
	for (const name of Object.keys(nets)) {
		for (const net of nets[name] ?? []) {
			const fam = net.family;
			if (fam !== 'IPv4' && fam !== 4) {
				continue;
			}
			if (net.internal) {
				continue;
			}
			const addr = net.address;
			if (!addr || addr.startsWith('127.')) {
				continue;
			}
			const prio = addr.startsWith('169.254.') ? 10 : 0;
			candidates.push({ addr, prio, name });
		}
	}
	candidates.sort((a, b) => a.prio - b.prio || a.name.localeCompare(b.name));
	return candidates[0]?.addr ?? '';
}

export function ingestPathFromNewestCursorDebugLog(repoRoot) {
	const cursorDir = resolve(repoRoot, '.cursor');
	if (!fs.existsSync(cursorDir)) {
		return '';
	}
	const names = fs.readdirSync(cursorDir).filter((n) => n.startsWith('debug-') && n.endsWith('.log'));
	if (!names.length) {
		return '';
	}
	let best = { name: '', mtime: 0 };
	for (const n of names) {
		const p = resolve(cursorDir, n);
		try {
			const st = fs.statSync(p);
			if (st.mtimeMs > best.mtime) {
				best = { name: n, mtime: st.mtimeMs };
			}
		} catch {
			/* skip */
		}
	}
	if (!best.name) {
		return '';
	}
	const text = fs.readFileSync(resolve(cursorDir, best.name), 'utf8');
	const lines = text.split(/\n/).filter((l) => l.length > 0);
	for (let i = lines.length - 1; i >= 0; i--) {
		const m = lines[i].match(/"httpIngestPath"\s*:\s*"(\/ingest\/[^"]+)"/);
		if (m?.[1]?.startsWith('/ingest/')) {
			return m[1];
		}
	}
	return '';
}

const DEFAULT_DEBUG_LOG_PRUNE_KEEP = 5;

/**
 * Cursor writes `.cursor/debug-<session>.log`; ingest discovery only needs recent files.
 * Deletes older `debug-*.log` in `.cursor/` (keeps the newest N by mtime).
 *
 * Opt out: `INK_DEBUG_SKIP_DEBUG_LOG_PRUNE=1`. Override keep count: `INK_DEBUG_DEBUG_LOG_PRUNE_KEEP=10` (min 1, max 500).
 *
 * @returns {{ removed: number; kept: number }}
 */
export function pruneStaleCursorDebugLogs(repoRoot) {
	if (process.env.INK_DEBUG_SKIP_DEBUG_LOG_PRUNE === '1') {
		return { removed: 0, kept: 0 };
	}
	let keep = DEFAULT_DEBUG_LOG_PRUNE_KEEP;
	const raw = process.env.INK_DEBUG_DEBUG_LOG_PRUNE_KEEP?.trim();
	if (raw) {
		const n = Number(raw);
		if (Number.isFinite(n) && n >= 1) {
			keep = Math.min(500, Math.floor(n));
		}
	}
	const dir = resolve(repoRoot, '.cursor');
	if (!fs.existsSync(dir)) {
		return { removed: 0, kept: 0 };
	}
	const paths = [];
	for (const name of fs.readdirSync(dir)) {
		if (!/^debug-.+\.log$/i.test(name)) {
			continue;
		}
		const p = resolve(dir, name);
		try {
			paths.push({ path: p, mtime: fs.statSync(p).mtimeMs });
		} catch {
			/* skip */
		}
	}
	paths.sort((a, b) => b.mtime - a.mtime);
	const victims = paths.slice(keep);
	for (const row of victims) {
		try {
			fs.unlinkSync(row.path);
		} catch {
			/* ignore */
		}
	}
	return { removed: victims.length, kept: Math.min(paths.length, keep) };
}

function defaultIngestPath() {
	return `/ingest/${encodeURIComponent(DEFAULT_SESSION_SLUG)}`;
}

/**
 * Values written to obsidian_ink/.env before esbuild.
 * - `desktopLoopbackUrl`: desktop / USB-reverse default (`http://127.0.0.1:port/ingest/…`).
 * - `ingestPath`: path only; on **mobile**, combined with `lanIpv4` at runtime.
 * - `lanIpv4`: build-host LAN address for Boox over Wi‑Fi (auto-discovered).
 */
export function deriveIngestEnvBundle({ repoRoot, pluginRoot }) {
	const shell = process.env.INK_DEBUG_CURSOR_INGEST_URL?.trim();
	if (shell?.startsWith('http')) {
		const path = parseIngestPathFromFullUrl(shell) || defaultIngestPath();
		const lanFromHost = (() => {
			try {
				return ipv4FromHostname(new URL(shell).hostname);
			} catch {
				return '';
			}
		})();
		const lanIpv4 = lanFromHost || discoverPrimaryLanIpv4();
		return {
			desktopLoopbackUrl: `${DEFAULT_INGEST_ORIGIN}${path}`,
			ingestPath: path,
			lanIpv4,
			source: 'shell:INK_DEBUG_CURSOR_INGEST_URL',
		};
	}

	const legacyPath = resolve(repoRoot, '.cursor', 'cursor-debug-ingest-url');
	if (fs.existsSync(legacyPath)) {
		const line = firstHttpLine(fs.readFileSync(legacyPath, 'utf8'));
		if (line?.startsWith('http')) {
			const path = parseIngestPathFromFullUrl(line) || defaultIngestPath();
			let lanFromHost = '';
			try {
				lanFromHost = ipv4FromHostname(new URL(line).hostname);
			} catch {
				/* ignore */
			}
			const lanIpv4 = lanFromHost || discoverPrimaryLanIpv4();
			return {
				desktopLoopbackUrl: `${DEFAULT_INGEST_ORIGIN}${path}`,
				ingestPath: path,
				lanIpv4,
				source: 'file:.cursor/cursor-debug-ingest-url',
			};
		}
	}

	const pathFromLog = ingestPathFromNewestCursorDebugLog(repoRoot);
	const existing = readExistingEnvIngestUrl(pluginRoot);
	const fromLogLoopback = pathFromLog
		? `${DEFAULT_INGEST_ORIGIN}${pathFromLog}`
		: '';

	if (
		pathFromLog &&
		existing &&
		!urlLooksLoopback(existing) &&
		fromLogLoopback &&
		urlLooksLoopback(fromLogLoopback)
	) {
		let lanFromHost = '';
		try {
			lanFromHost = ipv4FromHostname(new URL(existing).hostname);
		} catch {
			/* ignore */
		}
		const lanIpv4 = lanFromHost || discoverPrimaryLanIpv4();
		return {
			desktopLoopbackUrl: `${DEFAULT_INGEST_ORIGIN}${pathFromLog}`,
			ingestPath: pathFromLog,
			lanIpv4,
			source: 'existing:.env LAN + log path (uuid refresh)',
		};
	}

	if (pathFromLog) {
		const lanIpv4 = discoverPrimaryLanIpv4();
		return {
			desktopLoopbackUrl: `${DEFAULT_INGEST_ORIGIN}${pathFromLog}`,
			ingestPath: pathFromLog,
			lanIpv4,
			source: 'file:.cursor/debug-*.log(httpIngestPath)',
		};
	}

	if (existing?.startsWith('http')) {
		const path = parseIngestPathFromFullUrl(existing) || defaultIngestPath();
		let lanFromHost = '';
		try {
			lanFromHost = ipv4FromHostname(new URL(existing).hostname);
		} catch {
			/* ignore */
		}
		const lanIpv4 = lanFromHost || discoverPrimaryLanIpv4();
		return {
			desktopLoopbackUrl: `${DEFAULT_INGEST_ORIGIN}${path}`,
			ingestPath: path,
			lanIpv4,
			source: 'existing:obsidian_ink/.env',
		};
	}

	const path = defaultIngestPath();
	const lanIpv4 = discoverPrimaryLanIpv4();
	return {
		desktopLoopbackUrl: `${DEFAULT_INGEST_ORIGIN}${path}`,
		ingestPath: path,
		lanIpv4,
		source: 'defaults(main.ts session slug)',
	};
}

/** @deprecated use deriveIngestEnvBundle + applyIngestBundleToEnv */
export function discoverIngestUrl({ repoRoot, pluginRoot }) {
	const b = deriveIngestEnvBundle({ repoRoot, pluginRoot });
	return { url: b.desktopLoopbackUrl, source: b.source };
}

export function bundleFromManualFullUrl(url) {
	const u = url?.trim();
	if (!u?.startsWith('http')) {
		return null;
	}
	const path = parseIngestPathFromFullUrl(u) || defaultIngestPath();
	let lanFromHost = '';
	try {
		lanFromHost = ipv4FromHostname(new URL(u).hostname);
	} catch {
		/* ignore */
	}
	const lanIpv4 = lanFromHost || discoverPrimaryLanIpv4();
	return {
		desktopLoopbackUrl: `${DEFAULT_INGEST_ORIGIN}${path}`,
		ingestPath: path,
		lanIpv4,
		source: 'manual',
	};
}
