//////////
//////////

const shortCodePattern = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/**
 * Normalises pasted authorisation codes from the portal continue page.
 * Short codes lose separators and uppercase; legacy long codes pass through trimmed.
 */
export function normalizeAlmostUsefulAuthorizationCode(rawCode: string): string {
	const trimmed = rawCode.trim();
	if (!trimmed) return trimmed;

	const compact = trimmed.replace(/[\s-]+/g, "").toUpperCase();
	if (shortCodePattern.test(compact)) return compact;

	return trimmed;
}

/** Example placeholder for the paste field. */
export const ALMOSTUSEFUL_AUTHORIZATION_CODE_PLACEHOLDER = "AB2-CD3";
