import { Platform } from 'obsidian';
import { createAlmostUsefulPkcePair } from 'src/logic/almostuseful/almostuseful-pkce';
import {
	ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	ALMOSTUSEFUL_CLIENT_ID,
	ALMOSTUSEFUL_PROTOCOL_ACTION,
	ALMOSTUSEFUL_REDIRECT_URI,
} from 'src/logic/almostuseful/almostuseful-constants';
import { persistAlmostUsefulTokenResponse } from 'src/logic/almostuseful/almostuseful-token-persist';
import { almostUsefulRequestJson } from 'src/logic/almostuseful/almostuseful-http';
import {
	startAlmostUsefulSessionRefresh,
	stopAlmostUsefulSessionRefresh,
} from 'src/logic/almostuseful/almostuseful-refresh';
import {
	clearAlmostUsefulHandoffPending,
	clearAlmostUsefulSession,
	readAlmostUsefulHandoffPending,
	readAlmostUsefulSession,
	resolveAlmostUsefulPortalOrigin,
	writeAlmostUsefulHandoffPending,
} from 'src/logic/almostuseful/almostuseful-session';

/////////
/////////

export type AlmostUsefulLoginPhase = 'idle' | 'pending';

let almostUsefulLoginPhase: AlmostUsefulLoginPhase = 'idle';

/** Current UI phase for the settings account section. */
export function getAlmostUsefulLoginPhase(): AlmostUsefulLoginPhase {
	return almostUsefulLoginPhase;
}

/** Opens the portal authorize URL in the system browser. */
export function openAlmostUsefulBrowserUrl(url: string): void {
	if (Platform.isDesktop) {
		const electron = require('electron') as {
			shell: { openExternal: (target: string) => Promise<void> };
		};
		void electron.shell.openExternal(url);
		return;
	}
	window.open(url);
}

/** Starts website authorize: PKCE in device-local storage, then system browser. */
export async function startAlmostUsefulBrowserLogin(): Promise<void> {
	const pkce = await createAlmostUsefulPkcePair();
	const stateBytes = crypto.getRandomValues(new Uint8Array(16));
	let state = '';
	stateBytes.forEach((byte) => {
		state += byte.toString(16).padStart(2, '0');
	});
	writeAlmostUsefulHandoffPending({
		state,
		codeVerifier: pkce.verifier,
	});
	almostUsefulLoginPhase = 'pending';
	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	const query = new URLSearchParams({
		client_id: ALMOSTUSEFUL_CLIENT_ID,
		display_name: ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
		redirect_uri: ALMOSTUSEFUL_REDIRECT_URI,
		state,
		code_challenge: pkce.challenge,
		code_challenge_method: 'S256',
	});
	openAlmostUsefulBrowserUrl(`${portalOrigin}/oauth/authorize?${query.toString()}`);
}

/** Completes protocol return: HTTPS token exchange, never tokens from the URL. */
export async function completeAlmostUsefulProtocolHandoff(params: {
	code?: string;
	state?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const pending = readAlmostUsefulHandoffPending();
	if (!pending) {
		return { ok: false, error: 'No in-progress Almost Useful login' };
	}
	if (!params.code || !params.state) {
		return { ok: false, error: 'Missing authorize code' };
	}
	if (params.state !== pending.state) {
		return { ok: false, error: 'Login state did not match' };
	}

	const stored = await exchangeAlmostUsefulAuthorizationCode({
		code: params.code,
		codeVerifier: pending.codeVerifier,
	});
	if (!stored.ok) return stored;

	clearAlmostUsefulHandoffPending();
	almostUsefulLoginPhase = 'idle';
	void startAlmostUsefulSessionRefresh();
	return { ok: true };
}

/** Drops in-flight PKCE so the user can start a fresh browser login. */
export function cancelAlmostUsefulPendingLogin(): void {
	clearAlmostUsefulHandoffPending();
	almostUsefulLoginPhase = 'idle';
}

/**
 * Same HTTPS exchange as the protocol handler, for when a new Obsidian window
 * ate the deep link. Uses the PKCE verifier stored in this window.
 */
export async function completeAlmostUsefulPastedHandoffCode(
	rawCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const pending = readAlmostUsefulHandoffPending();
	if (!pending) {
		return {
			ok: false,
			error: 'Start Log in from this Obsidian window first, then paste the code here.',
		};
	}
	const code = rawCode.trim();
	if (!code) {
		return { ok: false, error: 'Paste the code from the authorize redirect' };
	}
	return completeAlmostUsefulProtocolHandoff({
		code,
		state: pending.state,
	});
}

/** Revokes the grant when possible, then drops local tokens. */
export function logOutAlmostUseful(): void {
	const session = readAlmostUsefulSession();
	void stopAlmostUsefulSessionRefresh();
	if (session) {
		const portalOrigin = resolveAlmostUsefulPortalOrigin();
		void almostUsefulRequestJson({
			url: `${portalOrigin}/api/oauth/grants/${session.grantId}/revoke`,
			method: 'POST',
			accessToken: session.accessToken,
		});
	}
	clearAlmostUsefulSession();
	clearAlmostUsefulHandoffPending();
	almostUsefulLoginPhase = 'idle';
}

/** POSTs authorization_code to the portal token endpoint. */
async function exchangeAlmostUsefulAuthorizationCode(params: {
	code: string;
	codeVerifier: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	const response = await almostUsefulRequestJson({
		url: `${portalOrigin}/api/oauth/token`,
		method: 'POST',
		body: {
			grant_type: 'authorization_code',
			code: params.code,
			code_verifier: params.codeVerifier,
			client_id: ALMOSTUSEFUL_CLIENT_ID,
			redirect_uri: ALMOSTUSEFUL_REDIRECT_URI,
		},
	});
	return persistAlmostUsefulTokenResponse(response);
}

export { ALMOSTUSEFUL_PROTOCOL_ACTION };
