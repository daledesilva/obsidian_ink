import {
	ALMOSTUSEFUL_CLIENT_ID,
	ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
} from 'src/logic/almostuseful/almostuseful-constants';
import {
	buildAlmostUsefulAuthorizationCodeTokenBody,
	buildAlmostUsefulAuthorizeUrl,
} from 'src/logic/almostuseful/almostuseful-authorize-url';

//////////
//////////

describe('Almost Useful OOB authorize', () => {
	it('builds an authorize URL without redirect_uri', () => {
		const url = buildAlmostUsefulAuthorizeUrl({
			portalOrigin: 'https://account.almostuseful.xyz',
			state: 'abc',
			codeChallenge: 'challenge-abcdefghijklmnopqrstuvwxyz-012345',
		});
		expect(url).toContain('client_id=' + ALMOSTUSEFUL_CLIENT_ID);
		expect(url).toContain('display_name=' + encodeURIComponent(ALMOSTUSEFUL_CLIENT_DISPLAY_NAME));
		expect(url).not.toContain('redirect_uri');
	});

	it('posts authorization_code without redirect_uri', () => {
		const body = buildAlmostUsefulAuthorizationCodeTokenBody({
			code: 'one-time',
			codeVerifier: 'verifier',
		});
		expect(body).toEqual({
			grant_type: 'authorization_code',
			code: 'one-time',
			code_verifier: 'verifier',
			client_id: ALMOSTUSEFUL_CLIENT_ID,
		});
		expect(body.redirect_uri).toBeUndefined();
	});
});
