import { Platform } from 'obsidian';
import { normalizeAlmostUsefulAuthorizationCode } from 'src/logic/almostuseful/almostuseful-authorization-code-format';
import { createAlmostUsefulPkcePair } from 'src/logic/almostuseful/almostuseful-pkce';
import {
	buildAlmostUsefulAuthorizationCodeTokenBody,
	buildAlmostUsefulAuthorizeUrl,
} from 'src/logic/almostuseful/almostuseful-authorize-url';
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

export type AlmostUsefulLoginPhase = 'idle' | 'opening' | 'pending';

const PASTE_UI_DELAY_MS = 4000;

let almostUsefulLoginPhase: AlmostUsefulLoginPhase = 'idle';
let almostUsefulPasteUiTimer: number | null = null;

/** Current UI phase for the settings account section. */
export function getAlmostUsefulLoginPhase(): AlmostUsefulLoginPhase {
	return almostUsefulLoginPhase;
}

function clearAlmostUsefulPasteUiTimer(): void {
	if (almostUsefulPasteUiTimer === null) return;
	window.clearTimeout(almostUsefulPasteUiTimer);
	almostUsefulPasteUiTimer = null;
}

/** After Log in, wait so the paste field does not replace the Log in row until the browser has opened. */
export function scheduleAlmostUsefulPasteUi(onShowPaste: () => void): void {
	clearAlmostUsefulPasteUiTimer();
	almostUsefulPasteUiTimer = window.setTimeout(() => {
		almostUsefulPasteUiTimer = null;
		if (almostUsefulLoginPhase !== 'opening') return;
		if (!readAlmostUsefulHandoffPending()) return;
		almostUsefulLoginPhase = 'pending';
		onShowPaste();
	}, PASTE_UI_DELAY_MS);
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
	almostUsefulLoginPhase = 'opening';
	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	openAlmostUsefulBrowserUrl(
		buildAlmostUsefulAuthorizeUrl({
			portalOrigin,
			state,
			codeChallenge: pkce.challenge,
		}),
	);
}

/** Drops in-flight PKCE so the user can start a fresh browser login. */
export function cancelAlmostUsefulPendingLogin(): void {
	clearAlmostUsefulHandoffPending();
	clearAlmostUsefulPasteUiTimer();
	almostUsefulLoginPhase = 'idle';
}

/**
 * HTTPS token exchange for a pasted continue-page code. Uses the PKCE verifier
 * stored in this window; portal does not need state on the token POST.
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
	const code = normalizeAlmostUsefulAuthorizationCode(rawCode);
	if (!code) {
		return { ok: false, error: 'Paste the code from the website' };
	}

	const stored = await exchangeAlmostUsefulAuthorizationCode({
		code,
		codeVerifier: pending.codeVerifier,
	});
	if (!stored.ok) return stored;

	clearAlmostUsefulHandoffPending();
	clearAlmostUsefulPasteUiTimer();
	almostUsefulLoginPhase = 'idle';
	void startAlmostUsefulSessionRefresh();
	return { ok: true };
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
	clearAlmostUsefulPasteUiTimer();
	almostUsefulLoginPhase = 'idle';
}

async function exchangeAlmostUsefulAuthorizationCode(params: {
	code: string;
	codeVerifier: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	const response = await almostUsefulRequestJson({
		url: `${portalOrigin}/api/oauth/token`,
		method: 'POST',
		body: buildAlmostUsefulAuthorizationCodeTokenBody(params),
	});
	return persistAlmostUsefulTokenResponse(response);
}
