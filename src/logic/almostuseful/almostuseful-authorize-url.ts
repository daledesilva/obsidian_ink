import {
	ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	ALMOSTUSEFUL_CLIENT_ID,
} from 'src/logic/almostuseful/almostuseful-constants';

//////////
//////////

/** Authorize query for PKCE OOB — never includes redirect_uri. */
export function buildAlmostUsefulAuthorizeUrl(params: {
	portalOrigin: string;
	state: string;
	codeChallenge: string;
}): string {
	const query = new URLSearchParams({
		client_id: ALMOSTUSEFUL_CLIENT_ID,
		display_name: ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
		state: params.state,
		code_challenge: params.codeChallenge,
		code_challenge_method: 'S256',
	});
	return `${params.portalOrigin}/oauth/authorize?${query.toString()}`;
}

/** POSTs authorization_code to the portal token endpoint without redirect_uri. */
export function buildAlmostUsefulAuthorizationCodeTokenBody(params: {
	code: string;
	codeVerifier: string;
}): Record<string, string> {
	return {
		grant_type: 'authorization_code',
		code: params.code,
		code_verifier: params.codeVerifier,
		client_id: ALMOSTUSEFUL_CLIENT_ID,
	};
}
