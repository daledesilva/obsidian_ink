import {
	ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	ALMOSTUSEFUL_CLIENT_ID,
	ALMOSTUSEFUL_PORTAL_ORIGIN,
} from 'src/logic/almostuseful/almostuseful-constants';
import {
	ALMOSTUSEFUL_DEVICE_CODE_GRANT_TYPE,
	cancelAlmostUsefulPendingLogin,
	pollAlmostUsefulDeviceToken,
	startAlmostUsefulBrowserLogin,
	startAlmostUsefulDevicePolling,
	type AlmostUsefulDevicePoller,
} from 'src/logic/almostuseful/almostuseful-login';
import {
	readAlmostUsefulHandoffPending,
	readAlmostUsefulSession,
	writeAlmostUsefulHandoffPending,
} from 'src/logic/almostuseful/almostuseful-session';
import { startAlmostUsefulSessionRefresh } from 'src/logic/almostuseful/almostuseful-refresh';

//////////
//////////

// setupTests stubs storage as no-ops; this suite needs the handoff to round-trip.
const mockLocalStore = new Map<string, string>();
jest.mock('src/logic/utils/storage', () => ({
	__esModule: true,
	fetchLocally: (key: string) => mockLocalStore.get(key) ?? null,
	saveLocally: (key: string, value: string) => {
		mockLocalStore.set(key, value);
	},
	deleteLocally: (key: string) => {
		mockLocalStore.delete(key);
	},
	localStorageKey: (key: string) => `au_ink_${key}`,
}));

jest.mock('src/logic/almostuseful/almostuseful-refresh', () => ({
	__esModule: true,
	startAlmostUsefulSessionRefresh: jest.fn(async () => {}),
	stopAlmostUsefulSessionRefresh: jest.fn(),
}));

jest.mock('src/logic/almostuseful/almostuseful-device', () => ({
	__esModule: true,
	almostUsefulDeviceLabel: jest.fn(() => 'Test MacBook Pro'),
	readOrCreateAlmostUsefulDeviceInstall: jest.fn(() => ({
		deviceId: '0123456789abcdef0123456789abcdef',
		deviceLabel: 'Test MacBook Pro',
	})),
}));

interface MockPortalResponse {
	status: number;
	body: unknown;
}

const fetchMock = jest.fn();

function queuePortalResponses(...responses: MockPortalResponse[]): void {
	for (const response of responses) {
		fetchMock.mockImplementationOnce(async () => ({
			status: response.status,
			text: async () => JSON.stringify(response.body),
		}));
	}
}

function requestBodyOfCall(callIndex: number): Record<string, unknown> {
	const init = fetchMock.mock.calls[callIndex][1] as { body: string };
	return JSON.parse(init.body) as Record<string, unknown>;
}

function base64UrlEncode(text: string): string {
	return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeAppAccessToken(): string {
	const header = base64UrlEncode(JSON.stringify({ alg: 'HS256' }));
	const payload = base64UrlEncode(
		JSON.stringify({ typ: 'almostuseful_app', sub: 'user-1', jti: 'grant-1', cid: 'ink', cdn: 'Ink' }),
	);
	return `${header}.${payload}.signature`;
}

const deviceCodeResponse = (overrides: Record<string, unknown> = {}): MockPortalResponse => ({
	status: 200,
	body: {
		device_code: 'device-abc',
		user_code: 'WDJB-MJHT',
		verification_uri: 'https://account.almostuseful.xyz/oauth/device',
		expires_in: 120,
		interval: 5,
		...overrides,
	},
});

const tokenError = (error: string): MockPortalResponse => ({ status: 400, body: { error } });

function seedPending(overrides: Partial<Parameters<typeof writeAlmostUsefulHandoffPending>[0]> = {}): void {
	writeAlmostUsefulHandoffPending({
		deviceCode: 'device-abc',
		userCode: 'WDJB-MJHT',
		expiresAt: Date.now() + 120_000,
		intervalSeconds: 5,
		verificationUri: 'https://account.almostuseful.xyz/oauth/device',
		...overrides,
	});
}

beforeEach(() => {
	mockLocalStore.clear();
	fetchMock.mockReset();
	global.fetch = fetchMock as unknown as typeof fetch;
	jest.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
});

describe('startAlmostUsefulBrowserLogin', () => {
	it('POSTs client_id and display_name without a bearer and stores the device code', async () => {
		queuePortalResponses(deviceCodeResponse());
		const before = Date.now();

		const result = await startAlmostUsefulBrowserLogin();

		expect(result.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string> }];
		expect(url).toBe(`${ALMOSTUSEFUL_PORTAL_ORIGIN}/api/oauth/device`);
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBeUndefined();
		expect(requestBodyOfCall(0)).toEqual(
			expect.objectContaining({
				client_id: ALMOSTUSEFUL_CLIENT_ID,
				display_name: ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
				device_label: 'Test MacBook Pro',
			}),
		);
		const posted = requestBodyOfCall(0) as { device_id?: string };
		expect(posted.device_id).toMatch(/^[A-Za-z0-9_-]{16,128}$/);

		const pending = readAlmostUsefulHandoffPending();
		expect(pending).toMatchObject({
			deviceCode: 'device-abc',
			userCode: 'WDJB-MJHT',
			intervalSeconds: 5,
			verificationUri: 'https://account.almostuseful.xyz/oauth/device',
		});
		expect(pending!.expiresAt).toBeGreaterThanOrEqual(before + 120_000);
		expect(window.open).not.toHaveBeenCalled();
	});

	it('does not store or open anything when the device endpoint fails', async () => {
		queuePortalResponses({ status: 500, body: { error: 'server_error' } });

		const result = await startAlmostUsefulBrowserLogin();

		expect(result.ok).toBe(false);
		expect(readAlmostUsefulHandoffPending()).toBeNull();
		expect(window.open).not.toHaveBeenCalled();
	});
});

describe('pollAlmostUsefulDeviceToken', () => {
	it('POSTs the device_code grant', async () => {
		seedPending();
		queuePortalResponses(tokenError('authorization_pending'));

		await expect(pollAlmostUsefulDeviceToken('device-abc')).resolves.toBe('pending');
		expect(fetchMock.mock.calls[0][0]).toBe(`${ALMOSTUSEFUL_PORTAL_ORIGIN}/api/oauth/token`);
		expect(requestBodyOfCall(0)).toEqual({
			grant_type: ALMOSTUSEFUL_DEVICE_CODE_GRANT_TYPE,
			device_code: 'device-abc',
			client_id: ALMOSTUSEFUL_CLIENT_ID,
		});
		expect(readAlmostUsefulHandoffPending()).not.toBeNull();
	});

	it('maps slow_down and expired_token', async () => {
		queuePortalResponses(tokenError('slow_down'), tokenError('expired_token'));
		await expect(pollAlmostUsefulDeviceToken('device-abc')).resolves.toBe('slow_down');
		await expect(pollAlmostUsefulDeviceToken('device-abc')).resolves.toBe('expired');
	});

	it('clears the handoff on access_denied', async () => {
		seedPending();
		queuePortalResponses(tokenError('access_denied'));
		await expect(pollAlmostUsefulDeviceToken('device-abc')).resolves.toBe('denied');
		expect(readAlmostUsefulHandoffPending()).toBeNull();
	});

	it('persists tokens, clears the handoff, and starts session refresh on success', async () => {
		seedPending();
		queuePortalResponses({
			status: 200,
			body: { access_token: fakeAppAccessToken(), refresh_token: 'refresh-1', expires_in: 3600 },
		});

		await expect(pollAlmostUsefulDeviceToken('device-abc')).resolves.toBe('success');
		expect(readAlmostUsefulSession()).toMatchObject({
			accessToken: fakeAppAccessToken(),
			refreshToken: 'refresh-1',
			grantId: 'grant-1',
			userId: 'user-1',
		});
		expect(readAlmostUsefulHandoffPending()).toBeNull();
		expect(startAlmostUsefulSessionRefresh).toHaveBeenCalled();
	});
});

describe('startAlmostUsefulDevicePolling', () => {
	let poller: AlmostUsefulDevicePoller | null = null;
	const callbacks = {
		onExpired: jest.fn(),
		onSignedIn: jest.fn(),
		onSignedOut: jest.fn(),
		onError: jest.fn(),
	};

	beforeEach(() => {
		jest.useFakeTimers();
		callbacks.onExpired.mockClear();
		callbacks.onSignedIn.mockClear();
		callbacks.onSignedOut.mockClear();
		callbacks.onError.mockClear();
	});

	afterEach(() => {
		poller?.stop();
		poller = null;
	});

	it('polls every intervalSeconds while authorisation is pending', async () => {
		seedPending();
		queuePortalResponses(tokenError('authorization_pending'), tokenError('authorization_pending'));
		poller = startAlmostUsefulDevicePolling(callbacks);

		await jest.advanceTimersByTimeAsync(9_999);
		expect(fetchMock).toHaveBeenCalledTimes(0);
		await jest.advanceTimersByTimeAsync(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(5000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('waits an extra 5 seconds after slow_down', async () => {
		seedPending();
		queuePortalResponses(tokenError('slow_down'), tokenError('authorization_pending'));
		poller = startAlmostUsefulDevicePolling(callbacks);

		await jest.advanceTimersByTimeAsync(10_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(9999);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not poll in the background, then polls immediately on focus', async () => {
		seedPending();
		queuePortalResponses(tokenError('authorization_pending'), tokenError('authorization_pending'));
		poller = startAlmostUsefulDevicePolling(callbacks);

		window.dispatchEvent(new Event('blur'));
		await jest.advanceTimersByTimeAsync(30_000);
		expect(fetchMock).toHaveBeenCalledTimes(0);

		window.dispatchEvent(new Event('focus'));
		await jest.advanceTimersByTimeAsync(0);
		await Promise.resolve();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(5000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('polls immediately when the document becomes visible again', async () => {
		seedPending();
		queuePortalResponses(tokenError('authorization_pending'));
		poller = startAlmostUsefulDevicePolling(callbacks);

		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden',
		});
		document.dispatchEvent(new Event('visibilitychange'));
		await jest.advanceTimersByTimeAsync(30_000);
		expect(fetchMock).toHaveBeenCalledTimes(0);

		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'visible',
		});
		document.dispatchEvent(new Event('visibilitychange'));
		await jest.advanceTimersByTimeAsync(0);
		await Promise.resolve();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('polls immediately on pollNow and stops after success', async () => {
		seedPending();
		queuePortalResponses({
			status: 200,
			body: { access_token: fakeAppAccessToken(), refresh_token: 'refresh-1', expires_in: 3600 },
		});
		poller = startAlmostUsefulDevicePolling(callbacks);

		await poller.pollNow();
		expect(callbacks.onSignedIn).toHaveBeenCalledTimes(1);

		await jest.advanceTimersByTimeAsync(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('leaves an expired code in place and stops polling', async () => {
		seedPending();
		queuePortalResponses(tokenError('expired_token'));
		poller = startAlmostUsefulDevicePolling(callbacks);

		await poller.pollNow();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(`${ALMOSTUSEFUL_PORTAL_ORIGIN}/api/oauth/token`);
		expect(callbacks.onExpired).toHaveBeenCalledTimes(1);
		expect(readAlmostUsefulHandoffPending()?.deviceCode).toBe('device-abc');

		await jest.advanceTimersByTimeAsync(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('stops polling once the local expiry has passed without requesting a new code', async () => {
		seedPending({ expiresAt: Date.now() - 1 });
		poller = startAlmostUsefulDevicePolling(callbacks);

		await poller.pollNow();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(callbacks.onExpired).toHaveBeenCalledTimes(1);
		expect(readAlmostUsefulHandoffPending()?.userCode).toBe('WDJB-MJHT');
	});

	it('returns to signed out on access_denied', async () => {
		seedPending();
		queuePortalResponses(tokenError('access_denied'));
		poller = startAlmostUsefulDevicePolling(callbacks);

		await poller.pollNow();
		expect(callbacks.onSignedOut).toHaveBeenCalledTimes(1);
		expect(readAlmostUsefulHandoffPending()).toBeNull();
		await jest.advanceTimersByTimeAsync(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('stops polling after Cancel', async () => {
		seedPending();
		poller = startAlmostUsefulDevicePolling(callbacks);
		poller.stop();
		cancelAlmostUsefulPendingLogin();

		await jest.advanceTimersByTimeAsync(60_000);
		window.dispatchEvent(new Event('focus'));
		await jest.advanceTimersByTimeAsync(0);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(readAlmostUsefulHandoffPending()).toBeNull();
	});
});
