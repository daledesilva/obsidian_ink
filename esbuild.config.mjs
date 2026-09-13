import esbuild from "esbuild";
import process from "process";
import { builtinModules } from 'node:module';
import { sassPlugin } from 'esbuild-sass-plugin'
import { copy } from 'esbuild-plugin-copy';
import svg from 'esbuild-plugin-svg';


// import renamePlugin from "./rename-plugin";
import fs from 'fs';
import { execSync } from 'child_process';

function detectBuildHostLanIpv4() {
	if (process.env.INK_DEBUG_SKIP_LAN_DISCOVERY === '1') return '';
	if (process.env.INK_DEBUG_LAN_IPV4) return process.env.INK_DEBUG_LAN_IPV4;
	for (const networkInterface of ['en0', 'en1']) {
		try {
			const ipv4 = execSync(`ipconfig getifaddr ${networkInterface}`, {
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'ignore'],
			}).trim();
			if (ipv4) return ipv4;
		} catch {
			/* try next interface */
		}
	}
	return '';
}

const inkDebugLanIpv4 = detectBuildHostLanIpv4();
const inkDebugCursorSessionId = process.env.INK_DEBUG_CURSOR_SESSION_ID ?? '';
const inkDebugIngestPath = process.env.INK_DEBUG_INGEST_PATH ?? '';
if (inkDebugLanIpv4) {
	console.info(`[esbuild] INK_DEBUG_LAN_IPV4=${inkDebugLanIpv4} (baked for LAN ingest: Windows/iPad)`);
}
if (inkDebugCursorSessionId || inkDebugIngestPath) {
	console.info(
		`[esbuild] Cursor debug ingest: session=${inkDebugCursorSessionId || '(none)'} path=${inkDebugIngestPath || '(none)'}`,
	);
}

const renamePlugin = () => ({
	name: 'rename-plugin',
	setup(build) {
		build.onEnd(async () => {
			try {
				fs.renameSync('./dist/main.css', './dist/styles.css');
			} catch (e) {
				console.error('Failed to main.css to styles.css file:', e);
			}
		});
	},
});

const copyManifestPlugin = () => ({
	name: 'copy-manifest-plugin',
	setup(build) {
		build.onEnd(async () => {
			try {
				fs.copyFileSync('./manifest.json', './dist/manifest.json');
			} catch (e) {
				console.error('Failed to copy manifest.json to dist:', e);
			}
			try {
				fs.copyFileSync('./manifest-beta.json', './dist/manifest-beta.json');
			} catch (e) {
				console.error('Failed to copy manifest-beta.json to dist:', e);
			}
		});
	},
});



/**
 * Runs before any bundled plugin module (tldraw, main imports).
 * Windows startup crashes often happen during that first evaluation, so ingest
 * must be armed here — not in Plugin.onload.
 */
function buildEarlyDebugIngestBanner() {
	const hasLanAndPath = inkDebugLanIpv4.length > 0 && inkDebugIngestPath.length > 0;
	if (!hasLanAndPath) return '';
	const ingestUrl = `http://${inkDebugLanIpv4}:7662${inkDebugIngestPath}`;
	return `(function inkEarlyDebugIngest(){
try {
	var ingestUrl = ${JSON.stringify(ingestUrl)};
	var sessionId = ${JSON.stringify(inkDebugCursorSessionId)};
	function postEarly(entry) {
		var payload = {
			sessionId: sessionId,
			runId: "windows-startup-crash",
			hypothesisId: entry.hypothesisId,
			location: entry.location,
			message: entry.message,
			data: entry.data || {},
			timestamp: Date.now()
		};
		var line = JSON.stringify(payload);
		try {
			var xhr = new XMLHttpRequest();
			xhr.open("POST", ingestUrl, false);
			xhr.setRequestHeader("Content-Type", "application/json");
			if (sessionId) xhr.setRequestHeader("X-Debug-Session-Id", sessionId);
			xhr.send(line);
		} catch (postError) {}
		try {
			if (typeof navigator !== "undefined" && navigator.sendBeacon) {
				navigator.sendBeacon(ingestUrl, line);
			}
		} catch (beaconError) {}
	}
	function hostProbe() {
		var probe = {
			bakedIngestUrl: ingestUrl,
			userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
			navigatorPlatform: typeof navigator !== "undefined" ? navigator.platform : null
		};
		try {
			if (typeof window !== "undefined" && window.process) {
				probe.processPlatform = window.process.platform || null;
				probe.processArch = window.process.arch || null;
				probe.processVersions = window.process.versions || null;
			}
		} catch (probeError) {}
		return probe;
	}
	if (typeof window !== "undefined" && !window.__inkEarlyDebugIngestInstalled) {
		window.__inkEarlyDebugIngestInstalled = true;
		window.addEventListener("error", function (event) {
			postEarly({
				hypothesisId: "H-win-global-error",
				location: "esbuild-banner:window.error",
				message: "window error",
				data: {
					message: event && event.message,
					filename: event && event.filename,
					lineno: event && event.lineno,
					colno: event && event.colno,
					stack: event && event.error && event.error.stack ? event.error.stack : null
				}
			});
		});
		window.addEventListener("unhandledrejection", function (event) {
			var reason = event && event.reason;
			postEarly({
				hypothesisId: "H-win-unhandled-rejection",
				location: "esbuild-banner:unhandledrejection",
				message: "unhandledrejection",
				data: {
					reason: reason && reason.message ? reason.message : String(reason),
					stack: reason && reason.stack ? reason.stack : null
				}
			});
		});
	}
	postEarly({
		hypothesisId: "H-win-bundle-eval",
		location: "esbuild-banner:eval",
		message: "plugin bundle started evaluating",
		data: hostProbe()
	});
} catch (bannerError) {}
})();
`;
}

/**
 * Runs after the bundled module graph has finished evaluating.
 * If the banner canary arrived but this did not, the crash was during imports.
 */
function buildEarlyDebugIngestFooter() {
	const hasLanAndPath = inkDebugLanIpv4.length > 0 && inkDebugIngestPath.length > 0;
	if (!hasLanAndPath) return '';
	const ingestUrl = `http://${inkDebugLanIpv4}:7662${inkDebugIngestPath}`;
	return `(function inkEarlyDebugIngestFooter(){
try {
	var ingestUrl = ${JSON.stringify(ingestUrl)};
	var sessionId = ${JSON.stringify(inkDebugCursorSessionId)};
	var payload = {
		sessionId: sessionId,
		runId: "windows-startup-crash",
		hypothesisId: "H-win-bundle-eval-complete",
		location: "esbuild-footer:eval",
		message: "plugin bundle finished evaluating",
		timestamp: Date.now()
	};
	var line = JSON.stringify(payload);
	var xhr = new XMLHttpRequest();
	xhr.open("POST", ingestUrl, false);
	xhr.setRequestHeader("Content-Type", "application/json");
	if (sessionId) xhr.setRequestHeader("X-Debug-Session-Id", sessionId);
	xhr.send(line);
} catch (footerError) {}
})();
`;
}

// Host Node builtins stay external (same role as the old `builtin-modules` package).
const nodeBuiltinModules = builtinModules.filter(
	(moduleName) => !moduleName.startsWith('_') && moduleName !== 'sys',
);

const banner =
	`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
` + buildEarlyDebugIngestBanner();

const buildMode = process.argv[2];
const prod = buildMode === 'production';
const watch = buildMode === undefined;
const emulateMobile = process.env.INK_EMULATE_MOBILE === 'true';

esbuild.build({
	banner: {
		js: banner,
	},
	footer: {
		js: buildEarlyDebugIngestFooter(),
	},
	entryPoints: ['./src/main.ts'],
	bundle: true,
	external: [
		'obsidian',
		'electron',
		'@codemirror/autocomplete',
		'@codemirror/collab',
		'@codemirror/commands',
		'@codemirror/language',
		'@codemirror/lint',
		'@codemirror/search',
		'@codemirror/state',
		'@codemirror/view',
		'@lezer/common',
		'@lezer/highlight',
		'@lezer/lr',
		...nodeBuiltinModules],
	format: 'cjs',
	watch: watch,
	target: 'es2020',
	logLevel: "info",
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outdir: './dist',
	loader: {
		// '.png': 'file',
		// '.woff2': 'file',
		// '.json': 'file',
		// '.png': 'dataurl',
		// '.woff2': 'dataurl',
		// '.json': 'dataurl',
	},
	// assetNames: "./assets/[name]",
	plugins: [
		sassPlugin({
			filter: /.(s[ac]ss|css)$/,
		}),
		svg(),
		copy({
			resolveFrom: 'cwd',	// Returns name of current working directory
			assets: {
				from: ['./src/static/**/*'],
				to: ['./dist'],
			},
		}),

		// Enables manifest.json to live in root as that's what obsidian expects in a repository, and this copies it to dist
		copyManifestPlugin(),
		// Renames main.css to styles.css as that's what obsidian expects
		renamePlugin(),
	],
	define: {
		'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development'),
		'process.env.INK_EMULATE_MOBILE': JSON.stringify(emulateMobile ? 'true' : 'false'),
		'INK_DEBUG_LAN_IPV4': JSON.stringify(inkDebugLanIpv4),
		'INK_DEBUG_CURSOR_SESSION_ID': JSON.stringify(inkDebugCursorSessionId),
		'INK_DEBUG_INGEST_PATH': JSON.stringify(inkDebugIngestPath),
	}
}).catch(() => process.exit(1));

