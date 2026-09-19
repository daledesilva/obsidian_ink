import { almostUsefulRequestJson } from 'src/logic/almostuseful/almostuseful-http';
import { persistAlmostUsefulTokenResponse } from 'src/logic/almostuseful/almostuseful-token-persist';
import {
	clearAlmostUsefulSession,
	readAlmostUsefulSession,
	resolveAlmostUsefulPortalOrigin,
} from 'src/logic/almostuseful/almostuseful-session';

/////////
/////////

const REFRESH_SKEW_SECONDS = 120;
const POLL_INTERVAL_MS = 60_000;

let almostUsefulRefreshTimer: number | null = null;

/**
 * Refreshes the portal app token before expiry. invalid_grant clears storage
 * so Settings shows Log in again (including after website revoke).
 */
export async function startAlmostUsefulSessionRefresh(): Promise<void> {
	stopAlmostUsefulSessionRefresh();
	const session = readAlmostUsefulSession();
	if (!session) return;
	await refreshAlmostUsefulAppTokenIfNeeded();
	almostUsefulRefreshTimer = window.setInterval(() => {
		void refreshAlmostUsefulAppTokenIfNeeded();
	}, POLL_INTERVAL_MS);
}

/** Stops the refresh timer on Log out. */
export function stopAlmostUsefulSessionRefresh(): void {
	if (almostUsefulRefreshTimer === null) return;
	window.clearInterval(almostUsefulRefreshTimer);
	almostUsefulRefreshTimer = null;
}

/** POSTs refresh_token when the access JWT is close to expiry. */
export async function refreshAlmostUsefulAppTokenIfNeeded(): Promise<void> {
	const session = readAlmostUsefulSession();
	if (!session) {
		stopAlmostUsefulSessionRefresh();
		return;
	}
	const nowEpoch = Math.floor(Date.now() / 1000);
	if (session.expiresAtEpochSeconds - nowEpoch > REFRESH_SKEW_SECONDS) return;

	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	const response = await almostUsefulRequestJson({
		url: `${portalOrigin}/api/oauth/token`,
		method: 'POST',
		body: {
			grant_type: 'refresh_token',
			refresh_token: session.refreshToken,
		},
	});
	if (response.status === 400 || response.status === 401) {
		clearAlmostUsefulSession();
		stopAlmostUsefulSessionRefresh();
		return;
	}
	const stored = await persistAlmostUsefulTokenResponse(response);
	if (!stored.ok) {
		clearAlmostUsefulSession();
		stopAlmostUsefulSessionRefresh();
	}
}
