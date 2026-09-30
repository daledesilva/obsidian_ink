import { Platform } from 'obsidian';
import { ALMOSTUSEFUL_CLIENT_DISPLAY_NAME, ALMOSTUSEFUL_CLIENT_ID } from 'src/logic/almostuseful/almostuseful-constants';
import { readOrCreateAlmostUsefulDeviceInstall } from 'src/logic/almostuseful/almostuseful-device';
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

/** Used only when the portal omits interval. Live codes use the portal's value. */
const DEFAULT_DEVICE_POLL_INTERVAL_SECONDS = 3;
/**
 * The code has only just appeared, so the website cannot have approved it yet.
 * Returning from another app skips this and polls immediately.
 */
const INITIAL_FOREGROUND_POLL_DELAY_MS = 10_000;
/** A hung device-code request must fail so Link account can be tried again. */
const DEVICE_CODE_ISSUE_TIMEOUT_MS = 20_000;
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
	const deviceInstall = readOrCreateAlmostUsefulDeviceInstall();
	let response: { status: number; json: unknown };
	// requestUrl has no abort. Racing a timer lets the button recover if the portal never answers.
	let timeoutId = 0;
	const timeout = new Promise<never>((_resolve, reject) => {
		timeoutId = window.setTimeout(() => reject(new Error('timeout')), DEVICE_CODE_ISSUE_TIMEOUT_MS);
	});
	try {
		response = await Promise.race([
			almostUsefulRequestJson({
				url: `${portalOrigin}/api/oauth/device`,
				method: 'POST',
				body: {
					client_id: ALMOSTUSEFUL_CLIENT_ID,
					display_name: ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
					device_id: deviceInstall.deviceId,
					device_label: deviceInstall.deviceLabel,
				},
			}),
			timeout,
		]);
	} catch {
		return failure;
	} finally {
		window.clearTimeout(timeoutId);
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
 * Polls the token endpoint while settings shows the code and this app is in
 * front. The first check waits, because the code has only just been shown.
 * Leaving the app cancels that wait. Coming back polls once, then on the
 * portal interval. An expired code stays on screen until Renew.
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
	let isPausedForBackground = hostDocument.visibilityState === 'hidden';
	let slowDownExtraMs = 0;
	let pollTimer: number | null = null;
	let pollInFlight: Promise<void> | null = null;

	const clearPollTimer = (): void => {
		if (pollTimer === null) return;
		hostWindow.clearTimeout(pollTimer);
		pollTimer = null;
	};

	const scheduleNextPoll = (delayMs?: number): void => {
		clearPollTimer();
		if (isStopped || isPausedForBackground) return;
		const pending = readAlmostUsefulHandoffPending();
		let intervalSeconds = DEFAULT_DEVICE_POLL_INTERVAL_SECONDS;
		if (pending) intervalSeconds = pending.intervalSeconds;
		const waitMs = delayMs ?? intervalSeconds * 1000 + slowDownExtraMs;
		pollTimer = hostWindow.setTimeout(() => {
			pollTimer = null;
			if (isPausedForBackground) return;
			void runPoll();
		}, waitMs);
	};

	/** Drop the timer. A poll must not run while Obsidian is not the front app. */
	function pauseForBackground(): void {
		isPausedForBackground = true;
		clearPollTimer();
	}

	/** The user is back. Ask now, then the interval starts again from this poll. */
	function resumeFromBackground(): void {
		if (isStopped || !isPausedForBackground) return;
		isPausedForBackground = false;
		void runPoll();
	}

	const stop = (): void => {
		if (isStopped) return;
		isStopped = true;
		clearPollTimer();
		hostWindow.removeEventListener('blur', handleBlur);
		hostWindow.removeEventListener('focus', handleFocus);
		hostDocument.removeEventListener('visibilitychange', handleVisibilityChange);
	};

	const reportExpired = (): void => {
		// Leave the stored code so settings can show it struck through until Renew.
		stop();
		callbacks.onExpired();
	};

	const executePoll = async (): Promise<void> => {
		if (isStopped) return;
		const pending = readAlmostUsefulHandoffPending();
		if (!pending) {
			stop();
			callbacks.onSignedOut();
			return;
		}
		clearPollTimer();
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
	};

	/** One poll at a time. A focus event during a poll waits for that result. */
	const runPoll = (): Promise<void> => {
		if (isStopped) return Promise.resolve();
		if (pollInFlight) return pollInFlight;
		pollInFlight = executePoll().finally(() => {
			pollInFlight = null;
		});
		return pollInFlight;
	};

	function handleBlur(): void {
		pauseForBackground();
	}

	function handleFocus(): void {
		resumeFromBackground();
	}

	function handleVisibilityChange(): void {
		if (hostDocument.visibilityState === 'hidden') {
			pauseForBackground();
			return;
		}
		resumeFromBackground();
	}

	hostWindow.addEventListener('blur', handleBlur);
	hostWindow.addEventListener('focus', handleFocus);
	hostDocument.addEventListener('visibilitychange', handleVisibilityChange);
	// Already in front: wait before the first ask. Already hidden: stay quiet
	// until focus, which polls immediately.
	if (!isPausedForBackground) scheduleNextPoll(INITIAL_FOREGROUND_POLL_DELAY_MS);

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
