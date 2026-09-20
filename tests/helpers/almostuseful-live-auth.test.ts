/** @jest-environment node */

import {
	isAlmostUsefulAccessTokenJwt,
	resolveAlmostUsefulLiveAccessToken,
	resolveAlmostUsefulLiveAuthMode,
	buildAlmostUsefulLiveAuthorizeUrl,
} from './almostuseful-live-auth';

describe('almostuseful-live-auth', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		delete process.env.ALMOSTUSEFUL_LIVE_AUTH;
		delete process.env.ALMOSTUSEFUL_APP_ACCESS_TOKEN;
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	it('defaults to PKCE plus paste when no token env is set', () => {
		expect(resolveAlmostUsefulLiveAuthMode()).toBe('pkce');
	});

	it('uses env mode when ALMOSTUSEFUL_APP_ACCESS_TOKEN is set', () => {
		process.env.ALMOSTUSEFUL_APP_ACCESS_TOKEN = 'eyJhbGci.test';
		expect(resolveAlmostUsefulLiveAuthMode()).toBe('env');
	});

	it('detects JWT-shaped access tokens', () => {
		expect(isAlmostUsefulAccessTokenJwt('eyJhbGciOiJIUzI1NiJ9.payload.sig')).toBe(true);
		expect(isAlmostUsefulAccessTokenJwt('device-code-only')).toBe(false);
	});

	it('builds a live authorize URL without redirect_uri', () => {
		const url = buildAlmostUsefulLiveAuthorizeUrl({
			portalOrigin: 'https://account.almostuseful.xyz',
			state: 'qa',
			codeChallenge: 'abcdefghijklmnopqrstuvwxyz0123456789abcde',
		});
		expect(url).toContain('/oauth/authorize?');
		expect(url).not.toContain('redirect_uri');
		expect(url).toContain('client_id=testing');
		expect(url).toContain('display_name=Testing');
	});

	it('returns env token when ALMOSTUSEFUL_APP_ACCESS_TOKEN is set', async () => {
		process.env.ALMOSTUSEFUL_APP_ACCESS_TOKEN = 'eyJhbGci.test.token';
		await expect(resolveAlmostUsefulLiveAccessToken()).resolves.toBe('eyJhbGci.test.token');
	});
});
