import { readAlmostUsefulAppJwtClaims } from 'src/logic/almostuseful/almostuseful-app-jwt';
import {
	ALMOSTUSEFUL_APP_TOKEN_TYPE,
	ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	ALMOSTUSEFUL_CLIENT_ID,
} from 'src/logic/almostuseful/almostuseful-constants';
import { writeAlmostUsefulSession } from 'src/logic/almostuseful/almostuseful-session';

/////////
/////////

/** Writes a portal token JSON body into device-local storage. */
export async function persistAlmostUsefulTokenResponse(response: {
	status: number;
	json: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	if (response.status !== 200) {
		return { ok: false, error: 'Could not finish Almost Useful login' };
	}
	const json = response.json as {
		access_token?: unknown;
		refresh_token?: unknown;
		expires_in?: unknown;
	} | null;
	if (
		!json ||
		typeof json.access_token !== 'string' ||
		typeof json.refresh_token !== 'string'
	) {
		return { ok: false, error: 'Could not finish Almost Useful login' };
	}

	const claims = readAlmostUsefulAppJwtClaims(json.access_token);
	if (!claims) {
		return { ok: false, error: 'Could not finish Almost Useful login' };
	}

	let expiresIn = 3600;
	if (typeof json.expires_in === 'number' && json.expires_in > 0) {
		expiresIn = json.expires_in;
	}

	let clientId = ALMOSTUSEFUL_CLIENT_ID;
	if (claims.cid) clientId = claims.cid;
	let displayName = ALMOSTUSEFUL_CLIENT_DISPLAY_NAME;
	if (claims.cdn) displayName = claims.cdn;

	writeAlmostUsefulSession({
		tokenType: ALMOSTUSEFUL_APP_TOKEN_TYPE,
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + expiresIn,
		grantId: claims.jti,
		userId: claims.sub,
		clientId,
		displayName,
		userEmail: null,
	});
	return { ok: true };
}
