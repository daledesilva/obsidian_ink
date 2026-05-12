#!/usr/bin/env node
/**
 * Manually updates obsidian_ink/.env ingest keys (loopback URL, ingest path, LAN IPv4).
 * For day-to-day work, `npm run build` already runs ensure-ink-debug-ingest-before-build.mjs.
 *
 * Usage:
 *   npm run sync-ink-debug-ingest -- "http://127.0.0.1:7662/ingest/<uuid>"
 *   npm run sync-ink-debug-ingest -- --from-clipboard
 *   npm run sync-ink-debug-ingest -- --prompt
 *   npm run sync-ink-debug-ingest   (no args: try ../.cursor/cursor-debug-ingest-url then prompt)
 */
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { applyIngestBundleToEnv, bundleFromManualFullUrl, firstHttpLine } from './ink-debug-ingest-env-lib.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pluginRoot, '..');
const legacyCursorFile = resolve(repoRoot, '.cursor', 'cursor-debug-ingest-url');
const envPath = resolve(pluginRoot, '.env');

function validateIngestUrl(candidate) {
	const u = candidate?.trim();
	if (!u?.startsWith('http')) return '';
	if (!u.includes('/ingest/')) {
		console.warn('Warning: URL does not contain /ingest/ — still writing if you intend it.');
	}
	return u;
}

function readClipboardDarwin() {
	return execSync('pbpaste', { encoding: 'utf8' }).trim();
}

async function main() {
	const args = process.argv.slice(2);
	let url = '';

	if (args[0]?.startsWith('http')) {
		url = validateIngestUrl(args[0]);
	} else if (args[0] === '--from-clipboard') {
		if (process.platform !== 'darwin') {
			console.error('--from-clipboard only supports macOS (pbpaste). Use explicit URL or --prompt.');
			process.exit(1);
		}
		const clip = readClipboardDarwin();
		const first = clip.split(/\s+/).find((s) => s.startsWith('http'));
		url = validateIngestUrl(first ?? clip);
	} else if (args[0] === '--prompt') {
		const rl = readline.createInterface({ input, output });
		const pasted = await rl.question('Paste full ingest URL (http…/ingest/…): ');
		rl.close();
		url = validateIngestUrl(pasted);
	} else if (args.length === 0) {
		if (fs.existsSync(legacyCursorFile)) {
			const raw = fs.readFileSync(legacyCursorFile, 'utf8');
			const line = firstHttpLine(raw);
			if (line) {
				url = validateIngestUrl(line);
				console.log(`Using URL from ${legacyCursorFile}`);
			}
		}
		if (!url) {
			const rl = readline.createInterface({ input, output });
			const pasted = await rl.question('Paste full ingest URL (http…/ingest/…): ');
			rl.close();
			url = validateIngestUrl(pasted);
		}
	} else {
		console.error(`Unknown argument: ${args[0]}`);
		process.exit(1);
	}

	if (!url) {
		console.error('No valid HTTP ingest URL resolved.');
		console.error('Examples:');
		console.error(`  npm run sync-ink-debug-ingest -- "http://127.0.0.1:7662/ingest/<uuid>"`);
		console.error(`  npm run sync-ink-debug-ingest -- --from-clipboard`);
		console.error(`  npm run sync-ink-debug-ingest -- --prompt`);
		console.error(`  npm run sync-ink-debug-ingest`);
		console.error(`Or add one http line to: ${legacyCursorFile}`);
		process.exit(1);
	}

	const bundle = bundleFromManualFullUrl(url);
	if (!bundle) {
		console.error('Could not derive ingest bundle from URL.');
		process.exit(1);
	}
	applyIngestBundleToEnv(envPath, bundle);
	console.log(`Updated ${envPath}`);
	console.log('INK_DEBUG_CURSOR_INGEST_URL, INK_DEBUG_INGEST_PATH, INK_DEBUG_LAN_IPV4 (values not printed)');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
