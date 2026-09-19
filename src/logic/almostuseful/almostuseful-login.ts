import { Platform } from 'obsidian';
import { createAlmostUsefulPkcePair } from 'src/logic/almostuseful/almostuseful-pkce';
import {
	ALMOSTUSEFUL_PROTOCOL_ACTION,
	ALMOSTUSEFUL_REDIRECT_URI,
} from 'src/logic/almostuseful/almostuseful-constants';
import { almostUsefulRequestJson } from 'src/logic/almostuseful/almostuseful-http';
import {
	startAlmostUsefulSessionRefresh,
	stopAlmostUsefulSessionRefresh,
} from 'src/logic/almostuseful/almostuseful-refresh';
import {
	clearAlmostUsefulHandoffPending,
	clearAlmostUsefulSession,
	readAlmostUsefulHandoffPending,
	resolveAlmostUsefulPortalOrigin,
	writeAlmostUsefulHandoffPending,
	writeAlmostUsefulSession,
	type AlmostUsefulSession,
} from 'src/logic/almostuseful/almostuseful-session';

/////////
/////////

export type AlmostUsefulLoginPhase = 'idle' | 'pending';

let almostUsefulLoginPhase: AlmostUsefulLoginPhase = 'idle';

/** Current UI phase for the settings account section. */
export function getAlmostUsefulLoginPhase(): AlmostUsefulLoginPhase {
	return almostUsefulLoginPhase;
}

/** Opens the portal handoff URL in the system browser. */
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

/** Starts website login: PKCE in device-local storage, then system browser. */
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
		redirect_uri: ALMOSTUSEFUL_REDIRECT_URI,
		state,
		code_challenge: pkce.challenge,
		code_challenge_method: 'S256',
	});
	openAlmostUsefulBrowserUrl(`${portalOrigin}/auth/plugin-handoff?${query.toString()}`);
}

/** Completes protocol return: HTTPS session exchange, never tokens from the URL. */
export async function completeAlmostUsefulProtocolHandoff(params: {
	code?: string;
	state?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const pending = readAlmostUsefulHandoffPending();
	if (!pending) {
		return { ok: false, error: 'No in-progress Almost Useful login' };
	}
	if (!params.code || !params.state) {
		return { ok: false, error: 'Missing handoff code' };
	}
	if (params.state !== pending.state) {
		return { ok: false, error: 'Login state did not match' };
	}

	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	const response = await almostUsefulRequestJson({
		url: `${portalOrigin}/api/auth/plugin-session`,
		method: 'POST',
		body: {
			code: params.code,
			codeVerifier: pending.codeVerifier,
			redirectUri: ALMOSTUSEFUL_REDIRECT_URI,
		},
	});
	if (response.status !== 200) {
		almostUsefulLoginPhase = 'idle';
		return { ok: false, error: 'Could not finish Almost Useful login' };
	}
	const json = response.json as Partial<AlmostUsefulSession> | null;
	if (!json || typeof json.accessToken !== 'string' || typeof json.refreshToken !== 'string') {
		almostUsefulLoginPhase = 'idle';
		return { ok: false, error: 'Could not finish Almost Useful login' };
	}

	writeAlmostUsefulSession({
		accessToken: json.accessToken,
		refreshToken: json.refreshToken,
		expiresAtEpochSeconds:
			typeof json.expiresAtEpochSeconds === 'number' ? json.expiresAtEpochSeconds : 0,
		userId: typeof json.userId === 'string' ? json.userId : '',
		email: typeof json.email === 'string' ? json.email : null,
		displayName: typeof json.displayName === 'string' ? json.displayName : null,
	});
	clearAlmostUsefulHandoffPending();
	almostUsefulLoginPhase = 'idle';
	void startAlmostUsefulSessionRefresh();
	return { ok: true };
}

/** Signs out locally; does not revoke the website cookie. */
export function logOutAlmostUseful(): void {
	void stopAlmostUsefulSessionRefresh();
	clearAlmostUsefulSession();
	clearAlmostUsefulHandoffPending();
	almostUsefulLoginPhase = 'idle';
}

export { ALMOSTUSEFUL_PROTOCOL_ACTION };
