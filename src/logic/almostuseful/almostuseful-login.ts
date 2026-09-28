import { Platform } from 'obsidian';
import { ALMOSTUSEFUL_CLIENT_DISPLAY_NAME, ALMOSTUSEFUL_CLIENT_ID } from 'src/logic/almostuseful/almostuseful-constants';
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
	type AlmostUsefulHandoffPending,
} from 'src/logic/almostuseful/almostuseful-session';

/////////
/////////

export const ALMOSTUSEFUL_DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

const DEFAULT_DEVICE_POLL_INTERVAL_SECONDS = 5;
// RFC 8628 §3.5: each slow_down adds 5 seconds to the poll interval for the rest of this code.
const SLOW_DOWN_EXTRA_MS = 5000;

export type AlmostUsefulDeviceTokenPollOutcome =
	| 'pending'
	| 'slow_down'
	| 'expired'
	| 'denied'
	| 'success'
	| 'error';

export interface AlmostUsefulDevicePoller {
	/** Polls immediately unless a poll or code refresh is already in flight. */
	pollNow: () => Promise<void>;
	stop: () => void;
}

/** Opens a portal URL in the system browser. */
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

/**
 * Requests a new device code and stores it device-locally, replacing any
 * previous one. Unauthenticated POST — no Bearer.
 */
export async function requestAlmostUsefulDeviceCode(): Promise<
	{ ok: true; pending: AlmostUsefulHandoffPending } | { ok: false; error: string }
> {
	const failure = { ok: false as const, error: 'Could not start Almost Useful sign-in. Try again.' };
	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	let response: { status: number; json: unknown };
	try {
		response = await almostUsefulRequestJson({
			url: `${portalOrigin}/api/oauth/device`,
			method: 'POST',
			body: {
				client_id: ALMOSTUSEFUL_CLIENT_ID,
				display_name: ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
			},
		});
	} catch {
		return failure;
	}
	if (response.status !== 200) return failure;
	const json = response.json as {
		device_code?: unknown;
		user_code?: unknown;
		verification_uri?: unknown;
		expires_in?: unknown;
		interval?: unknown;
	} | null;
	if (
		!json ||
		typeof json.device_code !== 'string' ||
		typeof json.user_code !== 'string' ||
		typeof json.verification_uri !== 'string' ||
		typeof json.expires_in !== 'number'
	) {
		return failure;
	}
	let intervalSeconds = DEFAULT_DEVICE_POLL_INTERVAL_SECONDS;
	if (typeof json.interval === 'number' && json.interval > 0) intervalSeconds = json.interval;

	const pending: AlmostUsefulHandoffPending = {
		deviceCode: json.device_code,
		userCode: json.user_code,
		expiresAt: Date.now() + json.expires_in * 1000,
		intervalSeconds,
		verificationUri: json.verification_uri,
	};
	writeAlmostUsefulHandoffPending(pending);
	return { ok: true, pending };
}

/** Starts device-code sign-in: fetch a code for settings to display. The portal opens only from Copy code or Open website. */
export async function startAlmostUsefulBrowserLogin(): Promise<
	{ ok: true; pending: AlmostUsefulHandoffPending } | { ok: false; error: string }
> {
	return requestAlmostUsefulDeviceCode();
}

/**
 * One device_code token poll. On success persists the app token, clears the
 * handoff and starts session refresh; on access_denied clears the handoff.
 */
export async function pollAlmostUsefulDeviceToken(
	deviceCode: string,
): Promise<AlmostUsefulDeviceTokenPollOutcome> {
	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	let response: { status: number; json: unknown };
	try {
		response = await almostUsefulRequestJson({
			url: `${portalOrigin}/api/oauth/token`,
			method: 'POST',
			body: {
				grant_type: ALMOSTUSEFUL_DEVICE_CODE_GRANT_TYPE,
				device_code: deviceCode,
				client_id: ALMOSTUSEFUL_CLIENT_ID,
			},
		});
	} catch {
		return 'error';
	}

	if (response.status !== 200) {
		const errorCode = (response.json as { error?: unknown } | null)?.error;
		if (errorCode === 'authorization_pending') return 'pending';
		if (errorCode === 'slow_down') return 'slow_down';
		if (errorCode === 'expired_token') return 'expired';
		if (errorCode === 'access_denied') {
			clearAlmostUsefulHandoffPending();
			return 'denied';
		}
		return 'error';
	}

	const stored = await persistAlmostUsefulTokenResponse(response);
	if (!stored.ok) return 'error';
	clearAlmostUsefulHandoffPending();
	void startAlmostUsefulSessionRefresh();
	return 'success';
}

/**
 * Polls the token endpoint while settings shows the code: every interval and on
 * window focus / visible. An expired code stays on screen until the user chooses
 * Renew; this poller does not mint a replacement.
 */
export function startAlmostUsefulDevicePolling(callbacks: {
	onExpired: () => void;
	onSignedIn: () => void;
	onSignedOut: () => void;
	onError: (message: string) => void;
}): AlmostUsefulDevicePoller {
	const hostWindow = window;
	const hostDocument = document;
	let isStopped = false;
	let isBusy = false;
	let slowDownExtraMs = 0;
	let pollTimer: number | null = null;

	const clearPollTimer = (): void => {
		if (pollTimer === null) return;
		hostWindow.clearTimeout(pollTimer);
		pollTimer = null;
	};

	const scheduleNextPoll = (): void => {
		clearPollTimer();
		if (isStopped) return;
		const pending = readAlmostUsefulHandoffPending();
		let intervalSeconds = DEFAULT_DEVICE_POLL_INTERVAL_SECONDS;
		if (pending) intervalSeconds = pending.intervalSeconds;
		pollTimer = hostWindow.setTimeout(() => {
			pollTimer = null;
			void runPoll();
		}, intervalSeconds * 1000 + slowDownExtraMs);
	};

	const stop = (): void => {
		if (isStopped) return;
		isStopped = true;
		clearPollTimer();
		hostWindow.removeEventListener('focus', handleFocus);
		hostDocument.removeEventListener('visibilitychange', handleVisibilityChange);
	};

	const reportExpired = (): void => {
		// Leave the stored code so settings can show it struck through until Renew.
		stop();
		callbacks.onExpired();
	};

	const runPoll = async (): Promise<void> => {
		if (isStopped || isBusy) return;
		const pending = readAlmostUsefulHandoffPending();
		if (!pending) {
			stop();
			callbacks.onSignedOut();
			return;
		}
		clearPollTimer();
		isBusy = true;
		try {
			if (Date.now() >= pending.expiresAt) {
				reportExpired();
				return;
			}
			const outcome = await pollAlmostUsefulDeviceToken(pending.deviceCode);
			if (isStopped) return;
			if (outcome === 'success') {
				stop();
				callbacks.onSignedIn();
				return;
			}
			if (outcome === 'denied') {
				stop();
				callbacks.onSignedOut();
				return;
			}
			if (outcome === 'expired') {
				reportExpired();
				return;
			}
			if (outcome === 'slow_down') slowDownExtraMs += SLOW_DOWN_EXTRA_MS;
			scheduleNextPoll();
		} finally {
			isBusy = false;
		}
	};

	function handleFocus(): void {
		void runPoll();
	}

	function handleVisibilityChange(): void {
		if (hostDocument.visibilityState !== 'visible') return;
		void runPoll();
	}

	hostWindow.addEventListener('focus', handleFocus);
	hostDocument.addEventListener('visibilitychange', handleVisibilityChange);
	scheduleNextPoll();

	return { pollNow: runPoll, stop };
}

/** Drops the in-flight device code so settings returns to signed out. */
export function cancelAlmostUsefulPendingLogin(): void {
	clearAlmostUsefulHandoffPending();
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
}
