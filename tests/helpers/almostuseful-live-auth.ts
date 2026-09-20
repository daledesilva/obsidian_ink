import { createHash, randomBytes } from 'crypto';
import { exec } from 'child_process';

import { ALMOSTUSEFUL_PORTAL_ORIGIN } from 'src/logic/almostuseful/almostuseful-constants';

//////////
//////////

/** Separate portal client for live eval — not the production Ink OAuth app. */
export const ALMOSTUSEFUL_LIVE_TEST_CLIENT_ID = 'testing';
export const ALMOSTUSEFUL_LIVE_TEST_CLIENT_DISPLAY_NAME = 'Testing';

export type AlmostUsefulLiveAuthMode = 'pkce' | 'paste' | 'env';

/** How live eval obtains a portal app JWT before calling handwriting-transcription. */
export function resolveAlmostUsefulLiveAuthMode(): AlmostUsefulLiveAuthMode {
	const raw = process.env.ALMOSTUSEFUL_LIVE_AUTH?.trim().toLowerCase();
	if (raw === 'paste') return 'paste';
	if (raw === 'env' || process.env.ALMOSTUSEFUL_APP_ACCESS_TOKEN?.trim()) return 'env';
	return 'pkce';
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
			'Live Almost Useful login needs an interactive terminal to paste the authorisation code. ' +
				'Set ALMOSTUSEFUL_APP_ACCESS_TOKEN, or run with a TTY.',
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

function createLivePkcePair(): { verifier: string; challenge: string } {
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	return { verifier, challenge };
}

function createLiveOauthState(): string {
	return randomBytes(16).toString('hex');
}

export function buildAlmostUsefulLiveAuthorizeUrl(params: {
	portalOrigin: string;
	state: string;
	codeChallenge: string;
}): string {
	const query = new URLSearchParams({
		client_id: ALMOSTUSEFUL_LIVE_TEST_CLIENT_ID,
		display_name: ALMOSTUSEFUL_LIVE_TEST_CLIENT_DISPLAY_NAME,
		state: params.state,
		code_challenge: params.codeChallenge,
		code_challenge_method: 'S256',
	});
	return `${params.portalOrigin}/oauth/authorize?${query.toString()}`;
}

async function exchangeAuthorizationCode(params: {
	portalOrigin: string;
	code: string;
	codeVerifier: string;
}): Promise<string> {
	const { status, json } = await postPortalJson(params.portalOrigin, '/api/oauth/token', {
		grant_type: 'authorization_code',
		code: params.code,
		code_verifier: params.codeVerifier,
		client_id: ALMOSTUSEFUL_LIVE_TEST_CLIENT_ID,
	});
	const accessToken = typeof json.access_token === 'string' ? json.access_token : null;
	if (status >= 200 && status < 300 && accessToken) {
		return accessToken;
	}
	const error = typeof json.error === 'string' ? json.error : `HTTP ${status}`;
	throw new Error(`Authorization-code exchange failed: ${error}`);
}

async function promptForAuthorizationCodeOrJwt(): Promise<string> {
	return readPasteLine(
		'Paste the authorisation code from /oauth/authorize/continue (or an eyJ… access token), then press Enter: ',
	);
}

async function authenticateWithPkceAndPaste(
	portalOrigin: string,
	shouldOpenBrowser: boolean,
): Promise<string> {
	const pkce = createLivePkcePair();
	const state = createLiveOauthState();
	const authorizeUrl = buildAlmostUsefulLiveAuthorizeUrl({
		portalOrigin,
		state,
		codeChallenge: pkce.challenge,
	});

	if (shouldOpenBrowser) {
		console.log(
			`\n[almostuseful-live-auth] Authorize ${ALMOSTUSEFUL_LIVE_TEST_CLIENT_DISPLAY_NAME} for live eval:`,
		);
		console.log(`  ${authorizeUrl}\n`);
		openBrowser(authorizeUrl);
	} else {
		console.log(
			`\n[almostuseful-live-auth] Open this URL, then paste the continue-page code:\n  ${authorizeUrl}\n`,
		);
	}

	const pasted = await promptForAuthorizationCodeOrJwt();
	if (!pasted) {
		throw new Error('No authorisation code pasted.');
	}
	if (isAlmostUsefulAccessTokenJwt(pasted)) {
		return pasted;
	}
	return exchangeAuthorizationCode({
		portalOrigin,
		code: pasted,
		codeVerifier: pkce.verifier,
	});
}

/**
 * Resolves a portal app JWT for live eval: env token, or PKCE plus pasted
 * authorisation code (opens the system browser by default).
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

	return authenticateWithPkceAndPaste(portalOrigin, mode !== 'paste');
}
