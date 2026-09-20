import { exec } from 'child_process';

import { ALMOSTUSEFUL_PORTAL_ORIGIN } from 'src/logic/almostuseful/almostuseful-constants';

//////////
//////////

/** Separate portal client for live eval — not the production Ink OAuth app. */
export const ALMOSTUSEFUL_LIVE_TEST_CLIENT_ID = 'testing';
export const ALMOSTUSEFUL_LIVE_TEST_CLIENT_DISPLAY_NAME = 'testing';

const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

export type AlmostUsefulLiveAuthMode = 'device' | 'paste' | 'env';

/** How live eval obtains a portal app JWT before calling handwriting-transcription. */
export function resolveAlmostUsefulLiveAuthMode(): AlmostUsefulLiveAuthMode {
	const raw = process.env.ALMOSTUSEFUL_LIVE_AUTH?.trim().toLowerCase();
	if (raw === 'paste') return 'paste';
	if (raw === 'env' || process.env.ALMOSTUSEFUL_APP_ACCESS_TOKEN?.trim()) return 'env';
	return 'device';
}

export function resolveAlmostUsefulPortalOriginForLiveTests(): string {
	return process.env.ALMOSTUSEFUL_PORTAL_ORIGIN?.trim() || ALMOSTUSEFUL_PORTAL_ORIGIN;
}

export function isAlmostUsefulAccessTokenJwt(value: string): boolean {
	return value.split('.').length === 3;
}

async function postPortalJson(
	portalOrigin: string,
	path: string,
	body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
	const response = await fetch(`${portalOrigin}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	let json: Record<string, unknown> = {};
	try {
		json = (await response.json()) as Record<string, unknown>;
	} catch {
		json = {};
	}
	return { status: response.status, json };
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function openBrowser(url: string): void {
	const escapedUrl = url.replace(/"/g, '\\"');
	const command =
		process.platform === 'darwin'
			? `open "${escapedUrl}"`
			: process.platform === 'win32'
				? `start "" "${escapedUrl}"`
				: `xdg-open "${escapedUrl}"`;

	exec(command, (error) => {
		if (error) {
			console.warn(`[almostuseful-live-auth] Could not open browser: ${error.message}`);
			console.warn(`[almostuseful-live-auth] Open manually: ${url}`);
		}
	});
}

async function readPasteLine(prompt: string): Promise<string> {
	if (!process.stdin.isTTY) {
		throw new Error(
			'ALMOSTUSEFUL_LIVE_AUTH=paste requires an interactive terminal. ' +
				'Use device flow (default) or set ALMOSTUSEFUL_APP_ACCESS_TOKEN.',
		);
	}

	const { createInterface } = await import('readline');
	const readline = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		readline.question(prompt, (answer) => {
			readline.close();
			resolve(answer.trim());
		});
	});
}

async function exchangeDeviceCode(params: {
	portalOrigin: string;
	deviceCode: string;
}): Promise<string> {
	const { status, json } = await postPortalJson(params.portalOrigin, '/api/oauth/token', {
		grant_type: DEVICE_GRANT_TYPE,
		device_code: params.deviceCode,
		client_id: ALMOSTUSEFUL_LIVE_TEST_CLIENT_ID,
	});

	const accessToken = typeof json.access_token === 'string' ? json.access_token : null;
	if (status >= 200 && status < 300 && accessToken) {
		return accessToken;
	}

	const error = typeof json.error === 'string' ? json.error : `HTTP ${status}`;
	throw new Error(`Device token exchange failed: ${error}`);
}

async function pollDeviceCodeUntilAuthorized(params: {
	portalOrigin: string;
	deviceCode: string;
	intervalSeconds: number;
	expiresInSeconds: number;
}): Promise<string> {
	const deadline = Date.now() + params.expiresInSeconds * 1000;
	let intervalMs = params.intervalSeconds * 1000;

	while (Date.now() < deadline) {
		const { status, json } = await postPortalJson(params.portalOrigin, '/api/oauth/token', {
			grant_type: DEVICE_GRANT_TYPE,
			device_code: params.deviceCode,
			client_id: ALMOSTUSEFUL_LIVE_TEST_CLIENT_ID,
		});

		const accessToken = typeof json.access_token === 'string' ? json.access_token : null;
		if (status >= 200 && status < 300 && accessToken) {
			return accessToken;
		}

		const error = typeof json.error === 'string' ? json.error : '';
		if (error === 'authorization_pending') {
			await sleep(intervalMs);
			continue;
		}
		if (error === 'slow_down') {
			intervalMs += 5000;
			await sleep(intervalMs);
			continue;
		}
		if (error === 'expired_token' || error === 'access_denied') {
			throw new Error(`Device authorization failed: ${error}`);
		}

		throw new Error(error || `Unexpected token response (${status})`);
	}

	throw new Error(
		`Device authorization timed out before ${ALMOSTUSEFUL_LIVE_TEST_CLIENT_DISPLAY_NAME} was approved in the browser.`,
	);
}

async function authenticateWithDeviceFlow(portalOrigin: string): Promise<string> {
	const { status, json } = await postPortalJson(portalOrigin, '/api/oauth/device', {
		client_id: ALMOSTUSEFUL_LIVE_TEST_CLIENT_ID,
		display_name: ALMOSTUSEFUL_LIVE_TEST_CLIENT_DISPLAY_NAME,
	});

	const deviceCode = typeof json.device_code === 'string' ? json.device_code : null;
	if (!deviceCode) {
		const error = typeof json.error === 'string' ? json.error : `HTTP ${status}`;
		throw new Error(`Failed to start device login: ${error}`);
	}

	const userCode = typeof json.user_code === 'string' ? json.user_code : '(see browser)';
	const openUrl =
		(typeof json.verification_uri_complete === 'string' && json.verification_uri_complete) ||
		(typeof json.verification_uri === 'string' && json.verification_uri) ||
		`${portalOrigin}/oauth/device`;

	console.log(
		`\n[almostuseful-live-auth] Authorize ${ALMOSTUSEFUL_LIVE_TEST_CLIENT_DISPLAY_NAME} for live eval:`,
	);
	console.log(`  User code: ${userCode}`);
	console.log(`  URL: ${openUrl}\n`);

	openBrowser(openUrl);

	return pollDeviceCodeUntilAuthorized({
		portalOrigin,
		deviceCode,
		intervalSeconds: typeof json.interval === 'number' ? json.interval : 5,
		expiresInSeconds: typeof json.expires_in === 'number' ? json.expires_in : 900,
	});
}

async function authenticateWithPaste(portalOrigin: string): Promise<string> {
	const pasted = await readPasteLine(
		'Paste Almost Useful access token (eyJ…) or a fresh device_code, then press Enter: ',
	);
	if (!pasted) {
		throw new Error('No token pasted.');
	}
	if (isAlmostUsefulAccessTokenJwt(pasted)) {
		return pasted;
	}

	console.log(
		'[almostuseful-live-auth] Treating paste as device_code — approve on /oauth/device if needed.',
	);
	return exchangeDeviceCode({ portalOrigin, deviceCode: pasted });
}

/**
 * Resolves a portal app JWT for live eval: env token, interactive paste, or
 * device-code flow (opens the system browser, then polls until approved).
 */
export async function resolveAlmostUsefulLiveAccessToken(): Promise<string> {
	const portalOrigin = resolveAlmostUsefulPortalOriginForLiveTests();
	const mode = resolveAlmostUsefulLiveAuthMode();

	if (mode === 'env') {
		const token = process.env.ALMOSTUSEFUL_APP_ACCESS_TOKEN?.trim();
		if (!token) {
			throw new Error('ALMOSTUSEFUL_APP_ACCESS_TOKEN is required when ALMOSTUSEFUL_LIVE_AUTH=env.');
		}
		return token;
	}

	if (mode === 'paste') {
		return authenticateWithPaste(portalOrigin);
	}

	return authenticateWithDeviceFlow(portalOrigin);
}
