//////////
//////////

/** Matches the portal OOB authorisation alphabet (no 0/O/1/I/L). */
export const ALMOSTUSEFUL_AUTHORIZATION_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH = 6;

const shortCodePattern = new RegExp(
	`^[${ALMOSTUSEFUL_AUTHORIZATION_CODE_ALPHABET}]{${ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH}}$`,
);

/**
 * Normalises pasted authorisation codes from the portal continue page.
 * Short codes lose separators and uppercase; legacy long codes pass through trimmed.
 */
export function normalizeAlmostUsefulAuthorizationCode(rawCode: string): string {
	const trimmed = rawCode.trim();
	if (!trimmed) return trimmed;

	const compact = trimmed.replace(/[\s-]+/g, '').toUpperCase();
	if (shortCodePattern.test(compact)) return compact;

	return trimmed;
}

/** True when the value is a canonical six-character authorisation code. */
export function isAlmostUsefulAuthorizationShortCode(value: string): boolean {
	return shortCodePattern.test(
		value.trim().toUpperCase().replace(/[\s-]+/g, ''),
	);
}

/** Splits a canonical or display code into six characters for OTP boxes. */
export function splitAlmostUsefulAuthorizationCodeCharacters(
	rawCode: string,
): string[] | null {
	const canonical = normalizeAlmostUsefulAuthorizationCode(rawCode);
	if (!isAlmostUsefulAuthorizationShortCode(canonical)) return null;
	return [...canonical];
}

/** Pulls up to six valid code characters from pasted or typed input. */
export function extractAlmostUsefulAuthorizationCodeInputCharacters(
	rawInput: string,
): string[] {
	const compact = rawInput.toUpperCase().replace(/[\s-]+/g, '');
	const characters: string[] = [];
	for (const character of compact) {
		if (!ALMOSTUSEFUL_AUTHORIZATION_CODE_ALPHABET.includes(character)) continue;
		characters.push(character);
		if (characters.length >= ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH) break;
	}
	return characters;
}

/** Example placeholder for the paste field. */
export const ALMOSTUSEFUL_AUTHORIZATION_CODE_PLACEHOLDER = 'AB2-CD3';
