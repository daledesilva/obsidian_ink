import { ALMOSTUSEFUL_APP_TOKEN_TYPE } from 'src/logic/almostuseful/almostuseful-constants';

/////////
/////////

export interface AlmostUsefulAppJwtClaims {
	sub: string;
	jti: string;
	cid?: string;
	cdn?: string;
}

/** Reads JWT payload claims without verifying (portal already signed them). */
export function readAlmostUsefulAppJwtClaims(accessToken: string): AlmostUsefulAppJwtClaims | null {
	const parts = accessToken.split('.');
	if (parts.length < 2) return null;
	try {
		const padded = padBase64Url(parts[1]);
		const json = atob(padded);
		const parsedUnknown: unknown = JSON.parse(json);
		if (!parsedUnknown || typeof parsedUnknown !== 'object') return null;
		const parsed = parsedUnknown as Record<string, unknown>;
		if (parsed.typ !== ALMOSTUSEFUL_APP_TOKEN_TYPE) return null;
		if (typeof parsed.sub !== 'string' || typeof parsed.jti !== 'string') return null;
		return {
			sub: parsed.sub,
			jti: parsed.jti,
			cid: typeof parsed.cid === 'string' ? parsed.cid : undefined,
			cdn: typeof parsed.cdn === 'string' ? parsed.cdn : undefined,
		};
	} catch {
		return null;
	}
}

/** Converts JWT base64url to atob-compatible base64. */
function padBase64Url(value: string): string {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padLength = (4 - (normalized.length % 4)) % 4;
	return `${normalized}${'='.repeat(padLength)}`;
}
